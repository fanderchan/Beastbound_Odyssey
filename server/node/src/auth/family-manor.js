"use strict";

const FAMILY_NAME_MIN_LENGTH = 2;
const FAMILY_NAME_MAX_LENGTH = 12;
const FAMILY_NOTICE_MAX_LENGTH = 80;
const FAMILY_MAX_MEMBERS = 100;
const MANOR_BATTLE_RECORD_LIMIT = 200;

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
    family.memberAccountIds = family.memberAccountIds.filter((accountId) => accountId !== resolved.account.accountId);
    let message = "已离开家族。";
    if (family.memberAccountIds.length <= 0) {
      releaseFamilyManors(data, family.familyId);
      delete data.families[family.familyId];
      message = "家族已解散。";
    } else {
      if (family.leaderAccountId === resolved.account.accountId) {
        family.leaderAccountId = family.memberAccountIds[0];
        message = "已离开家族，族长已转交。";
      }
      family.updatedAt = isoNow(now);
      data.families[family.familyId] = family;
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
    const manorId = normalizeManorId(payload.manorId || payload.id || "");
    const manor = manorById(manorId);
    if (!manor) {
      return fail("manor_missing", "庄园不存在。");
    }
    const manorState = manorStateFor(data, manorId);
    if (manorState.ownerFamilyId === family.familyId) {
      return fail("manor_already_owned", "这个庄园已经由你的家族占领。");
    }
    const defenderFamily = manorState.ownerFamilyId ? data.families[manorState.ownerFamilyId] || null : null;
    const challengerPower = familyBattlePower(data, family);
    const defenderPower = defenderFamily
      ? Math.max(familyBattlePower(data, defenderFamily), neutralManorPower(manor)) + manorDefenseBonus(manor)
      : neutralManorPower(manor);
    const victory = challengerPower >= defenderPower;
    const battle = {
      battleId: `manor_battle_${randomId()}`,
      manorId,
      manorName: String(manor.name || manor.label || manorId),
      challengerFamilyId: family.familyId,
      challengerFamilyName: family.name,
      defenderFamilyId: defenderFamily ? defenderFamily.familyId : "",
      defenderFamilyName: defenderFamily ? defenderFamily.name : "庄园守备队",
      challengerPower,
      defenderPower,
      winnerFamilyId: victory ? family.familyId : (defenderFamily ? defenderFamily.familyId : ""),
      winnerFamilyName: victory ? family.name : (defenderFamily ? defenderFamily.name : "庄园守备队"),
      result: victory ? "challenger_win" : "defender_win",
      createdAt: isoNow(now),
      schemaVersion: 1,
    };
    if (victory) {
      occupyManor(data, manor, family, defenderFamily, isoNow(now));
      family.fame = Math.max(0, Math.trunc(Number(family.fame || 0))) + 20;
      family.updatedAt = isoNow(now);
      data.families[family.familyId] = family;
    } else {
      family.fame = Math.max(0, Math.trunc(Number(family.fame || 0))) + 3;
      family.updatedAt = isoNow(now);
      data.families[family.familyId] = family;
    }
    data.manorBattles.push(battle);
    while (data.manorBattles.length > MANOR_BATTLE_RECORD_LIMIT) {
      data.manorBattles.shift();
    }
    save(data);
    const targets = Array.from(new Set(family.memberAccountIds.concat(defenderFamily ? defenderFamily.memberAccountIds : [])));
    emitServiceEvent({
      type: "manor.battle",
      targetAccountIds: targets,
      battle: publicManorBattle(battle),
      manor: publicManor(manor, data, family.familyId),
    });
    return ok({
      battle: publicManorBattle(battle),
      family: publicFamily(data.families[family.familyId], data, accountById),
      manor: publicManor(manor, data, family.familyId),
      manors: publicManorsForAccount(data, resolved.account.accountId),
      message: victory ? "庄园战胜利，家族已占领庄园。" : "庄园战失败，家族气势略有提升。",
    });
  }

  function publicManorsForAccount(data, accountId) {
    const family = familyForAccount(data, accountId);
    const familyId = family ? family.familyId : "";
    return manorEntries().map((manor) => publicManor(manor, data, familyId));
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

function publicManor(manor, data, viewerFamilyId = "") {
  const manorId = normalizeManorId(manor.id);
  const state = manorStateFor(data, manorId);
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
    schemaVersion: 1,
  };
}

function publicManorBattle(battle) {
  return {
    battleId: battle.battleId,
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

function familyBattlePower(data, family) {
  let total = 0;
  let counted = 0;
  for (const accountId of family.memberAccountIds || []) {
    const account = Object.values(objectOrEmpty(data.accounts)).find((entry) => entry && entry.accountId === accountId) || null;
    if (!account) {
      continue;
    }
    total += accountBattlePower(data, account);
    counted += 1;
    if (counted >= 5) {
      break;
    }
  }
  return Math.max(1, Math.round(total));
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
