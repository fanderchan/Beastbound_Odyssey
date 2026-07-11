"use strict";

function createQuestDomain(ctx) {
  const {
    claimQuestByIdToProfile,
    clone,
    currentProfileQuestId,
    fail,
    load,
    normalizedQuestEventPayload,
    now,
    ok,
    persistProfileForAccount,
    profileBindingForAccount,
    profileSummaryForAccount,
    publicAccount,
    publicQuestClaim,
    publicQuestProgress,
    questById,
    questIsOptional,
    questRewardChoices,
    rawBackpackAssetConflict,
    recordQuestEventByIdToProfile,
    recordQuestEventToProfile,
    resolveSession,
    save,
    validateClientQuestEvent,
  } = ctx;

  function questRecord(token, payload = {}) {
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
    const assetConflict = typeof rawBackpackAssetConflict === "function"
      ? rawBackpackAssetConflict(profileDoc.profile)
      : {code: "backpack_asset_guard_missing", message: "背包安全校验暂不可用，本次操作已取消，请联系GM处理。"};
    if (assetConflict) {
      return fail(assetConflict.code, assetConflict.message, {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const event = normalizedQuestEventPayload(payload.event && typeof payload.event === "object" && !Array.isArray(payload.event) ? payload.event : payload);
    if (String(event.type || "") === "") {
      return fail("quest_event_invalid", "任务事件为空。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const clientEventValidation = validateClientQuestEvent(data, resolved.account, event);
    if (!clientEventValidation.ok) {
      return fail(clientEventValidation.code, clientEventValidation.message, {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const profile = clone(profileDoc.profile);
    const questId = String(payload.questId || event.questId || "").trim();
    const progress = questId !== ""
      ? recordQuestEventByIdToProfile(profile, questId, event)
      : recordQuestEventToProfile(profile, event);
    if (!progress.ok) {
      return fail(progress.code || "quest_event_invalid", progress.message || "任务无法推进。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const questMessages = [];
    if (progress.changed && progress.message) {
      questMessages.push(progress.message);
    }
    if (progress.ready) {
      const quest = questById(progress.questId);
      if (quest && Boolean(quest.autoClaimOnReady) && questRewardChoices(quest).length <= 0) {
        const claim = claimQuestByIdToProfile(profile, progress.questId, "", !questIsOptional(quest));
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
      progress: publicQuestProgress(progress),
      questMessages,
      message: questMessages.filter(Boolean).join("\n") || progress.message || "任务已同步。",
    });
  }

  function questClaim(token, payload = {}) {
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
    const assetConflict = typeof rawBackpackAssetConflict === "function"
      ? rawBackpackAssetConflict(profileDoc.profile)
      : {code: "backpack_asset_guard_missing", message: "背包安全校验暂不可用，本次操作已取消，请联系GM处理。"};
    if (assetConflict) {
      return fail(assetConflict.code, assetConflict.message, {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const profile = clone(profileDoc.profile);
    const requestedQuestId = String(payload.questId || payload.id || "").trim();
    const questId = requestedQuestId !== "" ? requestedQuestId : currentProfileQuestId(profile);
    const quest = questById(questId);
    if (!quest) {
      return fail("quest_missing", "当前没有可领取的任务奖励。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const rewardChoiceId = String(payload.rewardChoiceId || payload.choiceId || "").trim();
    const claim = claimQuestByIdToProfile(profile, questId, rewardChoiceId, !questIsOptional(quest));
    if (!claim.ok) {
      return fail(claim.code || "quest_claim_failed", claim.message || "领取任务奖励失败。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
        requiresChoice: Boolean(claim.requiresChoice),
      });
    }
    const persisted = persistProfileForAccount(data, resolved.account, binding, profile, now);
    save(data);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      claim: publicQuestClaim(claim),
      questMessages: [claim.message].filter(Boolean),
      message: claim.message,
    });
  }

  return {
    questRecord,
    questClaim,
  };
}

module.exports = {createQuestDomain};
