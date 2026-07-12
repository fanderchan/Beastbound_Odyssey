"use strict";

const fs = require("node:fs");
const path = require("node:path");

const GM_COMMAND_ID = "gm_offline_hang_config";
const DEFAULT_REWARD_RATE_BPS = 5000;
const DEFAULT_MAX_MINUTES = 8 * 60;
const DEFAULT_BATTLE_INTERVAL_SECONDS = 30;
const DEFAULT_MIN_CLAIM_MINUTES = 5;
const MAX_LEDGER_ROWS = 100;
const MAX_SETTLEMENT_BATTLES = 10000;

function createOfflineHangDomain(ctx) {
  const {
    activeBattleRoomForAccount,
    applyOfflineTrainingExpToProfile,
    clone,
    ensureProfileForAccount,
    fail,
    gmCommandAccess,
    invalidateEncounterPermitForAccount,
    load,
    now,
    ok,
    partyForAccount,
    persistProfileForAccount,
    petEncounterAuthority,
    playerLevelRuntime,
    profileStoneCoinLimit,
    profileStoneCoins,
    profileSummaryForAccount,
    publicAccount,
    rawBackpackAssetConflict,
    randomId,
    recordGmCommandAudit,
    resolveHangOrigin,
    resolveSession,
    save,
  } = ctx;
  const rewardTables = petEncounterAuthority && petEncounterAuthority.catalog && petEncounterAuthority.catalog.dataDir
    ? loadOfflineRewardTables(petEncounterAuthority.catalog.dataDir)
    : new Map();

  function getConfig(token) {
    const prepared = prepareGm(token);
    if (!prepared.ok) {
      return prepared.result;
    }
    const config = normalizeOfflineHangConfig(prepared.data.offlineHangConfig);
    const audit = recordGmCommandAudit(prepared.data, prepared.access, true, "读取离线挂机配置");
    save(prepared.data);
    return ok({config, auditId: audit.auditId, message: "离线挂机配置已读取。"});
  }

  function updateConfig(token, payload = {}) {
    const prepared = prepareGm(token);
    if (!prepared.ok) {
      return prepared.result;
    }
    const current = normalizeOfflineHangConfig(prepared.data.offlineHangConfig);
    const validation = updatedOfflineHangConfig(current, payload, prepared.access.username, now());
    if (!validation.ok) {
      const audit = recordGmCommandAudit(prepared.data, prepared.access, false, validation.message);
      save(prepared.data);
      return fail(validation.code, validation.message, {auditId: audit.auditId});
    }
    prepared.data.offlineHangConfig = validation.config;
    const audit = recordGmCommandAudit(
      prepared.data,
      prepared.access,
      true,
      `rate=${validation.config.rewardRateBps};cap=${validation.config.maxMinutes};interval=${validation.config.battleIntervalSeconds}`,
    );
    save(prepared.data);
    return ok({
      config: publicOfflineHangConfig(validation.config),
      auditId: audit.auditId,
      message: "离线挂机配置已更新。",
    });
  }

  function status(token) {
    const prepared = preparePlayer(token);
    if (!prepared.ok) {
      return prepared.result;
    }
    const offlineHang = normalizeOfflineHangState(prepared.profile.offlineHang);
    return ok({
      config: publicOfflineHangConfig(prepared.data.offlineHangConfig),
      offlineHang: publicOfflineHangState(offlineHang, now(), prepared.data.offlineHangConfig),
      message: offlineHang.session.status === "active" ? "离线挂机收益正在累计。" : "当前没有进行中的离线挂机。",
    });
  }

  function start(token, payload = {}) {
    const prepared = preparePlayer(token, {requireWritableAssets: true});
    if (!prepared.ok) {
      return prepared.result;
    }
    if (activeBattleRoomForAccount(prepared.data, prepared.account.accountId)) {
      return fail("offline_hang_battle_active", "战斗中不能开始离线挂机。", playerPayload(prepared));
    }
    const party = partyForAccount(prepared.data, prepared.account.accountId);
    if (party && String(party.leaderAccountId || "") !== prepared.account.accountId) {
      return fail("offline_hang_party_leader_required", "队伍中只有队长可以开始离线挂机。", playerPayload(prepared));
    }
    const state = normalizeOfflineHangState(prepared.profile.offlineHang);
    if (state.session.status === "active") {
      return fail("offline_hang_already_active", "已有离线挂机正在累计，请先领取。", {
        ...playerPayload(prepared),
        offlineHang: publicOfflineHangState(state, now(), prepared.data.offlineHangConfig),
      });
    }
    const origin = resolveHangOrigin(prepared.data, prepared.account.accountId, payload);
    if (!origin.ok) {
      return fail(origin.code, origin.message, playerPayload(prepared));
    }
    const playerLevel = positiveLevel(prepared.profile.player && prepared.profile.player.level);
    const route = formalRouteAtOrigin(petEncounterAuthority && petEncounterAuthority.progressionRoutes, origin, playerLevel);
    if (!route) {
      return fail("offline_hang_formal_route_required", "需要站在适合当前等级的正式练级区才能开始离线挂机。", playerPayload(prepared));
    }
    const startedAtMs = now();
    const sessionId = `offline_${randomId()}`;
    const activePet = activeBattlePet(prepared.profile);
    const config = normalizeOfflineHangConfig(prepared.data.offlineHangConfig);
    prepared.profile.offlineHang = {
      session: {
        sessionId,
        status: "active",
        startedAt: new Date(startedAtMs).toISOString(),
        mapId: route.mapId,
        encounterZoneId: route.encounterZoneId,
        encounterGroupId: route.encounterGroupId,
        rewardTableId: route.rewardTableId,
        playerStartLevel: playerLevel,
        activePetInstanceId: String(activePet && (activePet.instanceId || activePet.petId) || ""),
        configRevision: config.revision,
        rewardRateBps: config.rewardRateBps,
        maxMinutes: config.maxMinutes,
        battleIntervalSeconds: config.battleIntervalSeconds,
        minClaimMinutes: config.minClaimMinutes,
        schemaVersion: 1,
      },
      ledger: state.ledger,
      schemaVersion: 1,
    };
    prepared.profile.hangSession = {
      ...objectOrEmpty(prepared.profile.hangSession),
      enabled: false,
      mode: "",
      pendingResume: false,
      lastStopReason: "offline_hang_started",
    };
    const persisted = persistProfileForAccount(prepared.data, prepared.account, prepared.binding, prepared.profile, now);
    save(prepared.data);
    invalidateEncounterPermitForAccount(prepared.account.accountId, "offline_hang_started");
    return ok({
      account: publicAccount(prepared.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(prepared.account, prepared.data),
      profile: clone(prepared.profile),
      config: publicOfflineHangConfig(config),
      offlineHang: publicOfflineHangState(prepared.profile.offlineHang, startedAtMs, config),
      message: "离线挂机已开始，可以安全退出游戏；回来后领取收益。",
    });
  }

  function claim(token, payload = {}) {
    const prepared = preparePlayer(token, {requireWritableAssets: true});
    if (!prepared.ok) {
      return prepared.result;
    }
    const state = normalizeOfflineHangState(prepared.profile.offlineHang);
    const requestedSessionId = String(payload.sessionId || "").trim();
    if (requestedSessionId !== "") {
      const previous = state.ledger.find((entry) => entry.sessionId === requestedSessionId);
      if (previous) {
        return ok({
          idempotent: true,
          claim: clone(previous),
          offlineHang: publicOfflineHangState(state, now(), prepared.data.offlineHangConfig),
          message: "这次离线挂机收益已经领取过了。",
        });
      }
    }
    if (state.session.status !== "active") {
      return fail("offline_hang_not_active", "当前没有可领取的离线挂机收益。", playerPayload(prepared));
    }
    if (requestedSessionId !== "" && requestedSessionId !== state.session.sessionId) {
      return fail("offline_hang_session_mismatch", "离线挂机会话已经变化，请刷新后重试。", playerPayload(prepared));
    }
    const config = offlineHangConfigForSession(state.session, prepared.data.offlineHangConfig);
    const elapsed = offlineElapsed(state.session, now(), config);
    if (elapsed.creditedMinutes < config.minClaimMinutes) {
      return fail("offline_hang_claim_too_early", `至少离线挂机${config.minClaimMinutes}分钟后才能领取。`, {
        ...playerPayload(prepared),
        offlineHang: publicOfflineHangState(state, now(), config),
      });
    }
    const battleCount = Math.min(
      MAX_SETTLEMENT_BATTLES,
      Math.floor(elapsed.creditedSeconds / config.battleIntervalSeconds * config.rewardRateBps / 10000),
    );
    if (battleCount <= 0) {
      return fail("offline_hang_no_reward", "本次离线时间还不足以产生收益。", playerPayload(prepared));
    }
    const route = routeForStoredSession(petEncounterAuthority && petEncounterAuthority.progressionRoutes, state.session);
    if (!route) {
      return fail("offline_hang_route_retired", "这处练级区已调整，请联系GM处理本次离线收益。", playerPayload(prepared));
    }
    const simulated = simulateOfflineTraining({
      battleCount,
      encounterAuthority: petEncounterAuthority,
      playerLevelRuntime,
      profile: prepared.profile,
      route,
      sessionId: state.session.sessionId,
      rewardTables,
    });
    const expResult = applyOfflineTrainingExpToProfile(
      prepared.profile,
      prepared.account.accountId,
      simulated.playerExp,
      simulated.petExp,
      simulated.petInstanceId,
    );
    if (!expResult.ok) {
      return fail(expResult.code, expResult.message, {
        ...playerPayload(prepared),
        offlineHang: publicOfflineHangState(state, now(), config),
      });
    }
    const beforeCoins = profileStoneCoins(prepared.profile);
    const grantedStoneCoins = Math.min(simulated.stoneCoins, Math.max(0, profileStoneCoinLimit - beforeCoins));
    prepared.profile.stoneCoins = beforeCoins + grantedStoneCoins;
    const claimId = `offline_claim_${randomId()}`;
    const claimedAt = new Date(now()).toISOString();
    const claimRecord = {
      claimId,
      sessionId: state.session.sessionId,
      startedAt: state.session.startedAt,
      claimedAt,
      creditedMinutes: elapsed.creditedMinutes,
      cappedMinutes: elapsed.cappedMinutes,
      rewardRateBps: config.rewardRateBps,
      battleIntervalSeconds: config.battleIntervalSeconds,
      equivalentBattles: battleCount,
      mapId: route.mapId,
      encounterZoneId: route.encounterZoneId,
      encounterGroupId: route.encounterGroupId,
      rewardTableId: route.rewardTableId,
      playerExp: simulated.playerExp,
      petExp: simulated.petExp,
      petInstanceId: simulated.petInstanceId,
      stoneCoins: grantedStoneCoins,
      stoneCoinOverflow: simulated.stoneCoins - grantedStoneCoins,
      exp: expResult.publicExp,
      schemaVersion: 1,
    };
    prepared.profile.offlineHang = {
      session: {...state.session, status: "claimed", claimId, claimedAt},
      ledger: [...state.ledger, claimRecord].slice(-MAX_LEDGER_ROWS),
      schemaVersion: 1,
    };
    const persisted = persistProfileForAccount(prepared.data, prepared.account, prepared.binding, prepared.profile, now);
    save(prepared.data);
    return ok({
      account: publicAccount(prepared.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(prepared.account, prepared.data),
      profile: clone(prepared.profile),
      claim: clone(claimRecord),
      offlineHang: publicOfflineHangState(prepared.profile.offlineHang, now(), config),
      message: `离线挂机收益已领取：${battleCount}场折算，人物经验${simulated.playerExp}，宠物经验${simulated.petExp}，石币${grantedStoneCoins}。`,
    });
  }

  function cancel(token) {
    const prepared = preparePlayer(token, {requireWritableAssets: true});
    if (!prepared.ok) {
      return prepared.result;
    }
    const state = normalizeOfflineHangState(prepared.profile.offlineHang);
    if (state.session.status !== "active") {
      return fail("offline_hang_not_active", "当前没有进行中的离线挂机。", playerPayload(prepared));
    }
    const cancelledAt = new Date(now()).toISOString();
    prepared.profile.offlineHang = {
      session: {...state.session, status: "cancelled", cancelledAt},
      ledger: state.ledger,
      schemaVersion: 1,
    };
    const persisted = persistProfileForAccount(prepared.data, prepared.account, prepared.binding, prepared.profile, now);
    save(prepared.data);
    return ok({
      account: publicAccount(prepared.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(prepared.account, prepared.data),
      profile: clone(prepared.profile),
      offlineHang: publicOfflineHangState(prepared.profile.offlineHang, now(), prepared.data.offlineHangConfig),
      message: "离线挂机已取消，本次不产生收益。",
    });
  }

  function prepareGm(token) {
    const data = load();
    const access = gmCommandAccess(data, token, GM_COMMAND_ID);
    if (!access.ok) {
      const audit = recordGmCommandAudit(data, access, false, access.message);
      if (audit.recorded !== false) {
        save(data);
      }
      return {ok: false, result: fail(access.code, access.message, {auditId: audit.auditId})};
    }
    return {ok: true, data, access};
  }

  function preparePlayer(token, options = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return {ok: false, result: fail(resolved.code, resolved.message)};
    }
    const ensured = ensureProfileForAccount(data, resolved.account, now);
    const profile = ensured.profileDoc && objectOrNull(ensured.profileDoc.profile);
    if (!profile) {
      return {ok: false, result: fail("profile_missing", "请先创建角色档案。")};
    }
    if (options.requireWritableAssets && typeof rawBackpackAssetConflict === "function") {
      const assetConflict = rawBackpackAssetConflict(profile);
      if (assetConflict) {
        return {
          ok: false,
          result: fail(assetConflict.code, assetConflict.message, {
            profileBinding: ensured.binding,
            profileSummary: profileSummaryForAccount(resolved.account, data),
          }),
        };
      }
    }
    return {
      ok: true,
      data,
      account: resolved.account,
      binding: ensured.binding,
      profile: clone(profile),
    };
  }

  function playerPayload(prepared) {
    return {
      profileBinding: prepared.binding,
      profileSummary: profileSummaryForAccount(prepared.account, prepared.data),
    };
  }

  return Object.freeze({cancel, claim, getConfig, start, status, updateConfig});
}

function simulateOfflineTraining(options) {
  const {battleCount, encounterAuthority, playerLevelRuntime, profile, route, sessionId, rewardTables} = options;
  const player = tempLevelEntry(profile.player, playerLevelRuntime);
  const pet = activeBattlePet(profile);
  const petTemp = pet ? tempLevelEntry(pet, playerLevelRuntime) : null;
  const petInstanceId = String(pet && (pet.instanceId || pet.petId) || "");
  const map = encounterAuthority.catalog.mapsById[route.mapId];
  const zone = map && map.zonesById[route.encounterZoneId];
  const cell = firstEncounterCell(zone);
  const rewardTable = rewardTables.get(route.rewardTableId);
  if (!rewardTable) {
    throw new Error(`missing offline reward table: ${route.rewardTableId}`);
  }
  let playerExp = 0;
  let petExp = 0;
  let stoneCoins = 0;
  for (let index = 0; index < battleCount; index += 1) {
    const resolved = encounterAuthority.resolve({
      mapId: route.mapId,
      position: {hasCell: true, cellX: cell[0], cellY: cell[1], moving: false},
      request: {encounterIntent: {zoneId: route.encounterZoneId, encounterGroupId: route.encounterGroupId}},
      participants: [{accountId: "offline_training", teamSnapshot: {trainingPartners: []}}],
      participantPositions: [{
        accountId: "offline_training",
        position: {mapId: route.mapId, hasCell: true, cellX: cell[0], cellY: cell[1], moving: false},
      }],
      seed: `${sessionId}:battle:${index + 1}`,
    });
    if (!resolved.ok) {
      throw new Error(`offline encounter simulation failed: ${String(resolved.code || "unknown")}`);
    }
    let playerBattleExp = 0;
    let petBattleExp = 0;
    for (const wildPet of arrayOfObjects(resolved.encounter.selectedWildPets)) {
      const base = Math.max(1, Math.trunc(Number(wildPet.expReward || 1)));
      playerBattleExp += encounterAuthority.battleExpCatalog.scaledForRecipientLevel(base, player.level, wildPet.level);
      if (petTemp) {
        petBattleExp += encounterAuthority.battleExpCatalog.scaledForRecipientLevel(base, petTemp.level, wildPet.level);
      }
    }
    playerExp += playerBattleExp;
    awardTemp(player, playerBattleExp, playerLevelRuntime);
    if (petTemp) {
      petExp += petBattleExp;
      awardTemp(petTemp, petBattleExp, playerLevelRuntime);
    }
    stoneCoins += rewardTable.averageStoneCoins;
  }
  return {playerExp, petExp, petInstanceId, stoneCoins};
}

function tempLevelEntry(value, runtime) {
  const raw = objectOrEmpty(value);
  const level = positiveLevel(raw.level);
  return {level, exp: Math.max(0, Math.trunc(Number(raw.exp || 0))), nextExp: runtime.expToNextLevel(level)};
}

function awardTemp(entry, amount, runtime) {
  const awarded = runtime.awardEntry(entry, amount);
  entry.level = awarded.level;
  entry.exp = awarded.exp;
  entry.nextExp = awarded.nextExp;
}

function loadOfflineRewardTables(dataDir) {
  const document = JSON.parse(fs.readFileSync(path.join(dataDir, "battle_rewards.json"), "utf8"));
  const result = new Map();
  for (const table of arrayOfObjects(document.rewardTables)) {
    const id = String(table.id || "").trim();
    const stone = objectOrEmpty(table.stoneCoins);
    const min = Math.max(0, Math.trunc(Number(stone.min || 0)));
    const max = Math.max(min, Math.trunc(Number(stone.max || min)));
    const chance = Number(stone.chance ?? 1);
    if (id && Number.isFinite(chance) && chance >= 0 && chance <= 1) {
      result.set(id, {averageStoneCoins: Math.round((min + max) / 2 * chance)});
    }
  }
  return result;
}

function formalRouteAtOrigin(catalog, origin, level) {
  return arrayOfObjects(catalog && catalog.routeEntries).find((entry) => (
    entry.contentType === "wild_training"
    && entry.mapId === origin.mapId
    && entry.encounterZoneId === origin.zoneId
    && entry.encounterGroupId === origin.encounterGroupId
    && entry.levelRange[0] <= level
    && entry.levelRange[1] >= level
  )) || null;
}

function routeForStoredSession(catalog, session) {
  return arrayOfObjects(catalog && catalog.routeEntries).find((entry) => (
    entry.contentType === "wild_training"
    && entry.mapId === session.mapId
    && entry.encounterZoneId === session.encounterZoneId
    && entry.encounterGroupId === session.encounterGroupId
    && entry.rewardTableId === session.rewardTableId
  )) || null;
}

function activeBattlePet(profile) {
  const activeId = String(profile && profile.activePetInstanceId || "").trim();
  return arrayOfObjects(profile && profile.petInstances).find((pet) => (
    String(pet.instanceId || pet.petId || "") === activeId && String(pet.state || "battle") === "battle"
  )) || null;
}

function updatedOfflineHangConfig(current, payload, username, nowMs) {
  const candidate = {
    rewardRateBps: own(payload, "rewardRateBps") ? strictInt(payload.rewardRateBps, 0, 10000) : current.rewardRateBps,
    maxMinutes: own(payload, "maxMinutes") ? strictInt(payload.maxMinutes, 60, 1440) : current.maxMinutes,
    battleIntervalSeconds: own(payload, "battleIntervalSeconds") ? strictInt(payload.battleIntervalSeconds, 10, 300) : current.battleIntervalSeconds,
    minClaimMinutes: own(payload, "minClaimMinutes") ? strictInt(payload.minClaimMinutes, 1, 60) : current.minClaimMinutes,
  };
  if (Object.values(candidate).some((value) => value === null)) {
    return {ok: false, code: "offline_hang_config_invalid", message: "离线挂机配置必须是允许范围内的整数。"};
  }
  if (candidate.minClaimMinutes > candidate.maxMinutes) {
    return {ok: false, code: "offline_hang_config_invalid", message: "最短领取时间不能超过离线封顶时间。"};
  }
  return {
    ok: true,
    config: {
      ...candidate,
      revision: current.revision + 1,
      updatedAt: new Date(nowMs).toISOString(),
      updatedBy: String(username || ""),
      schemaVersion: 1,
    },
  };
}

function normalizeOfflineHangConfig(value) {
  const raw = objectOrEmpty(value);
  return {
    rewardRateBps: boundedInt(raw.rewardRateBps, 0, 10000, DEFAULT_REWARD_RATE_BPS),
    maxMinutes: boundedInt(raw.maxMinutes, 60, 1440, DEFAULT_MAX_MINUTES),
    battleIntervalSeconds: boundedInt(raw.battleIntervalSeconds, 10, 300, DEFAULT_BATTLE_INTERVAL_SECONDS),
    minClaimMinutes: boundedInt(raw.minClaimMinutes, 1, 60, DEFAULT_MIN_CLAIM_MINUTES),
    revision: Math.max(1, Math.trunc(Number(raw.revision || 1))),
    updatedAt: String(raw.updatedAt || ""),
    updatedBy: String(raw.updatedBy || ""),
    schemaVersion: 1,
  };
}

function publicOfflineHangConfig(value) {
  const config = normalizeOfflineHangConfig(value);
  return {...config, rewardRatePercent: config.rewardRateBps / 100};
}

function normalizeOfflineHangState(value) {
  const raw = objectOrEmpty(value);
  const session = objectOrEmpty(raw.session);
  const status = ["active", "claimed", "cancelled"].includes(String(session.status || "")) ? String(session.status) : "idle";
  return {
    session: {
      sessionId: String(session.sessionId || ""),
      status,
      startedAt: String(session.startedAt || ""),
      mapId: String(session.mapId || ""),
      encounterZoneId: String(session.encounterZoneId || ""),
      encounterGroupId: String(session.encounterGroupId || ""),
      rewardTableId: String(session.rewardTableId || ""),
      playerStartLevel: positiveLevel(session.playerStartLevel),
      activePetInstanceId: String(session.activePetInstanceId || ""),
      configRevision: Math.max(1, Math.trunc(Number(session.configRevision || 1))),
      rewardRateBps: boundedInt(session.rewardRateBps, 0, 10000, DEFAULT_REWARD_RATE_BPS),
      maxMinutes: boundedInt(session.maxMinutes, 60, 1440, DEFAULT_MAX_MINUTES),
      battleIntervalSeconds: boundedInt(session.battleIntervalSeconds, 10, 300, DEFAULT_BATTLE_INTERVAL_SECONDS),
      minClaimMinutes: boundedInt(session.minClaimMinutes, 1, 60, DEFAULT_MIN_CLAIM_MINUTES),
      claimId: String(session.claimId || ""),
      claimedAt: String(session.claimedAt || ""),
      cancelledAt: String(session.cancelledAt || ""),
      schemaVersion: 1,
    },
    ledger: arrayOfObjects(raw.ledger).slice(-MAX_LEDGER_ROWS).map((entry) => clone(entry)),
    schemaVersion: 1,
  };
}

function publicOfflineHangState(value, nowMs, configValue) {
  const state = normalizeOfflineHangState(value);
  const elapsed = offlineElapsed(state.session, nowMs, offlineHangConfigForSession(state.session, configValue));
  return {
    session: clone(state.session),
    pending: state.session.status === "active",
    elapsedMinutes: elapsed.elapsedMinutes,
    creditedMinutes: elapsed.creditedMinutes,
    capped: elapsed.elapsedMinutes > elapsed.cappedMinutes,
    recentClaims: state.ledger.slice(-10).reverse(),
    schemaVersion: 1,
  };
}

function offlineHangConfigForSession(session, fallbackValue) {
  const fallback = normalizeOfflineHangConfig(fallbackValue);
  if (!session || String(session.sessionId || "") === "") {
    return fallback;
  }
  return normalizeOfflineHangConfig({
    rewardRateBps: session.rewardRateBps,
    maxMinutes: session.maxMinutes,
    battleIntervalSeconds: session.battleIntervalSeconds,
    minClaimMinutes: session.minClaimMinutes,
    revision: session.configRevision,
  });
}

function offlineElapsed(session, nowMs, configValue) {
  const config = normalizeOfflineHangConfig(configValue);
  const startedAtMs = Date.parse(String(session && session.startedAt || ""));
  const elapsedSeconds = Number.isFinite(startedAtMs) ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1000)) : 0;
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const cappedMinutes = Math.min(elapsedMinutes, config.maxMinutes);
  const creditedSeconds = Math.min(elapsedSeconds, config.maxMinutes * 60);
  return {elapsedMinutes, cappedMinutes, creditedMinutes: Math.floor(creditedSeconds / 60), creditedSeconds};
}

function firstEncounterCell(zone) {
  const rect = Array.isArray(zone && zone.rects) ? zone.rects[0] : null;
  if (Array.isArray(rect) && rect.length >= 4) {
    return [Math.trunc(Number(rect[0])), Math.trunc(Number(rect[1]))];
  }
  const cell = Array.isArray(zone && zone.cells) ? zone.cells[0] : null;
  if (Array.isArray(cell) && cell.length >= 2) {
    return [Math.trunc(Number(cell[0])), Math.trunc(Number(cell[1]))];
  }
  throw new Error("offline route has no encounter geometry");
}

function boundedInt(value, min, max, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

function strictInt(value, min, max) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function positiveLevel(value) {
  return Math.max(1, Math.min(140, Math.trunc(Number(value || 1))));
}

function own(value, key) {
  return value && typeof value === "object" && Object.hasOwn(value, key);
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function objectOrNull(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function arrayOfObjects(value) {
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry)) : [];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  GM_COMMAND_ID,
  createOfflineHangDomain,
  normalizeOfflineHangConfig,
  normalizeOfflineHangState,
  publicOfflineHangConfig,
  simulateOfflineTraining,
  updatedOfflineHangConfig,
};
