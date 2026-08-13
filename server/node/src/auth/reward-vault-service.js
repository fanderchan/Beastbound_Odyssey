"use strict";

const {
  REWARD_VAULT_STATUS_CLAIMED,
  canonicalRewardVaultEntry,
  claimRewardVaultEntry,
  projectRewardVaultEntry,
} = require("./reward-vault-state");
const {
  canonicalRewardVaultPageResult,
  normalizeRewardVaultPageOptions,
} = require("./reward-vault-pagination");

function createRewardVaultService(options = {}) {
  const {
    addRewardItemsToBackpack,
    activeQuestAutoClaim,
    captureToolBagFromProfile,
    certifyAttachment,
    clone,
    claimActiveQuestToProfile,
    currentClaimEntry,
    fail,
    isoNow,
    load,
    now,
    ok,
    persistProfileForAccount,
    profileBackpackSlots,
    profileCurrencyAmount,
    profileStoneCoinLimit,
    rawBackpackAssetConflict,
    recordQuestEventToProfile,
    resolveSession,
    save,
    setProfileCurrencyAmount,
    stageClaim,
    store,
  } = options;
  if (
    !store
    || typeof addRewardItemsToBackpack !== "function"
    || typeof activeQuestAutoClaim !== "function"
    || typeof captureToolBagFromProfile !== "function"
    || typeof certifyAttachment !== "function"
    || typeof clone !== "function"
    || typeof claimActiveQuestToProfile !== "function"
    || typeof currentClaimEntry !== "function"
    || typeof fail !== "function"
    || typeof isoNow !== "function"
    || typeof load !== "function"
    || typeof now !== "function"
    || typeof ok !== "function"
    || typeof persistProfileForAccount !== "function"
    || typeof profileBackpackSlots !== "function"
    || typeof profileCurrencyAmount !== "function"
    || typeof rawBackpackAssetConflict !== "function"
    || typeof recordQuestEventToProfile !== "function"
    || typeof resolveSession !== "function"
    || typeof save !== "function"
    || typeof setProfileCurrencyAmount !== "function"
    || typeof stageClaim !== "function"
  ) {
    throw new TypeError("reward vault service dependencies are invalid");
  }

  function enabled() {
    return typeof store.rewardVaultEnabled === "function"
      && store.rewardVaultEnabled() === true;
  }

  async function list(token, payload = {}) {
    let pageOptions;
    try {
      pageOptions = normalizeRewardVaultPageOptions(payload, {requireExplicitLimit: true});
    } catch (error) {
      return fail(
        String(error && error.code || "reward_vault_pagination_invalid"),
        String(error && error.message || "奖励仓分页参数无效，请刷新后重试。"),
      );
    }
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) return fail(resolved.code, resolved.message);
    if (
      !enabled()
      || store.rewardVaultPageReads !== true
      || typeof store.readRewardVaultPage !== "function"
    ) {
      return fail("reward_vault_unavailable", "奖励仓暂未开放，请稍后再试。");
    }
    let page;
    try {
      page = canonicalRewardVaultPageResult(
        await store.readRewardVaultPage(resolved.account.accountId, pageOptions),
        resolved.account.accountId,
        pageOptions,
        {trustStoreOrder: true, certifyAttachment},
      );
    } catch (cause) {
      if (String(cause && cause.code || "") === "reward_vault_feature_disabled_or_drifted") {
        return fail("reward_vault_unavailable", "奖励仓暂未开放，请稍后再试。");
      }
      throw storageReadFailure(cause);
    }
    return ok({
      rewards: page.rewardRows.map((entry) => projectRewardVaultEntry(entry, {
        certifyAttachment,
      })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    });
  }

  function claim(token, rewardIdValue) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) return fail(resolved.code, resolved.message);
    if (!enabled()) {
      return fail("reward_vault_unavailable", "奖励仓暂未开放，请稍后再试。");
    }
    const rewardId = typeof rewardIdValue === "string" ? rewardIdValue.trim() : "";
    if (!/^reward_[a-f0-9]{64}$/.test(rewardId)) {
      return fail("reward_vault_reward_id_invalid", "奖励编号无效，请刷新后重试。");
    }
    const loadedEntry = currentClaimEntry();
    if (loadedEntry === null) {
      return fail("reward_vault_reward_missing", "奖励不存在或不属于当前账号。");
    }
    let beforeEntry;
    try {
      beforeEntry = canonicalRewardVaultEntry(loadedEntry, rewardId, {certifyAttachment});
    } catch (cause) {
      throw storageReadFailure(cause);
    }
    if (beforeEntry.recipientAccountId !== resolved.account.accountId) {
      return fail("reward_vault_reward_missing", "奖励不存在或不属于当前账号。");
    }
    if (beforeEntry.status === REWARD_VAULT_STATUS_CLAIMED) {
      return fail("reward_vault_already_claimed", "这份奖励已经领取。");
    }

    const binding = data.profileBindings
      && data.profileBindings[resolved.account.accountId]
      && typeof data.profileBindings[resolved.account.accountId] === "object"
      && !Array.isArray(data.profileBindings[resolved.account.accountId])
      ? data.profileBindings[resolved.account.accountId]
      : null;
    if (!binding || String(binding.playerId || "") === "") {
      return fail("profile_missing", "请先创建角色档案。");
    }
    const profileDoc = data.profiles[binding.playerId] || null;
    if (!profileDoc || !profileDoc.profile || typeof profileDoc.profile !== "object"
      || Array.isArray(profileDoc.profile)) {
      return fail("profile_missing", "请先创建角色档案。");
    }
    const conflict = rawBackpackAssetConflict(profileDoc.profile);
    if (conflict) return fail(conflict.code, conflict.message);

    const profile = clone(profileDoc.profile);
    const itemResult = addRewardItemsToBackpack(
      profileBackpackSlots(profile),
      beforeEntry.document.items,
    );
    if (itemResult.lostItems.length > 0) {
      return fail("reward_vault_backpack_full", "背包空间不足，奖励仍安全保存在奖励仓中。", {
        requiredItems: clone(beforeEntry.document.items),
      });
    }
    const currency = beforeEntry.document.currency;
    for (const currencyId of ["stoneCoins", "diamonds"]) {
      const amount = Number(currency[currencyId] || 0);
      const current = profileCurrencyAmount(profile, currencyId);
      const limit = currencyId === "stoneCoins" ? profileStoneCoinLimit : Number.MAX_SAFE_INTEGER;
      if (
        !Number.isSafeInteger(amount)
        || amount < 0
        || !Number.isSafeInteger(current)
        || current < 0
        || !Number.isSafeInteger(current + amount)
        || current + amount > limit
      ) {
        return fail(
          "reward_vault_currency_limit",
          currencyId === "stoneCoins"
            ? "石币已接近上限，奖励仍安全保存在奖励仓中。"
            : "钻石余额已接近上限，奖励仍安全保存在奖励仓中。",
        );
      }
    }

    profile.backpackSlots = itemResult.slots;
    profile.captureTools = captureToolBagFromProfile(profile);
    for (const currencyId of ["stoneCoins", "diamonds"]) {
      const amount = Number(currency[currencyId] || 0);
      if (amount > 0) {
        setProfileCurrencyAmount(
          profile,
          currencyId,
          profileCurrencyAmount(profile, currencyId) + amount,
        );
      }
    }
    const questMessages = [];
    if (beforeEntry.sourceKind === "tutorial_market_sale") {
      const progress = recordQuestEventToProfile(profile, {
        type: "claim_mail",
        mailKind: "tutorial_market_sale",
        amount: 1,
        schemaVersion: 1,
      });
      if (progress.changed && progress.message) questMessages.push(progress.message);
      if (progress.ready && activeQuestAutoClaim(profile)) {
        const questClaim = claimActiveQuestToProfile(profile);
        if (questClaim.ok && questClaim.message) questMessages.push(questClaim.message);
      }
    }
    const claimedAt = isoNow(now);
    const nextEntry = claimRewardVaultEntry(beforeEntry, claimedAt, {certifyAttachment});
    persistProfileForAccount(data, resolved.account, binding, profile, now);
    stageClaim({beforeEntry, nextEntry, claimedAt});
    save(data);
    return ok({
      reward: projectRewardVaultEntry(nextEntry, {certifyAttachment}),
      profile,
      questMessages,
      message: "奖励已领取。",
    });
  }

  return Object.freeze({claim, enabled, list});
}

function storageReadFailure(cause) {
  const error = new Error("服务器正在同步奖励仓数据，请稍后重试。");
  error.code = "storage_read_failed";
  error.cause = cause;
  return error;
}

module.exports = {createRewardVaultService};
