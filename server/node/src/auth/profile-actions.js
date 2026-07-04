"use strict";

function createProfileActionsDomain(ctx) {
  const {
    ENCOUNTER_STONE_ITEM_IDS,
    PROFILE_ACTION_IDS,
    activeQuestAutoClaim,
    applyPlayerRebirthReturn,
    applyProfileActionToProfile,
    backpackItemCount,
    claimActiveQuestToProfile,
    captureToolBagFromProfile,
    clone,
    consumeBackpackItem,
    ensureProfileForAccount,
    executePlayerRebirthToProfile,
    fail,
    isoNow,
    load,
    normalizeBackpackSlots,
    normalizeHangMode,
    normalizeHangOriginPayload,
    normalizeHangSession,
    normalizeHangSettings,
    normalizeHangStopReason,
    normalizeProfileActionId,
    now,
    objectOrEmpty,
    ok,
    partyForAccount,
    persistProfileForAccount,
    profileActionLogLines,
    profileBackpackSlots,
    profileBindingForAccount,
    profileSummaryForAccount,
    publicAccount,
    publicHangSession,
    publicProfileActionResult,
    recordQuestEventToProfile,
    resolveSession,
    save,
  } = ctx;

  function startHangSession(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const ensured = ensureProfileForAccount(data, resolved.account, now);
    const profileDoc = ensured.profileDoc;
    const profile = profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" && !Array.isArray(profileDoc.profile)
      ? clone(profileDoc.profile)
      : null;
    if (!profile) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: ensured.binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const mode = normalizeHangMode(payload.mode || payload.type);
    if (!mode) {
      return fail("hang_mode_invalid", "挂机模式不正确。", {
        profileBinding: ensured.binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const party = partyForAccount(data, resolved.account.accountId);
    const partyLeaderAccountId = party ? String(party.leaderAccountId || "") : resolved.account.accountId;
    if (party && partyLeaderAccountId !== resolved.account.accountId) {
      return fail("hang_party_leader_required", mode === "encounter_stone" ? "队伍中只有队长可以使用遇敌石。" : "队伍中只有队长可以开始挂机。", {
        profileBinding: ensured.binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const settings = normalizeHangSettings(payload.settings);
    profile.hangSettings = settings;
    let session = normalizeHangSession(profile.hangSession);
    const origin = normalizeHangOriginPayload(payload);
    session = {
      ...session,
      enabled: true,
      mode,
      pendingResume: false,
      lastStopReason: "",
      originMapId: origin.mapId || session.originMapId,
      originCell: origin.originCell,
    };
    if (mode === "encounter_stone") {
      const itemId = String(payload.itemId || payload.encounterStoneItemId || "").trim();
      if (!ENCOUNTER_STONE_ITEM_IDS.has(itemId)) {
        return fail("hang_item_invalid", "遇敌石道具不正确。", {
          profileBinding: ensured.binding,
          profileSummary: profileSummaryForAccount(resolved.account, data),
        });
      }
      const slots = normalizeBackpackSlots(profileBackpackSlots(profile));
      if (backpackItemCount(slots, itemId) <= 0) {
        return fail("item_not_enough", "遇敌石不够。", {
          profileBinding: ensured.binding,
          profileSummary: profileSummaryForAccount(resolved.account, data),
        });
      }
      profile.backpackSlots = consumeBackpackItem(slots, itemId, 1);
      profile.captureTools = captureToolBagFromProfile(profile);
    }
    profile.hangSession = session;
    const persisted = persistProfileForAccount(data, resolved.account, ensured.binding, profile, now);
    save(data);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      hang: publicHangSession(session),
      message: mode === "encounter_stone" ? "遇敌石已生效。" : "开始挂机。",
    });
  }

  function stopHangSession(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const ensured = ensureProfileForAccount(data, resolved.account, now);
    const profileDoc = ensured.profileDoc;
    const profile = profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" && !Array.isArray(profileDoc.profile)
      ? clone(profileDoc.profile)
      : null;
    if (!profile) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: ensured.binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const previousSession = normalizeHangSession(profile.hangSession);
    const reason = normalizeHangStopReason(payload.reason || payload.message || "manual");
    const nextSession = {
      ...previousSession,
      enabled: false,
      pendingResume: Boolean(payload.pendingResume),
      lastStopReason: reason,
    };
    profile.hangSession = nextSession;
    const changed = JSON.stringify(previousSession) !== JSON.stringify(nextSession);
    let binding = ensured.binding;
    if (changed) {
      const persisted = persistProfileForAccount(data, resolved.account, ensured.binding, profile, now);
      binding = persisted.binding;
      save(data);
    } else if (ensured.created) {
      save(data);
    }
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      hang: publicHangSession(nextSession),
      message: "挂机已停止。",
    });
  }

  function profileAction(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const ensured = ensureProfileForAccount(data, resolved.account, now);
    const binding = ensured.binding;
    const profileDoc = ensured.profileDoc;
    if (!profileDoc || !profileDoc.profile || typeof profileDoc.profile !== "object" || Array.isArray(profileDoc.profile)) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const action = normalizeProfileActionId(payload.action || payload.type || payload.kind || payload.command);
    if (!PROFILE_ACTION_IDS.has(action)) {
      return fail("profile_action_invalid", "档案操作不正确。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const profile = clone(profileDoc.profile);
    const params = objectOrEmpty(payload.payload || payload.params || payload);
    const actionResult = applyProfileActionToProfile(profile, action, params, now);
    if (!actionResult.ok) {
      return fail(actionResult.code || "profile_action_failed", actionResult.message || "档案操作失败。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
        result: publicProfileActionResult(action, actionResult),
      });
    }
    const questMessages = [];
    if (action === "world_item_use") {
      const questProgress = recordQuestEventToProfile(profile, {
        type: "use_world_item",
        itemId: String(actionResult.itemId || params.itemId || "").trim(),
        targetType: String(actionResult.instanceId || params.instanceId || params.petId || "").trim() !== "" ? "pet" : "player",
        amount: 1,
        schemaVersion: 1,
      });
      if (questProgress.changed && questProgress.message) {
        questMessages.push(questProgress.message);
      }
      if (questProgress.ready && activeQuestAutoClaim(profile)) {
        const claim = claimActiveQuestToProfile(profile);
        if (claim.ok && claim.message) {
          questMessages.push(claim.message);
        }
      }
    }
    const persisted = persistProfileForAccount(data, resolved.account, binding, profile, now);
    save(data);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      result: publicProfileActionResult(action, actionResult),
      questMessages,
      logLines: [...profileActionLogLines(actionResult), ...questMessages],
      message: actionResult.message || "角色档案已更新。",
    });
  }

  function playerRebirth(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const binding = profileBindingForAccount(data, resolved.account, now);
    const profileDoc = data.profiles[binding.playerId] || null;
    if (!profileDoc || !profileDoc.profile || typeof profileDoc.profile !== "object" || Array.isArray(profileDoc.profile)) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const profile = clone(profileDoc.profile);
    const rebirthResult = executePlayerRebirthToProfile(profile);
    if (!rebirthResult.ok) {
      return fail(rebirthResult.code || "player_rebirth_not_ready", rebirthResult.message || "暂时不能转生。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
        rebirth: rebirthResult.rebirth || null,
      });
    }
    const updatedAt = isoNow(now);
    const nextRevision = Number(binding.profileRevision || 0) + 1;
    binding.profileRevision = nextRevision;
    binding.updatedAt = updatedAt;
    data.profileBindings[resolved.account.accountId] = binding;
    data.profiles[binding.playerId] = {
      playerId: binding.playerId,
      accountId: resolved.account.accountId,
      profileRevision: nextRevision,
      profile,
      updatedAt,
      schemaVersion: 1,
    };
    const returnEntry = applyPlayerRebirthReturn(data, resolved.account, now);
    save(data);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      rebirth: rebirthResult.rebirth,
      returnEntry,
      message: rebirthResult.message,
    });
  }

  return {
    startHangSession,
    stopHangSession,
    profileAction,
    playerRebirth,
  };
}

module.exports = {createProfileActionsDomain};
