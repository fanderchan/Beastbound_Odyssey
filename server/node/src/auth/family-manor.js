"use strict";

const FAMILY_NAME_MIN_LENGTH = 2;
const FAMILY_NAME_MAX_LENGTH = 12;
const FAMILY_NOTICE_MAX_LENGTH = 80;
const FAMILY_MAX_MEMBERS = 100;
const MANOR_BATTLE_RECORD_LIMIT = 200;
const MANOR_WAR_RECORD_LIMIT = 120;
const MANOR_WAR_PREPARE_SECONDS = 0;
const MANOR_WAR_DURATION_SECONDS = 30 * 60;
const MANOR_WAR_MAX_PARTICIPANTS_PER_SIDE = 5;
const MANOR_WAR_STATUS_SCHEDULED = "scheduled";
const MANOR_WAR_STATUS_RESOLVED = "resolved";
const MANOR_WAR_STATUS_CANCELLED = "cancelled";

function createFamilyManorDomain(ctx) {
  const {
    accountById,
    emitServiceEvent,
    fail,
    isoNow,
    load,
    manorEntries,
    now,
    ok,
    randomId,
    resolveSession,
    save,
  } = ctx;

  function getFamilyState(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const family = familyForAccount(data, resolved.account.accountId);
    return ok({
      family: family ? publicFamily(family, data, accountById) : null,
      manors: publicManorsForAccount(data, resolved.account.accountId),
      wars: publicManorWarsForAccount(data, resolved.account.accountId),
    });
  }

  function listFamilies(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const families = Object.values(data.families)
      .filter((family) => family && family.familyId)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "zh-Hans-CN"))
      .map((family) => publicFamilySummary(family, data, accountById));
    return ok({families});
  }

  function createFamily(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    if (familyForAccount(data, resolved.account.accountId)) {
      return fail("family_already_joined", "你已经有家族了。");
    }
    const name = normalizeFamilyName(payload.name || payload.familyName || "");
    if (!name) {
      return fail("family_name_invalid", `家族名需要${FAMILY_NAME_MIN_LENGTH}-${FAMILY_NAME_MAX_LENGTH}个字。`);
    }
    const duplicate = Object.values(data.families).find((family) => (
      family && normalizeFamilyName(family.name) === name
    ));
    if (duplicate) {
      return fail("family_name_exists", "这个家族名已经被使用。");
    }
    const family = {
      familyId: `family_${randomId()}`,
      name,
      leaderAccountId: resolved.account.accountId,
      memberAccountIds: [resolved.account.accountId],
      notice: normalizeFamilyNotice(payload.notice || "欢迎来到%s。".replace("%s", name)),
      fame: 0,
      manorIds: [],
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    data.families[family.familyId] = family;
    save(data);
    emitServiceEvent({
      type: "family.update",
      targetAccountIds: family.memberAccountIds,
      family: publicFamily(family, data, accountById),
    });
    return ok({
      family: publicFamily(family, data, accountById),
      manors: publicManorsForAccount(data, resolved.account.accountId),
      message: "家族已成立。",
    });
  }

  function joinFamily(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    if (familyForAccount(data, resolved.account.accountId)) {
      return fail("family_already_joined", "你已经有家族了。");
    }
    const family = familyByPayload(data, payload);
    if (!family) {
      return fail("family_missing", "家族不存在。");
    }
    if (family.memberAccountIds.length >= FAMILY_MAX_MEMBERS) {
      return fail("family_full", "家族人数已满。");
    }
    family.memberAccountIds.push(resolved.account.accountId);
    family.updatedAt = isoNow(now);
    data.families[family.familyId] = family;
    save(data);
    emitServiceEvent({
      type: "family.update",
      targetAccountIds: family.memberAccountIds,
      family: publicFamily(family, data, accountById),
    });
    return ok({
      family: publicFamily(family, data, accountById),
      manors: publicManorsForAccount(data, resolved.account.accountId),
      message: "已加入家族。",
    });
  }

  function leaveFamily(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const family = familyForAccount(data, resolved.account.accountId);
    if (!family) {
      return fail("family_missing", "你还没有家族。");
    }
    const previousMembers = family.memberAccountIds.slice();
    const updatedAt = isoNow(now);
    removeAccountFromActiveManorWars(data, resolved.account.accountId, updatedAt, manorById);
    family.memberAccountIds = family.memberAccountIds.filter((accountId) => accountId !== resolved.account.accountId);
    let message = "已离开家族。";
    if (family.memberAccountIds.length <= 0) {
      cancelActiveManorWarsForFamily(data, family.familyId, updatedAt, "family_disbanded");
      releaseFamilyManors(data, family.familyId);
      delete data.families[family.familyId];
      message = "家族已解散。";
    } else {
      if (family.leaderAccountId === resolved.account.accountId) {
        family.leaderAccountId = family.memberAccountIds[0];
        message = "已离开家族，族长已转交。";
      }
      family.updatedAt = updatedAt;
      data.families[family.familyId] = family;
      ensureActiveWarParticipant(data, family, updatedAt, manorById);
    }
    save(data);
    emitServiceEvent({
      type: "family.update",
      targetAccountIds: previousMembers,
      family: data.families[family.familyId] ? publicFamily(data.families[family.familyId], data, accountById) : null,
    });
    return ok({
      family: null,
      manors: publicManorsForAccount(data, resolved.account.accountId),
      message,
    });
  }

  function listManors(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    return ok({
      family: familyForAccount(data, resolved.account.accountId)
        ? publicFamilySummary(familyForAccount(data, resolved.account.accountId), data, accountById)
        : null,
      manors: publicManorsForAccount(data, resolved.account.accountId),
      wars: publicManorWarsForAccount(data, resolved.account.accountId),
    });
  }

  function challengeManor(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const family = familyForAccount(data, resolved.account.accountId);
    if (!family) {
      return fail("family_missing", "请先加入家族。");
    }
    if (family.leaderAccountId !== resolved.account.accountId) {
      return fail("family_leader_required", "只有族长可以发起庄园战。");
    }
    if (uniqueStrings(family.manorIds).length > 0) {
      return fail("manor_family_already_owns", "一个家族当前只能占领一个庄园。");
    }
    const familyWar = activeManorWarForFamily(data, family.familyId);
    if (familyWar) {
      return fail("manor_family_war_active", "你的家族已有进行中的庄园战。", {
        war: publicManorWar(familyWar, family.familyId, resolved.account.accountId),
      });
    }
    const manorId = normalizeManorId(payload.manorId || payload.id || "");
    const manor = manorById(manorId);
    if (!manor) {
      return fail("manor_missing", "庄园不存在。");
    }
    const activeWar = activeManorWarFor(data, manorId);
    if (activeWar) {
      return fail("manor_war_active", "这个庄园已有进行中的庄园战。", {
        war: publicManorWar(activeWar, family.familyId, resolved.account.accountId),
      });
    }
    const manorState = manorStateFor(data, manorId);
    if (manorState.ownerFamilyId === family.familyId) {
      return fail("manor_already_owned", "这个庄园已经由你的家族占领。");
    }
    const defenderFamily = manorState.ownerFamilyId ? data.families[manorState.ownerFamilyId] || null : null;
    const declaredAt = isoNow(now);
    const startsAt = isoAfter(now, MANOR_WAR_PREPARE_SECONDS);
    const endsAt = isoAfter(now, MANOR_WAR_PREPARE_SECONDS + MANOR_WAR_DURATION_SECONDS);
    const war = {
      warId: `manor_war_${randomId()}`,
      manorId,
      manorName: String(manor.name || manor.label || manorId),
      challengerFamilyId: family.familyId,
      challengerFamilyName: family.name,
      defenderFamilyId: defenderFamily ? defenderFamily.familyId : "",
      defenderFamilyName: defenderFamily ? defenderFamily.name : "庄园守备队",
      challengerParticipantAccountIds: [resolved.account.accountId],
      defenderParticipantAccountIds: [],
      challengerPower: 0,
      defenderPower: 0,
      status: MANOR_WAR_STATUS_SCHEDULED,
      declaredAt,
      startsAt,
      endsAt,
      resolvedAt: "",
      battleId: "",
      winnerFamilyId: "",
      winnerFamilyName: "",
      result: "",
      schemaVersion: 1,
    };
    syncManorWarPower(data, war, manor);
    data.manorWars.push(war);
    while (data.manorWars.length > MANOR_WAR_RECORD_LIMIT) {
      data.manorWars.shift();
    }
    save(data);
    const targets = Array.from(new Set(family.memberAccountIds.concat(defenderFamily ? defenderFamily.memberAccountIds : [])));
    emitServiceEvent({
      type: "manor.war.scheduled",
      targetAccountIds: targets,
      war: publicManorWar(war, family.familyId, resolved.account.accountId),
      manor: publicManor(manor, data, family.familyId, resolved.account.accountId),
    });
    return ok({
      war: publicManorWar(war, family.familyId, resolved.account.accountId),
      family: publicFamily(data.families[family.familyId], data, accountById),
      manor: publicManor(manor, data, family.familyId, resolved.account.accountId),
      manors: publicManorsForAccount(data, resolved.account.accountId),
      wars: publicManorWarsForAccount(data, resolved.account.accountId),
      message: "庄园战已登记，族长可在战期内开战结算。",
    });
  }

  function resolveManorWar(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const family = familyForAccount(data, resolved.account.accountId);
    if (!family) {
      return fail("family_missing", "请先加入家族。");
    }
    if (family.leaderAccountId !== resolved.account.accountId) {
      return fail("family_leader_required", "只有族长可以开战结算。");
    }
    const war = manorWarByPayload(data, payload);
    if (!war) {
      return fail("manor_war_missing", "没有找到进行中的庄园战。");
    }
    if (war.status !== MANOR_WAR_STATUS_SCHEDULED) {
      return fail("manor_war_closed", "这场庄园战已经结束。", {
        war: publicManorWar(war, family.familyId, resolved.account.accountId),
      });
    }
    if (family.familyId !== war.challengerFamilyId && family.familyId !== war.defenderFamilyId) {
      return fail("manor_war_family_mismatch", "只有参战家族族长可以开战结算。");
    }
    const manor = manorById(war.manorId);
    if (!manor) {
      return fail("manor_missing", "庄园不存在。");
    }
    const startsAtMs = Date.parse(String(war.startsAt || ""));
    if (Number.isFinite(startsAtMs) && startsAtMs > now()) {
      return fail("manor_war_not_ready", "庄园战尚未开始。", {
        war: publicManorWar(war, family.familyId, resolved.account.accountId),
      });
    }
    const challengerFamily = data.families[war.challengerFamilyId] || null;
    if (!challengerFamily) {
      war.status = MANOR_WAR_STATUS_CANCELLED;
      war.resolvedAt = isoNow(now);
      war.result = "challenger_missing";
      save(data);
      return fail("manor_war_challenger_missing", "挑战家族已经不存在，庄园战取消。", {
        war: publicManorWar(war, family.familyId, resolved.account.accountId),
      });
    }
    const defenderFamily = war.defenderFamilyId ? data.families[war.defenderFamilyId] || null : null;
    syncManorWarPower(data, war, manor);
    const challengerPower = Math.max(0, Math.trunc(Number(war.challengerPower || 0)));
    if (challengerPower <= 0) {
      return fail("manor_war_no_challenger", "挑战方还没有参战成员。", {
        war: publicManorWar(war, family.familyId, resolved.account.accountId),
      });
    }
    const defenderPower = Math.max(1, Math.trunc(Number(war.defenderPower || 0)));
    const victory = challengerPower >= defenderPower;
    const resolvedAt = isoNow(now);
    const battle = {
      battleId: `manor_battle_${randomId()}`,
      warId: war.warId,
      manorId: war.manorId,
      manorName: String(manor.name || manor.label || war.manorId),
      challengerFamilyId: challengerFamily.familyId,
      challengerFamilyName: challengerFamily.name,
      defenderFamilyId: defenderFamily ? defenderFamily.familyId : "",
      defenderFamilyName: defenderFamily ? defenderFamily.name : "庄园守备队",
      challengerPower,
      defenderPower,
      winnerFamilyId: victory ? challengerFamily.familyId : (defenderFamily ? defenderFamily.familyId : ""),
      winnerFamilyName: victory ? challengerFamily.name : (defenderFamily ? defenderFamily.name : "庄园守备队"),
      result: victory ? "challenger_win" : "defender_win",
      createdAt: resolvedAt,
      schemaVersion: 1,
    };
    war.status = MANOR_WAR_STATUS_RESOLVED;
    war.resolvedAt = resolvedAt;
    war.battleId = battle.battleId;
    war.challengerPower = challengerPower;
    war.defenderPower = defenderPower;
    war.winnerFamilyId = battle.winnerFamilyId;
    war.winnerFamilyName = battle.winnerFamilyName;
    war.result = battle.result;
    if (victory) {
      occupyManor(data, manor, challengerFamily, defenderFamily, resolvedAt);
      challengerFamily.fame = Math.max(0, Math.trunc(Number(challengerFamily.fame || 0))) + 20;
      challengerFamily.updatedAt = resolvedAt;
      data.families[challengerFamily.familyId] = challengerFamily;
    } else {
      challengerFamily.fame = Math.max(0, Math.trunc(Number(challengerFamily.fame || 0))) + 3;
      challengerFamily.updatedAt = resolvedAt;
      data.families[challengerFamily.familyId] = challengerFamily;
    }
    data.manorBattles.push(battle);
    while (data.manorBattles.length > MANOR_BATTLE_RECORD_LIMIT) {
      data.manorBattles.shift();
    }
    save(data);
    const targets = Array.from(new Set(challengerFamily.memberAccountIds.concat(defenderFamily ? defenderFamily.memberAccountIds : [])));
    emitServiceEvent({
      type: "manor.battle",
      targetAccountIds: targets,
      battle: publicManorBattle(battle),
      manor: publicManor(manor, data, family.familyId, resolved.account.accountId),
      war: publicManorWar(war, family.familyId, resolved.account.accountId),
    });
    return ok({
      battle: publicManorBattle(battle),
      war: publicManorWar(war, family.familyId, resolved.account.accountId),
      family: publicFamily(data.families[family.familyId], data, accountById),
      manor: publicManor(manor, data, family.familyId, resolved.account.accountId),
      manors: publicManorsForAccount(data, resolved.account.accountId),
      wars: publicManorWarsForAccount(data, resolved.account.accountId),
      message: victory ? "庄园战胜利，家族已占领庄园。" : "庄园战失败，家族气势略有提升。",
    });
  }

  function enterManorWar(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const family = familyForAccount(data, resolved.account.accountId);
    if (!family) {
      return fail("family_missing", "请先加入家族。");
    }
    const war = manorWarByPayload(data, payload);
    if (!war) {
      return fail("manor_war_missing", "没有找到进行中的庄园战。");
    }
    if (war.status !== MANOR_WAR_STATUS_SCHEDULED) {
      return fail("manor_war_closed", "这场庄园战已经结束。", {
        war: publicManorWar(war, family.familyId, resolved.account.accountId),
      });
    }
    const side = warSideForFamily(war, family.familyId);
    if (side === "") {
      return fail("manor_war_family_mismatch", "只有参战家族成员可以加入这场庄园战。");
    }
    const participants = participantListForSide(war, side);
    if (participants.includes(resolved.account.accountId)) {
      return ok(manorWarActionPayload(data, family, resolved.account.accountId, war, "你已经在参战名单中。"));
    }
    if (participants.length >= MANOR_WAR_MAX_PARTICIPANTS_PER_SIDE) {
      return fail("manor_war_side_full", "本方参战人数已满。", {
        war: publicManorWar(war, family.familyId, resolved.account.accountId),
      });
    }
    setParticipantListForSide(war, side, participants.concat([resolved.account.accountId]));
    war.updatedAt = isoNow(now);
    syncManorWarPower(data, war, manorById(war.manorId));
    save(data);
    emitManorWarUpdate(data, war, family, resolved.account.accountId);
    return ok(manorWarActionPayload(data, family, resolved.account.accountId, war, "已加入庄园战参战名单。"));
  }

  function leaveManorWar(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const family = familyForAccount(data, resolved.account.accountId);
    if (!family) {
      return fail("family_missing", "请先加入家族。");
    }
    const war = manorWarByPayload(data, payload);
    if (!war) {
      return fail("manor_war_missing", "没有找到进行中的庄园战。");
    }
    if (war.status !== MANOR_WAR_STATUS_SCHEDULED) {
      return fail("manor_war_closed", "这场庄园战已经结束。", {
        war: publicManorWar(war, family.familyId, resolved.account.accountId),
      });
    }
    const side = warSideForFamily(war, family.familyId);
    if (side === "") {
      return fail("manor_war_family_mismatch", "只有参战家族成员可以退出这场庄园战。");
    }
    const participants = participantListForSide(war, side);
    if (!participants.includes(resolved.account.accountId)) {
      return fail("manor_war_not_entered", "你还没有加入这场庄园战。", {
        war: publicManorWar(war, family.familyId, resolved.account.accountId),
      });
    }
    if (side === "challenger" && participants.length <= 1) {
      return fail("manor_war_last_challenger", "挑战方至少保留一名参战成员。", {
        war: publicManorWar(war, family.familyId, resolved.account.accountId),
      });
    }
    setParticipantListForSide(war, side, participants.filter((accountId) => accountId !== resolved.account.accountId));
    war.updatedAt = isoNow(now);
    syncManorWarPower(data, war, manorById(war.manorId));
    save(data);
    emitManorWarUpdate(data, war, family, resolved.account.accountId);
    return ok(manorWarActionPayload(data, family, resolved.account.accountId, war, "已退出庄园战参战名单。"));
  }

  function publicManorsForAccount(data, accountId) {
    const family = familyForAccount(data, accountId);
    const familyId = family ? family.familyId : "";
    return manorEntries().map((manor) => publicManor(manor, data, familyId, accountId));
  }

  function publicManorWarsForAccount(data, accountId) {
    const family = familyForAccount(data, accountId);
    const familyId = family ? family.familyId : "";
    return normalizedManorWars(data.manorWars)
      .filter((war) => war.status !== MANOR_WAR_STATUS_CANCELLED)
      .slice(-20)
      .reverse()
      .map((war) => publicManorWar(war, familyId, accountId));
  }

  function manorWarActionPayload(data, family, accountId, war, message) {
    const manor = manorById(war.manorId);
    return {
      war: publicManorWar(war, family.familyId, accountId),
      family: publicFamily(data.families[family.familyId], data, accountById),
      manor: manor ? publicManor(manor, data, family.familyId, accountId) : {},
      manors: publicManorsForAccount(data, accountId),
      wars: publicManorWarsForAccount(data, accountId),
      message,
    };
  }

  function emitManorWarUpdate(data, war, family, accountId) {
    const challengerFamily = data.families[war.challengerFamilyId] || null;
    const defenderFamily = war.defenderFamilyId ? data.families[war.defenderFamilyId] || null : null;
    const targets = Array.from(new Set(
      (challengerFamily ? challengerFamily.memberAccountIds : [])
        .concat(defenderFamily ? defenderFamily.memberAccountIds : [])
    ));
    const manor = manorById(war.manorId);
    emitServiceEvent({
      type: "manor.war.update",
      targetAccountIds: targets,
      war: publicManorWar(war, family.familyId, accountId),
      manor: manor ? publicManor(manor, data, family.familyId, accountId) : {},
    });
  }

  function manorById(manorId) {
    return manorEntries().find((manor) => normalizeManorId(manor.id) === manorId) || null;
  }

  return {
    getFamilyState,
    listFamilies,
    createFamily,
    joinFamily,
    leaveFamily,
    listManors,
    challengeManor,
    enterManorWar,
    leaveManorWar,
    resolveManorWar,
  };
}

function familyForAccount(data, accountId) {
  const normalizedAccountId = String(accountId || "").trim();
  if (!normalizedAccountId) {
    return null;
  }
  return Object.values(objectOrEmpty(data && data.families)).find((family) => (
    family &&
    Array.isArray(family.memberAccountIds) &&
    family.memberAccountIds.includes(normalizedAccountId)
  )) || null;
}

function familyOwnsManor(data, accountId, manorId) {
  const family = familyForAccount(data, accountId);
  if (!family) {
    return false;
  }
  const state = manorStateFor(data, manorId);
  return state.ownerFamilyId === family.familyId;
}

function familyByPayload(data, payload = {}) {
  const familyId = String(payload.familyId || payload.id || "").trim();
  if (familyId && data.families[familyId]) {
    return data.families[familyId];
  }
  const familyName = normalizeFamilyName(payload.familyName || payload.name || "");
  if (!familyName) {
    return null;
  }
  return Object.values(data.families).find((family) => normalizeFamilyName(family.name) === familyName) || null;
}

function publicFamily(family, data, accountById) {
  const summary = publicFamilySummary(family, data, accountById);
  return {
    ...summary,
    notice: String(family.notice || ""),
    members: family.memberAccountIds.map((accountId) => publicFamilyMember(accountId, family, data, accountById)).filter(Boolean),
  };
}

function publicFamilySummary(family, data, accountById) {
  const leader = accountById(data, family.leaderAccountId) || {};
  return {
    familyId: family.familyId,
    name: family.name,
    leaderAccountId: family.leaderAccountId,
    leaderUsername: String(leader.username || ""),
    leaderDisplayName: String(leader.displayName || ""),
    memberCount: Array.isArray(family.memberAccountIds) ? family.memberAccountIds.length : 0,
    maxMembers: FAMILY_MAX_MEMBERS,
    fame: Math.max(0, Math.trunc(Number(family.fame || 0))),
    manorIds: Array.isArray(family.manorIds) ? family.manorIds.slice() : [],
    createdAt: family.createdAt || "",
    updatedAt: family.updatedAt || "",
    schemaVersion: 1,
  };
}

function publicFamilyMember(accountId, family, data, accountById) {
  const account = accountById(data, accountId);
  if (!account) {
    return null;
  }
  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    role: account.accountId === family.leaderAccountId ? "leader" : "member",
    schemaVersion: 1,
  };
}

function publicManor(manor, data, viewerFamilyId = "", viewerAccountId = "") {
  const manorId = normalizeManorId(manor.id);
  const state = manorStateFor(data, manorId);
  const activeWar = activeManorWarFor(data, manorId);
  return {
    manorId,
    name: String(manor.name || manor.label || manorId),
    village: String(manor.village || ""),
    element: String(manor.element || ""),
    shopId: String(manor.shopId || ""),
    neutralPower: neutralManorPower(manor),
    ownerFamilyId: state.ownerFamilyId,
    ownerFamilyName: state.ownerFamilyName,
    occupiedAt: state.occupiedAt,
    isOwnedByViewerFamily: viewerFamilyId !== "" && state.ownerFamilyId === viewerFamilyId,
    activeWar: activeWar ? publicManorWar(activeWar, viewerFamilyId, viewerAccountId) : null,
    schemaVersion: 1,
  };
}

function publicManorBattle(battle) {
  return {
    battleId: battle.battleId,
    warId: String(battle.warId || ""),
    manorId: battle.manorId,
    manorName: battle.manorName,
    challengerFamilyId: battle.challengerFamilyId,
    challengerFamilyName: battle.challengerFamilyName,
    defenderFamilyId: battle.defenderFamilyId,
    defenderFamilyName: battle.defenderFamilyName,
    challengerPower: battle.challengerPower,
    defenderPower: battle.defenderPower,
    winnerFamilyId: battle.winnerFamilyId,
    winnerFamilyName: battle.winnerFamilyName,
    result: battle.result,
    createdAt: battle.createdAt,
    schemaVersion: 1,
  };
}

function publicManorWar(war, viewerFamilyId = "", viewerAccountId = "") {
  const status = String(war.status || MANOR_WAR_STATUS_SCHEDULED);
  const challengerParticipants = uniqueStrings(war.challengerParticipantAccountIds);
  const defenderParticipants = uniqueStrings(war.defenderParticipantAccountIds);
  const normalizedViewerAccountId = String(viewerAccountId || "").trim();
  const viewerParticipantSide = challengerParticipants.includes(normalizedViewerAccountId)
    ? "challenger"
    : (defenderParticipants.includes(normalizedViewerAccountId) ? "defender" : "");
  const viewerFamilySide = viewerFamilyId !== "" && String(war.challengerFamilyId || "") === viewerFamilyId
    ? "challenger"
    : (viewerFamilyId !== "" && String(war.defenderFamilyId || "") === viewerFamilyId ? "defender" : "");
  return {
    warId: String(war.warId || ""),
    manorId: String(war.manorId || ""),
    manorName: String(war.manorName || ""),
    challengerFamilyId: String(war.challengerFamilyId || ""),
    challengerFamilyName: String(war.challengerFamilyName || ""),
    defenderFamilyId: String(war.defenderFamilyId || ""),
    defenderFamilyName: String(war.defenderFamilyName || "庄园守备队"),
    challengerPower: Math.max(0, Math.trunc(Number(war.challengerPower || 0))),
    defenderPower: Math.max(0, Math.trunc(Number(war.defenderPower || 0))),
    status,
    declaredAt: String(war.declaredAt || ""),
    startsAt: String(war.startsAt || ""),
    endsAt: String(war.endsAt || ""),
    resolvedAt: String(war.resolvedAt || ""),
    battleId: String(war.battleId || ""),
    winnerFamilyId: String(war.winnerFamilyId || ""),
    winnerFamilyName: String(war.winnerFamilyName || ""),
    result: String(war.result || ""),
    isViewerChallenger: viewerFamilyId !== "" && String(war.challengerFamilyId || "") === viewerFamilyId,
    isViewerDefender: viewerFamilyId !== "" && String(war.defenderFamilyId || "") === viewerFamilyId,
    viewerFamilySide,
    viewerParticipantSide,
    challengerParticipantCount: challengerParticipants.length,
    defenderParticipantCount: defenderParticipants.length,
    maxParticipantsPerSide: MANOR_WAR_MAX_PARTICIPANTS_PER_SIDE,
    canEnterByViewerFamily: status === MANOR_WAR_STATUS_SCHEDULED
      && viewerFamilySide !== ""
      && viewerParticipantSide === ""
      && participantListForSide(war, viewerFamilySide).length < MANOR_WAR_MAX_PARTICIPANTS_PER_SIDE,
    canLeaveByViewerFamily: status === MANOR_WAR_STATUS_SCHEDULED
      && viewerParticipantSide !== ""
      && !(viewerParticipantSide === "challenger" && challengerParticipants.length <= 1),
    canResolveByViewerFamily: status === MANOR_WAR_STATUS_SCHEDULED
      && viewerFamilyId !== ""
      && (String(war.challengerFamilyId || "") === viewerFamilyId || String(war.defenderFamilyId || "") === viewerFamilyId),
    schemaVersion: 1,
  };
}

function manorStateFor(data, manorId) {
  const normalizedManorId = normalizeManorId(manorId);
  const state = objectOrEmpty(data && data.manors)[normalizedManorId] || {};
  return {
    manorId: normalizedManorId,
    ownerFamilyId: String(state.ownerFamilyId || ""),
    ownerFamilyName: String(state.ownerFamilyName || ""),
    occupiedAt: String(state.occupiedAt || ""),
    updatedAt: String(state.updatedAt || ""),
    schemaVersion: 1,
  };
}

function syncManorWarPower(data, war, manor) {
  if (!war || !manor) {
    return;
  }
  const challengerFamily = objectOrEmpty(data.families)[war.challengerFamilyId] || null;
  const defenderFamily = war.defenderFamilyId ? objectOrEmpty(data.families)[war.defenderFamilyId] || null : null;
  const challengerParticipants = participantListForSide(war, "challenger")
    .filter((accountId) => challengerFamily && uniqueStrings(challengerFamily.memberAccountIds).includes(accountId))
    .slice(0, MANOR_WAR_MAX_PARTICIPANTS_PER_SIDE);
  const defenderParticipants = participantListForSide(war, "defender")
    .filter((accountId) => defenderFamily && uniqueStrings(defenderFamily.memberAccountIds).includes(accountId))
    .slice(0, MANOR_WAR_MAX_PARTICIPANTS_PER_SIDE);
  setParticipantListForSide(war, "challenger", challengerParticipants);
  setParticipantListForSide(war, "defender", defenderParticipants);
  const challengerPower = familyBattlePowerForAccounts(data, challengerFamily, challengerParticipants);
  const defenderParticipantPower = familyBattlePowerForAccounts(data, defenderFamily, defenderParticipants);
  war.challengerPower = challengerPower;
  war.defenderPower = defenderFamily
    ? Math.max(defenderParticipantPower, neutralManorPower(manor)) + manorDefenseBonus(manor)
    : neutralManorPower(manor);
}

function familyBattlePowerForAccounts(data, family, accountIds) {
  if (!family || !Array.isArray(accountIds)) {
    return 0;
  }
  const familyMemberIds = uniqueStrings(family.memberAccountIds);
  let total = 0;
  let counted = 0;
  for (const accountId of uniqueStrings(accountIds)) {
    if (!familyMemberIds.includes(accountId)) {
      continue;
    }
    const account = Object.values(objectOrEmpty(data.accounts)).find((entry) => entry && entry.accountId === accountId) || null;
    if (!account) {
      continue;
    }
    total += accountBattlePower(data, account);
    counted += 1;
    if (counted >= MANOR_WAR_MAX_PARTICIPANTS_PER_SIDE) {
      break;
    }
  }
  return Math.max(0, Math.round(total));
}

function participantListForSide(war, side) {
  if (side === "challenger") {
    return uniqueStrings(war.challengerParticipantAccountIds);
  }
  if (side === "defender") {
    return uniqueStrings(war.defenderParticipantAccountIds);
  }
  return [];
}

function setParticipantListForSide(war, side, accountIds) {
  if (side === "challenger") {
    war.challengerParticipantAccountIds = uniqueStrings(accountIds).slice(0, MANOR_WAR_MAX_PARTICIPANTS_PER_SIDE);
  } else if (side === "defender") {
    war.defenderParticipantAccountIds = uniqueStrings(accountIds).slice(0, MANOR_WAR_MAX_PARTICIPANTS_PER_SIDE);
  }
}

function warSideForFamily(war, familyId) {
  const normalizedFamilyId = String(familyId || "").trim();
  if (normalizedFamilyId && String(war.challengerFamilyId || "") === normalizedFamilyId) {
    return "challenger";
  }
  if (normalizedFamilyId && String(war.defenderFamilyId || "") === normalizedFamilyId) {
    return "defender";
  }
  return "";
}

function removeAccountFromActiveManorWars(data, accountId, updatedAt, manorByIdFn) {
  const normalizedAccountId = String(accountId || "").trim();
  if (!normalizedAccountId) {
    return;
  }
  for (const war of normalizedManorWars(data.manorWars)) {
    if (!war || war.status !== MANOR_WAR_STATUS_SCHEDULED) {
      continue;
    }
    const nextChallengers = participantListForSide(war, "challenger").filter((id) => id !== normalizedAccountId);
    const nextDefenders = participantListForSide(war, "defender").filter((id) => id !== normalizedAccountId);
    if (nextChallengers.length !== participantListForSide(war, "challenger").length || nextDefenders.length !== participantListForSide(war, "defender").length) {
      setParticipantListForSide(war, "challenger", nextChallengers);
      setParticipantListForSide(war, "defender", nextDefenders);
      war.updatedAt = updatedAt;
      syncManorWarPower(data, war, manorByIdFn ? manorByIdFn(war.manorId) : null);
    }
  }
}

function cancelActiveManorWarsForFamily(data, familyId, updatedAt, result) {
  const normalizedFamilyId = String(familyId || "").trim();
  if (!normalizedFamilyId) {
    return;
  }
  for (const war of normalizedManorWars(data.manorWars)) {
    if (!war || war.status !== MANOR_WAR_STATUS_SCHEDULED) {
      continue;
    }
    if (war.challengerFamilyId !== normalizedFamilyId && war.defenderFamilyId !== normalizedFamilyId) {
      continue;
    }
    war.status = MANOR_WAR_STATUS_CANCELLED;
    war.resolvedAt = updatedAt;
    war.updatedAt = updatedAt;
    war.result = result || "cancelled";
  }
}

function ensureActiveWarParticipant(data, family, updatedAt, manorByIdFn) {
  if (!family || !family.familyId || !family.leaderAccountId) {
    return;
  }
  for (const war of normalizedManorWars(data.manorWars)) {
    if (!war || war.status !== MANOR_WAR_STATUS_SCHEDULED) {
      continue;
    }
    const side = warSideForFamily(war, family.familyId);
    if (side !== "challenger") {
      continue;
    }
    if (participantListForSide(war, side).length <= 0) {
      setParticipantListForSide(war, side, [family.leaderAccountId]);
      war.updatedAt = updatedAt;
      syncManorWarPower(data, war, manorByIdFn ? manorByIdFn(war.manorId) : null);
    }
  }
}

function manorWarByPayload(data, payload = {}) {
  const warId = String(payload.warId || payload.id || "").trim();
  const wars = normalizedManorWars(data.manorWars);
  if (warId) {
    return wars.find((war) => war.warId === warId) || null;
  }
  const manorId = normalizeManorId(payload.manorId || "");
  return manorId ? activeManorWarFor(data, manorId) : null;
}

function activeManorWarFor(data, manorId) {
  const normalizedManorId = normalizeManorId(manorId);
  const wars = normalizedManorWars(data.manorWars);
  for (let index = wars.length - 1; index >= 0; index -= 1) {
    const war = wars[index];
    if (war && war.manorId === normalizedManorId && war.status === MANOR_WAR_STATUS_SCHEDULED) {
      return war;
    }
  }
  return null;
}

function activeManorWarForFamily(data, familyId) {
  const normalizedFamilyId = String(familyId || "").trim();
  if (!normalizedFamilyId) {
    return null;
  }
  const wars = normalizedManorWars(data.manorWars);
  for (let index = wars.length - 1; index >= 0; index -= 1) {
    const war = wars[index];
    if (!war || war.status !== MANOR_WAR_STATUS_SCHEDULED) {
      continue;
    }
    if (war.challengerFamilyId === normalizedFamilyId || war.defenderFamilyId === normalizedFamilyId) {
      return war;
    }
  }
  return null;
}

function normalizedManorWars(value) {
  return Array.isArray(value) ? value : [];
}

function occupyManor(data, manor, family, defenderFamily, updatedAt) {
  const manorId = normalizeManorId(manor.id);
  if (defenderFamily) {
    defenderFamily.manorIds = uniqueStrings(defenderFamily.manorIds).filter((id) => id !== manorId);
    defenderFamily.updatedAt = updatedAt;
    data.families[defenderFamily.familyId] = defenderFamily;
  }
  releaseManorFromOtherFamilies(data, manorId, family.familyId);
  family.manorIds = uniqueStrings((family.manorIds || []).concat([manorId]));
  data.manors[manorId] = {
    manorId,
    ownerFamilyId: family.familyId,
    ownerFamilyName: family.name,
    occupiedAt: updatedAt,
    updatedAt,
    schemaVersion: 1,
  };
}

function releaseFamilyManors(data, familyId) {
  for (const [manorId, state] of Object.entries(objectOrEmpty(data.manors))) {
    if (state && state.ownerFamilyId === familyId) {
      data.manors[manorId] = {
        manorId,
        ownerFamilyId: "",
        ownerFamilyName: "",
        occupiedAt: "",
        updatedAt: new Date().toISOString(),
        schemaVersion: 1,
      };
    }
  }
}

function releaseManorFromOtherFamilies(data, manorId, exceptFamilyId) {
  for (const family of Object.values(objectOrEmpty(data.families))) {
    if (!family || family.familyId === exceptFamilyId) {
      continue;
    }
    family.manorIds = uniqueStrings(family.manorIds).filter((id) => id !== manorId);
  }
}

function accountBattlePower(data, account) {
  const binding = objectOrEmpty(data.profileBindings)[account.accountId] || null;
  const profileDoc = binding ? objectOrEmpty(data.profiles)[binding.playerId] || null : null;
  const profile = profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" && !Array.isArray(profileDoc.profile)
    ? profileDoc.profile
    : {};
  const player = objectOrEmpty(profile.player);
  const stats = objectOrEmpty(player.baseStats);
  const playerPower = positiveInt(player.level, 1) * 12
    + positiveInt(stats.maxHp || player.maxHp, 120) * 0.25
    + positiveInt(stats.attack, 18) * 3
    + positiveInt(stats.defense, 6) * 2
    + positiveInt(stats.quick, 70) * 1.2;
  const petPower = bestPetPower(profile);
  return Math.round(playerPower + petPower);
}

function bestPetPower(profile) {
  const pets = Array.isArray(profile.petInstances) ? profile.petInstances : [];
  let best = 0;
  for (const pet of pets) {
    if (!pet || typeof pet !== "object" || Array.isArray(pet)) {
      continue;
    }
    const power = positiveInt(pet.level, 1) * 8
      + positiveInt(pet.maxHp || pet.hp, 90) * 0.18
      + positiveInt(pet.attack, 12) * 2.4
      + positiveInt(pet.defense, 6) * 1.6
      + positiveInt(pet.quick, 50);
    best = Math.max(best, power);
  }
  return Math.round(best);
}

function neutralManorPower(manor) {
  return Math.max(1, Math.trunc(Number(manor.neutralPower || manor.requiredPower || 260)));
}

function manorDefenseBonus(manor) {
  return Math.max(0, Math.trunc(Number(manor.defenseBonus || 80)));
}

function normalizeFamilyName(value) {
  const name = String(value || "").trim().replace(/\s+/g, "");
  if (name.length < FAMILY_NAME_MIN_LENGTH || name.length > FAMILY_NAME_MAX_LENGTH) {
    return "";
  }
  return name;
}

function normalizeFamilyNotice(value) {
  return String(value || "").trim().slice(0, FAMILY_NOTICE_MAX_LENGTH);
}

function normalizeManorId(value) {
  return String(value || "").trim();
}

function isoAfter(now, seconds) {
  return new Date(now() + Math.max(0, Math.trunc(Number(seconds || 0))) * 1000).toISOString();
}

function positiveInt(value, fallback) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Math.max(1, Math.trunc(Number(fallback || 1)));
  }
  return parsed;
}

function uniqueStrings(value) {
  const result = [];
  if (!Array.isArray(value)) {
    return result;
  }
  for (const item of value) {
    const text = String(item || "").trim();
    if (text && !result.includes(text)) {
      result.push(text);
    }
  }
  return result;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

module.exports = {
  createFamilyManorDomain,
  familyForAccount,
  familyOwnsManor,
  publicManorBattle,
};
