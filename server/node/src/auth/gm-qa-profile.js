"use strict";

const GM_PREPARE_QA_PROFILE_COMMAND_ID = "gm_prepare_qa_profile";
const QA_CORE_MANIFEST_ID = "qa_core_v1";
const QA_CORE_STONE_COINS = 1000000;
const QA_CORE_DIAMONDS = 100000;
const QA_CORE_BACKPACK_EXTRA_SLOTS = 5;
const QA_CORE_ITEMS = Object.freeze([
  Object.freeze({itemId: "item_meat_small", count: 50}),
  Object.freeze({itemId: "item_heal_single_5", count: 20}),
  Object.freeze({itemId: "item_heal_all_5", count: 20}),
  Object.freeze({itemId: "item_poison_single_5", count: 20}),
  Object.freeze({itemId: "item_poison_all_5", count: 20}),
  Object.freeze({itemId: "item_cleanse_single_5", count: 20}),
  Object.freeze({itemId: "capture_rope_basic", count: 20}),
  Object.freeze({itemId: "capture_net", count: 20}),
  Object.freeze({itemId: "capture_net_reinforced", count: 20}),
  Object.freeze({itemId: "capture_poison_wuli_net", count: 20}),
  Object.freeze({itemId: "encounter_stone_low", count: 20}),
  Object.freeze({itemId: "encounter_stone_mid", count: 20}),
  Object.freeze({itemId: "encounter_stone_high", count: 20}),
  Object.freeze({itemId: "item_pet_salve_large", count: 20}),
  Object.freeze({itemId: "item_pet_exp_pill_lv131", count: 20}),
]);

function createGmQaProfileDomain(ctx) {
  const {
    addRewardItemsToBackpack,
    backpackItemCount,
    bagItemById,
    bagItemStackLimit,
    captureToolBagFromProfile,
    clone,
    fail,
    gmCommandAccess,
    isEquipmentItemId,
    load,
    normalizeBackpackSlots,
    ok,
    persistProfileForAccount,
    profileBackpackSlotLimit,
    profileBackpackSlots,
    profileStoneCoinLimit,
    profileSummaryForAccount,
    publicAccount,
    rawBackpackAssetConflict,
    recordGmCommandAudit,
    save,
  } = ctx;

  function prepareGmQaProfile(token, payload = {}) {
    const data = load();
    const access = gmCommandAccess(data, token, GM_PREPARE_QA_PROFILE_COMMAND_ID);
    if (!access.ok) {
      return auditedFailure(data, access, access.code, access.message);
    }
    if (!validPayload(payload)) {
      return auditedFailure(
        data,
        access,
        "gm_qa_profile_payload_invalid",
        "GM测试档案参数不正确，请刷新后重试。",
      );
    }
    const manifestError = validateManifest();
    if (manifestError) {
      return auditedFailure(data, access, manifestError.code, manifestError.message);
    }

    const existing = existingProfileForAccount(data, access.resolved.account);
    if (!existing.ok) {
      return auditedFailure(data, access, existing.code, existing.message);
    }
    const sourceProfile = existing.profileDoc.profile;
    const sourceConflict = rawBackpackAssetConflict(sourceProfile);
    if (sourceConflict) {
      return auditedFailure(data, access, sourceConflict.code, sourceConflict.message);
    }

    const beforeRevision = safeRevision(existing.binding.profileRevision);
    const profile = clone(sourceProfile);
    const currencyState = strictCurrencyState(profile, profileStoneCoinLimit);
    if (!currencyState.ok) {
      return auditedFailure(data, access, currencyState.code, currencyState.message, {
        manifestId: QA_CORE_MANIFEST_ID,
        profileRevisionBefore: beforeRevision,
        profileRevisionAfter: beforeRevision,
      });
    }

    profile.stoneCoins = Math.max(currencyState.stoneCoins, QA_CORE_STONE_COINS);
    profile.diamonds = Math.max(currencyState.diamonds, QA_CORE_DIAMONDS);
    profile.backpackExtraSlots = Math.max(currencyState.backpackExtraSlots, QA_CORE_BACKPACK_EXTRA_SLOTS);
    const slotLimit = profileBackpackSlotLimit(profile);
    let slots = normalizeBackpackSlots(profileBackpackSlots(profile), slotLimit);
    const missingItems = QA_CORE_ITEMS.map((entry) => ({
      itemId: entry.itemId,
      count: Math.max(0, entry.count - backpackItemCount(slots, entry.itemId)),
    })).filter((entry) => entry.count > 0);
    const added = addRewardItemsToBackpack(slots, missingItems);
    if (added.lostItems.length > 0) {
      return auditedFailure(
        data,
        access,
        "gm_qa_profile_capacity_full",
        "背包空间不足，GM测试档案未作任何改变。",
        {
          manifestId: QA_CORE_MANIFEST_ID,
          profileRevisionBefore: beforeRevision,
          profileRevisionAfter: beforeRevision,
        },
      );
    }
    slots = normalizeBackpackSlots(added.slots, slotLimit);
    profile.backpackSlots = slots;
    profile.captureTools = captureToolBagFromProfile(profile);
    const finalConflict = rawBackpackAssetConflict(profile);
    if (finalConflict) {
      return auditedFailure(data, access, finalConflict.code, finalConflict.message, {
        manifestId: QA_CORE_MANIFEST_ID,
        profileRevisionBefore: beforeRevision,
        profileRevisionAfter: beforeRevision,
      });
    }

    const changed = !sameDocument(sourceProfile, profile);
    let persisted = {binding: existing.binding};
    if (changed) {
      persisted = persistProfileForAccount(data, access.resolved.account, existing.binding, profile, ctx.now);
    }
    const afterRevision = safeRevision(persisted.binding && persisted.binding.profileRevision);
    const addedQuantity = added.addedItems.reduce((sum, entry) => sum + safeCount(entry.count), 0);
    const result = {
      commandId: GM_PREPARE_QA_PROFILE_COMMAND_ID,
      summary: {
        manifestId: QA_CORE_MANIFEST_ID,
        changed,
        alreadyCurrent: !changed,
        profileRevisionBefore: beforeRevision,
        profileRevisionAfter: afterRevision,
        stoneCoins: safeCount(profile.stoneCoins),
        diamonds: safeCount(profile.diamonds),
        backpackExtraSlots: safeCount(profile.backpackExtraSlots),
        itemKinds: QA_CORE_ITEMS.length,
        itemQuantity: QA_CORE_ITEMS.reduce(
          (sum, entry) => sum + backpackItemCount(profile.backpackSlots, entry.itemId),
          0,
        ),
        schemaVersion: 1,
      },
      delta: {
        stoneCoinsAdded: Math.max(0, profile.stoneCoins - currencyState.stoneCoins),
        diamondsAdded: Math.max(0, profile.diamonds - currencyState.diamonds),
        backpackExtraSlotsAdded: Math.max(0, profile.backpackExtraSlots - currencyState.backpackExtraSlots),
        itemKindsChanged: added.addedItems.length,
        itemQuantityAdded: addedQuantity,
        schemaVersion: 1,
      },
      schemaVersion: 1,
    };
    const message = changed ? "GM核心测试档案已补齐。" : "GM核心测试档案已经是最新状态。";
    const audit = recordGmCommandAudit(data, access, true, message, {
      accountId: access.resolved.account.accountId,
      targetAccountId: access.resolved.account.accountId,
      manifestId: QA_CORE_MANIFEST_ID,
      profileRevisionBefore: beforeRevision,
      profileRevisionAfter: afterRevision,
      changed,
      delta: result.delta,
    });
    save(data);
    return ok({
      account: publicAccount(access.resolved.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(access.resolved.account, data),
      profile,
      result,
      auditId: audit.auditId,
      message,
    });
  }

  function auditedFailure(data, access, code, message, details = {}) {
    const audit = recordGmCommandAudit(data, access, false, message, details);
    if (audit.recorded !== false) {
      save(data);
    }
    return fail(code, message, audit.auditId ? {auditId: audit.auditId} : {});
  }

  function validateManifest() {
    const seen = new Set();
    for (const entry of QA_CORE_ITEMS) {
      if (
        seen.has(entry.itemId)
        || !bagItemById(entry.itemId)
        || isEquipmentItemId(entry.itemId)
        || !Number.isSafeInteger(entry.count)
        || entry.count <= 0
        || entry.count > bagItemStackLimit(entry.itemId)
      ) {
        return {
          code: "gm_qa_profile_manifest_invalid",
          message: "GM测试档案清单异常，本次操作已取消。",
        };
      }
      seen.add(entry.itemId);
    }
    return null;
  }

  function existingProfileForAccount(data, account) {
    const accountId = String(account && account.accountId || "");
    const binding = isRecord(data && data.profileBindings) && isRecord(data.profileBindings[accountId])
      ? data.profileBindings[accountId]
      : null;
    const playerId = String(binding && binding.playerId || "");
    const profileDoc = playerId !== "" && isRecord(data && data.profiles) && isRecord(data.profiles[playerId])
      ? data.profiles[playerId]
      : null;
    if (!binding || !profileDoc || !isRecord(profileDoc.profile)) {
      return {ok: false, code: "profile_missing", message: "请先创建角色档案。"};
    }
    const bindingRevision = strictRevision(binding.profileRevision);
    const profileRevision = strictRevision(profileDoc.profileRevision);
    if (
      String(binding.accountId || "") !== accountId
      || String(profileDoc.accountId || "") !== accountId
      || String(profileDoc.playerId || "") !== playerId
      || bindingRevision === null
      || profileRevision === null
      || bindingRevision !== profileRevision
    ) {
      return {
        ok: false,
        code: "profile_binding_conflict",
        message: "角色档案归属或版本不一致，本次操作已取消。",
      };
    }
    return {ok: true, binding, profileDoc};
  }

  return Object.freeze({prepareGmQaProfile});
}

function validPayload(value) {
  return isRecord(value)
    && Object.keys(value).length === 1
    && Object.hasOwn(value, "manifestId")
    && value.manifestId === QA_CORE_MANIFEST_ID;
}

function strictCurrencyState(profile, stoneCoinLimit) {
  const stoneCoins = optionalSafeCount(profile.stoneCoins);
  const diamonds = optionalSafeCount(profile.diamonds);
  const backpackExtraSlots = optionalSafeCount(profile.backpackExtraSlots);
  if (
    stoneCoins === null
    || stoneCoins > stoneCoinLimit
    || diamonds === null
    || backpackExtraSlots === null
    || backpackExtraSlots > QA_CORE_BACKPACK_EXTRA_SLOTS
  ) {
    return {
      ok: false,
      code: "gm_qa_profile_state_invalid",
      message: "角色货币或背包容量档案异常，GM测试档案未作任何改变。",
    };
  }
  return {ok: true, stoneCoins, diamonds, backpackExtraSlots};
}

function optionalSafeCount(value) {
  if (value === undefined || value === null) {
    return 0;
  }
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function safeCount(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function safeRevision(value) {
  return safeCount(value);
}

function strictRevision(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function sameDocument(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

module.exports = {
  GM_PREPARE_QA_PROFILE_COMMAND_ID,
  QA_CORE_MANIFEST_ID,
  QA_CORE_ITEMS,
  createGmQaProfileDomain,
};
