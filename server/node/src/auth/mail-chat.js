"use strict";

function createMailChatDomain(ctx) {
  const {
    CHAT_CHANNEL_NEARBY,
    CHAT_CHANNEL_TEAM,
    CHAT_HISTORY_LIMIT,
    MAIL_BODY_MAX_LENGTH,
    MAIL_TITLE_MAX_LENGTH,
    MAX_CHAT_MESSAGES,
    addClaimedMailItemsToActiveBattleRoom,
    addRewardItemsToBackpack,
    bagItemLabel,
    backpackItemCount,
    captureToolBagFromProfile,
    clampInt,
    clone,
    consumeBackpackItem,
    emitServiceEvent,
    fail,
    isoNow,
    itemAmountText,
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
    profileBackpackSlots,
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
    resolveSession,
    save,
    setProfileCurrencyAmount,
    shopCurrencyLabel,
  } = ctx;

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
    const attachments = normalizeMailItems(payload.items || payload.attachments || []);
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
      senderProfile = clone(senderProfileDoc.profile);
      const senderSlots = normalizeBackpackSlots(profileBackpackSlots(senderProfile));
      for (const item of attachments) {
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
    const attachments = normalizeMailItems(mail.items || []);
    const currency = normalizeMailCurrency(mail.currency || mail.currencies || {});
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
    const profile = clone(profileDoc.profile);
    const stoneCoinAmount = Math.max(0, Math.trunc(Number(currency.stoneCoins || 0)));
    if (stoneCoinAmount > 0 && profileCurrencyAmount(profile, "stoneCoins") + stoneCoinAmount > profileStoneCoinLimit) {
      return fail("wallet_stone_coin_limit", `身上石币上限为${profileStoneCoinLimit}，请先存入银行后再领取。`, {
        mail: publicMail(mail),
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    let addResult = {
      slots: normalizeBackpackSlots(profileBackpackSlots(profile)),
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
    profile.backpackSlots = normalizeBackpackSlots(addResult.slots);
    profile.captureTools = captureToolBagFromProfile(profile);
    const remaining = normalizeMailItems(addResult.lostItems);
    if (remaining.length > 0) {
      mail.items = remaining;
      mail.currency = {};
      data.mailMessages[normalizedMailId] = mail;
    } else {
      delete data.mailMessages[normalizedMailId];
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
    const battleRoom = addClaimedMailItemsToActiveBattleRoom
      ? addClaimedMailItemsToActiveBattleRoom(data, resolved.account.accountId, addResult.addedItems)
      : null;
    save(data);
    const message = "领取邮件附件：%s。".replace("%s", mailAttachmentText(currency, addResult.addedItems));
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      mail: remaining.length > 0 ? publicMail(mail) : null,
      battleRoom: battleRoom && publicBattleRoom ? publicBattleRoom(battleRoom) : null,
      claim: {
        mailId: normalizedMailId,
        addedItems: addResult.addedItems,
        currency,
        remainingItems: remaining,
        schemaVersion: 1,
      },
      message: remaining.length > 0 ? `${message} 背包空间不足，剩余附件留在邮箱。` : message,
    });
  }

  function mailCurrencyTotal(currency) {
    return Object.values(currency || {}).reduce((total, value) => total + Math.max(0, Math.trunc(Number(value || 0))), 0);
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
    });
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
