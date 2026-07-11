"use strict";

function createMailChatDomain(ctx) {
  const {
    CHAT_CHANNEL_NEARBY,
    CHAT_CHANNEL_TEAM,
    CHAT_HISTORY_LIMIT,
    MAIL_BODY_MAX_LENGTH,
    MAIL_TITLE_MAX_LENGTH,
    MAX_CHAT_MESSAGES,
    activeQuestAutoClaim,
    addClaimedMailItemsToActiveBattleRoom,
    addRewardItemsToBackpack,
    bagItemById,
    bagItemIsBound,
    bagItemLabel,
    backpackItemCount,
    captureToolBagFromProfile,
    clampInt,
    clone,
    claimActiveQuestToProfile,
    consumeBackpackItem,
    emitServiceEvent,
    fail,
    isoNow,
    itemAmountText,
    isEquipmentItemId,
    load,
    normalizeBackpackSlots,
    normalizeChatChannel,
    normalizeChatText,
    normalizeMailCurrency,
    normalizeMailItems,
    normalizeMailText,
    normalizeUsername,
    now,
    ok,
    partyForAccount,
    persistProfileForAccount,
    profileBackpackSlots,
    rawBackpackAssetConflict,
    profileBindingForAccount,
    profileCurrencyAmount,
    profileStoneCoinLimit = 10000000,
    profileSummaryForAccount,
    publicAccount,
    publicBattleRoom,
    publicChatMessage,
    publicMail,
    publicParty,
    randomId,
    recordQuestEventToProfile,
    resolveSession,
    save,
    setProfileCurrencyAmount,
    shopCurrencyLabel,
  } = ctx;

  const equipmentItemPredicate = typeof isEquipmentItemId === "function" ? isEquipmentItemId : null;

  function sendMail(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const recipientUsername = normalizeUsername(payload.recipientUsername || payload.toUsername || payload.username || "");
    const recipient = data.accounts[recipientUsername];
    if (!recipient) {
      return fail("recipient_missing", "收件账号不存在。");
    }
    if (recipient.accountId === resolved.account.accountId) {
      return fail("recipient_self", "不能给自己发送邮件。");
    }
    const title = normalizeMailText(payload.title, MAIL_TITLE_MAX_LENGTH);
    if (!title) {
      return fail("invalid_title", "邮件标题不能为空。");
    }
    const body = normalizeMailText(payload.body, MAIL_BODY_MAX_LENGTH);
    if (!body) {
      return fail("invalid_body", "邮件正文不能为空。");
    }
    const rawAttachments = payload.items || payload.attachments || [];
    const rawAttachmentConflict = rawMailItemConflict(rawAttachments);
    if (rawAttachmentConflict) {
      return fail(rawAttachmentConflict.code, rawAttachmentConflict.message);
    }
    const attachments = normalizeMailItems(rawAttachments);
    const unsupportedEquipment = firstUnsupportedEquipmentTransfer(attachments);
    if (unsupportedEquipment) {
      return fail(
        "mail_equipment_transfer_unsupported",
        `${bagItemLabel(unsupportedEquipment.itemId)} 暂不能作为邮件附件发送，请先留在背包。`,
      );
    }
    let senderProfileDoc = null;
    let senderProfile = null;
    let senderBinding = null;
    if (attachments.length > 0) {
      senderBinding = profileBindingForAccount(data, resolved.account, now);
      senderProfileDoc = data.profiles[senderBinding.playerId] || null;
      if (!senderProfileDoc || !senderProfileDoc.profile || typeof senderProfileDoc.profile !== "object" || Array.isArray(senderProfileDoc.profile)) {
        return fail("profile_missing", "请先创建角色档案。", {
          profileBinding: senderBinding,
          profileSummary: profileSummaryForAccount(resolved.account, data),
        });
      }
      const backpackConflict = typeof rawBackpackAssetConflict === "function"
        ? rawBackpackAssetConflict(senderProfileDoc.profile)
        : {ok: false, code: "backpack_asset_guard_missing", message: "背包安全校验暂不可用，本次操作已取消，请联系GM处理。"};
      if (backpackConflict) {
        return fail(backpackConflict.code, backpackConflict.message, {
          profileBinding: senderBinding,
          profileSummary: profileSummaryForAccount(resolved.account, data),
        });
      }
      senderProfile = clone(senderProfileDoc.profile);
      const senderSlots = normalizeBackpackSlots(profileBackpackSlots(senderProfile));
      for (const item of attachments) {
        if (bagItemIsBound(item.itemId)) {
          return fail("mail_attachment_bound", `${bagItemLabel(item.itemId)} 已绑定，不能作为邮件附件发送。`, {
            itemId: item.itemId,
          });
        }
        if (backpackItemCount(senderSlots, item.itemId) < item.count) {
          return fail("mail_attachment_not_enough", `${bagItemLabel(item.itemId)} 数量不够。`, {
            itemId: item.itemId,
            required: item.count,
          });
        }
      }
      let nextSlots = senderSlots;
      for (const item of attachments) {
        nextSlots = consumeBackpackItem(nextSlots, item.itemId, item.count);
      }
      senderProfile.backpackSlots = normalizeBackpackSlots(nextSlots);
      senderProfile.captureTools = captureToolBagFromProfile(senderProfile);
      const updatedAt = isoNow(now);
      const nextRevision = Number(senderBinding.profileRevision || 0) + 1;
      senderBinding.profileRevision = nextRevision;
      senderBinding.updatedAt = updatedAt;
      data.profileBindings[resolved.account.accountId] = senderBinding;
      data.profiles[senderBinding.playerId] = {
        playerId: senderBinding.playerId,
        accountId: resolved.account.accountId,
        profileRevision: nextRevision,
        profile: senderProfile,
        updatedAt,
        schemaVersion: 1,
      };
    }
    const mail = {
      mailId: `mail_${randomId()}`,
      senderAccountId: resolved.account.accountId,
      senderUsername: resolved.account.username,
      senderDisplayName: resolved.account.displayName,
      recipientAccountId: recipient.accountId,
      recipientUsername: recipient.username,
      recipientDisplayName: recipient.displayName,
      title,
      body,
      items: attachments,
      createdAt: isoNow(now),
      readAt: null,
      schemaVersion: 1,
    };
    data.mailMessages[mail.mailId] = mail;
    save(data);
    return ok({
      mail: publicMail(mail),
      profileSummary: senderBinding ? profileSummaryForAccount(resolved.account, data) : undefined,
      profile: senderProfile ? clone(senderProfile) : undefined,
      message: "邮件已发送。",
    });
  }

  function listInbox(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const messages = Object.values(data.mailMessages)
      .filter((mail) => mail && mail.recipientAccountId === resolved.account.accountId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map(publicMail);
    return ok({
      messages,
      unreadCount: messages.filter((mail) => !mail.readAt).length,
    });
  }

  function markMailRead(token, mailId) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const normalizedMailId = String(mailId || "").trim();
    const mail = data.mailMessages[normalizedMailId];
    if (!mail || mail.recipientAccountId !== resolved.account.accountId) {
      return fail("mail_missing", "邮件不存在。");
    }
    if (!mail.readAt) {
      mail.readAt = isoNow(now);
      data.mailMessages[normalizedMailId] = mail;
      save(data);
    }
    return ok({
      mail: publicMail(mail),
      message: "邮件已读。",
    });
  }

  function claimMailAttachments(token, mailId) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const normalizedMailId = String(mailId || "").trim();
    const mail = data.mailMessages[normalizedMailId];
    if (!mail || mail.recipientAccountId !== resolved.account.accountId) {
      return fail("mail_missing", "邮件不存在。");
    }
    const rawMailConflict = rawStoredMailAssetConflict(mail);
    if (rawMailConflict) {
      return fail(rawMailConflict.code, rawMailConflict.message);
    }
    const attachments = normalizeMailItems(mail.items || []);
    const currency = normalizeMailCurrency(mail.currency || mail.currencies || {});
    const unsupportedEquipment = firstUnsupportedEquipmentTransfer(attachments);
    if (unsupportedEquipment) {
      return fail("mail_equipment_transfer_unsupported", `${bagItemLabel(unsupportedEquipment.itemId)} 暂不能从邮件领取，附件和货币会原样保留，请联系GM处理。`, {
        mail: publicMail(mail),
      });
    }
    if (attachments.length <= 0 && mailCurrencyTotal(currency) <= 0) {
      return fail("mail_no_attachments", "邮件没有可领取附件。", {
        mail: publicMail(mail),
      });
    }
    const binding = profileBindingForAccount(data, resolved.account, now);
    const profileDoc = data.profiles[binding.playerId] || null;
    if (!profileDoc || !profileDoc.profile || typeof profileDoc.profile !== "object" || Array.isArray(profileDoc.profile)) {
      return fail("profile_missing", "请先创建角色档案。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const backpackConflict = typeof rawBackpackAssetConflict === "function"
      ? rawBackpackAssetConflict(profileDoc.profile)
      : {ok: false, code: "backpack_asset_guard_missing", message: "背包安全校验暂不可用，本次操作已取消，请联系GM处理。"};
    if (backpackConflict) {
      return fail(backpackConflict.code, backpackConflict.message, {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const profile = clone(profileDoc.profile);
    const stoneCoinAmount = Math.max(0, Math.trunc(Number(currency.stoneCoins || 0)));
    if (stoneCoinAmount > 0 && profileCurrencyAmount(profile, "stoneCoins") + stoneCoinAmount > profileStoneCoinLimit) {
      return fail("wallet_stone_coin_limit", `身上石币上限为${profileStoneCoinLimit}，请先存入银行后再领取。`, {
        mail: publicMail(mail),
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    let addResult = {
      slots: profileBackpackSlots(profile),
      addedItems: [],
      lostItems: attachments,
    };
    if (attachments.length > 0) {
      addResult = addRewardItemsToBackpack(profileBackpackSlots(profile), attachments);
    }
    if (addResult.addedItems.length <= 0 && mailCurrencyTotal(currency) <= 0) {
      return fail("backpack_full", "背包已满，无法领取邮件附件。", {
        mail: publicMail(mail),
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    for (const [currencyId, amount] of Object.entries(currency)) {
      setProfileCurrencyAmount(profile, currencyId, profileCurrencyAmount(profile, currencyId) + amount);
    }
    profile.backpackSlots = addResult.slots;
    profile.captureTools = captureToolBagFromProfile(profile);
    const remaining = normalizeMailItems(addResult.lostItems);
    if (remaining.length > 0) {
      mail.items = remaining;
      mail.currency = {};
      data.mailMessages[normalizedMailId] = mail;
    } else {
      delete data.mailMessages[normalizedMailId];
    }
    const questMessages = recordAndClaimQuest(profile, {
      type: "claim_mail",
      mailKind: String(mail.mailKind || ""),
      amount: 1,
      schemaVersion: 1,
    });
    const persisted = persistProfileForAccount(data, resolved.account, binding, profile, now);
    const battleRoom = addClaimedMailItemsToActiveBattleRoom
      ? addClaimedMailItemsToActiveBattleRoom(data, resolved.account.accountId, addResult.addedItems)
      : null;
    save(data);
    const message = "领取邮件附件：%s。".replace("%s", mailAttachmentText(currency, addResult.addedItems));
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      mail: remaining.length > 0 ? publicMail(mail) : null,
      battleRoom: battleRoom && publicBattleRoom
        ? publicBattleRoom(battleRoom, resolved.account.accountId)
        : null,
      claim: {
        mailId: normalizedMailId,
        addedItems: addResult.addedItems,
        currency,
        remainingItems: remaining,
        schemaVersion: 1,
      },
      questMessages,
      message: remaining.length > 0 ? `${message} 背包空间不足，剩余附件留在邮箱。` : message,
    });
  }

  function mailCurrencyTotal(currency) {
    return Object.values(currency || {}).reduce((total, value) => total + Math.max(0, Math.trunc(Number(value || 0))), 0);
  }

  function firstUnsupportedEquipmentTransfer(items) {
    for (const item of Array.isArray(items) ? items : []) {
      const itemId = String(item && item.itemId || "").trim();
      if (itemId === "") {
        continue;
      }
      // Missing catalog authority must not silently reopen template-only equipment transfers.
      if (!equipmentItemPredicate || equipmentItemPredicate(itemId)) {
        return {itemId};
      }
    }
    return null;
  }

  function rawStoredMailAssetConflict(mail) {
    const schemaStatus = rawMailSchemaVersionStatus(mail, 1);
    if (schemaStatus === "invalid") {
      return {
        code: "mail_schema_invalid",
        message: "这封邮件的数据版本无法识别，暂不能领取；附件和货币会原样保留，请联系GM处理。",
      };
    }
    if (schemaStatus === "future") {
      return {
        code: "mail_schema_future",
        message: "这封邮件来自更高版本，暂不能领取；附件和货币会原样保留，请联系GM处理。",
      };
    }
    if (mail && ["attachments", "itemAmounts"].some((field) => Object.hasOwn(mail, field))) {
      return {
        code: "mail_representation_conflict",
        message: "这封邮件含当前版本无法安全读取的附件档案，附件和货币会原样保留，请联系GM处理。",
      };
    }
    const allowedFields = new Set([
      "mailId", "mailKind",
      "senderAccountId", "senderUsername", "senderDisplayName",
      "recipientAccountId", "recipientUsername", "recipientDisplayName",
      "title", "body", "items", "currency", "currencies",
      "createdAt", "readAt", "schemaVersion",
    ]);
    if (mail && Object.keys(mail).some((key) => !allowedFields.has(key))) {
      return {
        code: "mail_schema_unsupported",
        message: "这封邮件含当前版本无法安全读取的数据，暂不能领取；附件和货币会原样保留，请联系GM处理。",
      };
    }
    const rawItems = mail && Object.hasOwn(mail, "items") ? mail.items : [];
    return rawMailItemConflict(rawItems) || rawMailCurrencyConflict(mail);
  }

  function rawMailItemConflict(items) {
    if (!Array.isArray(items)) {
      return {
        code: "mail_item_invalid",
        message: "邮件附件档案异常，本次操作已取消；附件和货币会原样保留，请联系GM处理。",
      };
    }
    const totals = new Map();
    for (const entry of items) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return {
          code: "mail_item_invalid",
          message: "邮件附件档案异常，本次操作已取消；附件和货币会原样保留，请联系GM处理。",
        };
      }
      const itemId = String(entry.itemId || "").trim();
      if (itemId === "" || typeof bagItemById !== "function" || !bagItemById(itemId)) {
        return {
          code: itemId === "" ? "mail_item_invalid" : "mail_item_unknown",
          message: itemId === ""
            ? "邮件附件档案异常，本次操作已取消；附件和货币会原样保留，请联系GM处理。"
            : "邮件含当前版本无法识别的物品，本次操作已取消；附件和货币会原样保留，请联系GM处理。",
        };
      }
      if (!equipmentItemPredicate || equipmentItemPredicate(itemId)) {
        return {
          code: "mail_equipment_transfer_unsupported",
          message: `${bagItemLabel(itemId)} 暂不能通过邮件流转；附件和货币会原样保留，请联系GM处理。`,
        };
      }
      const count = Number(entry.count);
      if (!Number.isSafeInteger(count) || count < 1 || Object.keys(entry).some((key) => !["itemId", "count"].includes(key))) {
        return {
          code: "mail_item_invalid",
          message: "邮件附件档案异常，本次操作已取消；附件和货币会原样保留，请联系GM处理。",
        };
      }
      const nextTotal = Number(totals.get(itemId) || 0) + count;
      if (!Number.isSafeInteger(nextTotal)) {
        return {
          code: "mail_item_invalid",
          message: "邮件附件档案异常，本次操作已取消；附件和货币会原样保留，请联系GM处理。",
        };
      }
      totals.set(itemId, nextTotal);
    }
    return null;
  }

  function rawMailCurrencyConflict(mail) {
    if (!mail || typeof mail !== "object" || Array.isArray(mail)) {
      return null;
    }
    const representations = [];
    for (const field of ["currency", "currencies"]) {
      if (!Object.hasOwn(mail, field)) {
        continue;
      }
      const value = mail[field];
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return rawMailCurrencyInvalid();
      }
      const allowed = new Set(["stoneCoins", "coins", "diamonds", "diamond"]);
      if (Object.keys(value).some((key) => !allowed.has(key))) {
        return {
          code: "mail_currency_unknown",
          message: "邮件含当前版本无法识别的货币，暂不能领取；附件和货币会原样保留，请联系GM处理。",
        };
      }
      for (const key of Object.keys(value)) {
        const amount = Number(value[key]);
        if (!Number.isSafeInteger(amount) || amount < 0) {
          return rawMailCurrencyInvalid();
        }
      }
      if (
        (Object.hasOwn(value, "stoneCoins") && Object.hasOwn(value, "coins") && Number(value.stoneCoins) !== Number(value.coins))
        || (Object.hasOwn(value, "diamonds") && Object.hasOwn(value, "diamond") && Number(value.diamonds) !== Number(value.diamond))
      ) {
        return rawMailCurrencyInvalid();
      }
      representations.push(JSON.stringify({
        diamonds: Number(value.diamonds ?? value.diamond ?? 0),
        stoneCoins: Number(value.stoneCoins ?? value.coins ?? 0),
      }));
    }
    if (representations.length > 1 && representations.some((value) => value !== representations[0])) {
      return rawMailCurrencyInvalid();
    }
    return null;
  }

  function rawMailCurrencyInvalid() {
    return {
      code: "mail_currency_invalid",
      message: "邮件货币档案异常，暂不能领取；附件和货币会原样保留，请联系GM处理。",
    };
  }

  function rawMailSchemaVersionStatus(container, currentVersion) {
    if (!container || !Object.hasOwn(container, "schemaVersion")) {
      return "legacy";
    }
    const version = Number(container.schemaVersion);
    if (!Number.isInteger(version) || version < 1) {
      return "invalid";
    }
    return version > currentVersion ? "future" : "current";
  }

  function mailCurrencyText(currency) {
    const parts = [];
    for (const currencyId of ["stoneCoins", "diamonds"]) {
      const amount = Math.max(0, Math.trunc(Number((currency || {})[currencyId] || 0)));
      if (amount > 0) {
        const label = typeof shopCurrencyLabel === "function" ? shopCurrencyLabel(currencyId) : currencyId;
        parts.push(`${amount}${label}`);
      }
    }
    return parts.join("、");
  }

  function mailAttachmentText(currency, items) {
    const parts = [];
    const currencyText = mailCurrencyText(currency);
    const itemText = itemAmountText(items);
    if (currencyText) {
      parts.push(currencyText);
    }
    if (itemText) {
      parts.push(itemText);
    }
    return parts.join("、") || "无";
  }

  function listChatMessages(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const channel = normalizeChatChannel(payload.channel || CHAT_CHANNEL_NEARBY);
    if (!channel) {
      return fail("chat_channel_invalid", "聊天频道不存在。");
    }
    const party = partyForAccount(data, resolved.account.accountId);
    const limit = clampInt(payload.limit, 1, CHAT_HISTORY_LIMIT, CHAT_HISTORY_LIMIT);
    let messages = [];
    if (channel === CHAT_CHANNEL_TEAM) {
      if (!party) {
        return ok({channel, messages: [], party: null});
      }
      messages = data.chatMessages.filter((message) => message && message.channel === channel && message.partyId === party.partyId);
    } else {
      messages = data.chatMessages.filter((message) => message && message.channel === CHAT_CHANNEL_NEARBY);
    }
    messages = messages
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .slice(-limit)
      .map(publicChatMessage);
    return ok({
      channel,
      messages,
      party: party ? publicParty(party, data) : null,
    });
  }

  function sendChatMessage(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const channel = normalizeChatChannel(payload.channel || CHAT_CHANNEL_NEARBY);
    if (!channel) {
      return fail("chat_channel_invalid", "聊天频道不存在。");
    }
    const text = normalizeChatText(payload.text);
    if (!text) {
      return fail("chat_empty", "消息不能为空。");
    }
    const party = partyForAccount(data, resolved.account.accountId);
    if (channel === CHAT_CHANNEL_TEAM && !party) {
      return fail("chat_team_missing", "需要加入队伍才能发送队伍消息。");
    }
    const message = {
      messageId: `chat_${randomId()}`,
      channel,
      partyId: channel === CHAT_CHANNEL_TEAM && party ? party.partyId : "",
      senderAccountId: resolved.account.accountId,
      senderUsername: resolved.account.username,
      senderDisplayName: resolved.account.displayName,
      text,
      createdAt: isoNow(now),
      schemaVersion: 1,
    };
    data.chatMessages.push(message);
    while (data.chatMessages.length > MAX_CHAT_MESSAGES) {
      data.chatMessages.shift();
    }
    let profile = null;
    let persisted = null;
    let questMessages = [];
    const binding = profileBindingForAccount(data, resolved.account, now);
    const profileDoc = data.profiles[binding.playerId] || null;
    if (profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" && !Array.isArray(profileDoc.profile)) {
      const assetConflict = typeof rawBackpackAssetConflict === "function"
        ? rawBackpackAssetConflict(profileDoc.profile)
        : {code: "backpack_asset_guard_missing"};
      if (!assetConflict) {
        profile = clone(profileDoc.profile);
        questMessages = recordAndClaimQuest(profile, {
          type: "send_chat",
          channel,
          amount: 1,
          schemaVersion: 1,
        });
        if (questMessages.length > 0) {
          persisted = persistProfileForAccount(data, resolved.account, binding, profile, now);
        }
      }
    }
    save(data);
    emitServiceEvent({
      type: "chat.message",
      targetAccountIds: channel === CHAT_CHANNEL_TEAM && party ? party.memberAccountIds.slice() : null,
      channel,
      message: publicChatMessage(message),
      party: party ? publicParty(party, data) : null,
    });
    return ok({
      message: publicChatMessage(message),
      party: party ? publicParty(party, data) : null,
      profile: persisted ? clone(profile) : undefined,
      profileBinding: persisted ? persisted.binding : undefined,
      profileSummary: persisted ? profileSummaryForAccount(resolved.account, data) : undefined,
      questMessages,
    });
  }

  function recordAndClaimQuest(profile, event) {
    const messages = [];
    const progress = recordQuestEventToProfile(profile, event);
    if (progress.changed && progress.message) {
      messages.push(progress.message);
    }
    if (progress.ready && activeQuestAutoClaim(profile)) {
      const claim = claimActiveQuestToProfile(profile);
      if (claim.ok && claim.message) {
        messages.push(claim.message);
      }
    }
    return messages;
  }

  return {
    sendMail,
    listInbox,
    markMailRead,
    claimMailAttachments,
    listChatMessages,
    sendChatMessage,
  };
}

module.exports = {createMailChatDomain};
