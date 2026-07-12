"use strict";

const {
  buildMailAttachmentState,
  readMailAttachmentState,
  updateMailAttachmentState,
} = require("./mail-attachment-state");
const {
  exportBackpackEquipmentEnvelope,
  importBackpackEquipmentEnvelope,
} = require("./equipment-transfer-envelope");
const {
  OWNER_KIND_MAIL,
  createEquipmentEnvelopeOwnershipRegistry,
} = require("./equipment-envelope-registry");
const {
  ensureConsumedEquipmentEnvelopeIds,
} = require("./equipment-envelope-consumed-ledger");

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
    bagItemStackLimit,
    backpackItemCount,
    battleEquipmentCatalog,
    captureToolBagFromProfile,
    clampInt,
    clone,
    claimActiveQuestToProfile,
    consumeBackpackItem,
    emitServiceEvent,
    equipmentTransferOptions = {},
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
    const parsedAttachments = parseMailSendAttachments(payload);
    if (!parsedAttachments.ok) {
      return fail(parsedAttachments.code, parsedAttachments.message, parsedAttachments.details || {});
    }
    const attachments = parsedAttachments.items;
    const ordinaryAttachments = parsedAttachments.ordinaryItems;
    const equipmentAttachments = parsedAttachments.equipmentItems;
    const mailIdResult = nextMailId(data);
    if (!mailIdResult.ok) {
      return fail(mailIdResult.code, mailIdResult.message);
    }
    const envelopeRegistry = createEquipmentEnvelopeOwnershipRegistry(data);
    let nextConsumedLedger = data.consumedEquipmentEnvelopes;
    let senderProfile = null;
    let senderBinding = null;
    if (attachments.length > 0) {
      senderBinding = profileBindingForAccount(data, resolved.account, now);
      const senderProfileDoc = data.profiles[senderBinding.playerId] || null;
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
      for (const item of [...ordinaryAttachments, ...equipmentAttachments]) {
        if (bagItemIsBound(item.itemId)) {
          return fail("mail_attachment_bound", `${bagItemLabel(item.itemId)} 已绑定，不能作为邮件附件发送。`, {
            itemId: item.itemId,
          });
        }
      }
      for (const item of ordinaryAttachments) {
        if (backpackItemCount(senderSlots, item.itemId) < item.count) {
          return fail("mail_attachment_not_enough", `${bagItemLabel(item.itemId)} 数量不够。`, {
            itemId: item.itemId,
            required: item.count,
          });
        }
      }
      const reservedEnvelopeIds = new Set();
      const equipmentEnvelopes = [];
      for (const item of equipmentAttachments) {
        const sourceOwnership = envelopeRegistry.requireMaterializedInstanceOrigin(
          senderBinding.playerId,
          item.instanceId,
        );
        if (!sourceOwnership.ok) {
          return fail(sourceOwnership.code, sourceOwnership.message, {
            profileSummary: profileSummaryForAccount(resolved.account, data),
          });
        }
        if (sourceOwnership.hasOrigin) {
          const consumed = ensureConsumedEquipmentEnvelopeIds(nextConsumedLedger, sourceOwnership.envelopeId);
          if (!consumed.ok) {
            return fail(consumed.code, consumed.message, {
              profileSummary: profileSummaryForAccount(resolved.account, data),
            });
          }
          nextConsumedLedger = consumed.ledger;
        }
        const envelopeId = nextMailEquipmentEnvelopeId(envelopeRegistry, reservedEnvelopeIds);
        if (!envelopeId.ok) {
          return fail(envelopeId.code, envelopeId.message, {
            profileSummary: profileSummaryForAccount(resolved.account, data),
          });
        }
        const exported = exportBackpackEquipmentEnvelope(
          senderProfile,
          battleEquipmentCatalog,
          item.itemId,
          item.instanceId,
          {
            ...equipmentTransferOptions,
            backpackSlotLimit: Math.max(1, normalizeBackpackSlots(profileBackpackSlots(senderProfile)).length),
            stackLimit: Math.max(1, Number(bagItemStackLimit(item.itemId) || 1)),
            sourceSlotIndex: item.sourceSlotIndex,
            envelopeId: envelopeId.envelopeId,
          },
        );
        if (!exported.ok) {
          return fail(exported.code, exported.message, {
            itemId: item.itemId,
            instanceId: item.instanceId,
            profileSummary: profileSummaryForAccount(resolved.account, data),
          });
        }
        senderProfile = exported.profile;
        equipmentEnvelopes.push(exported.envelope);
        reservedEnvelopeIds.add(exported.envelope.envelopeId);
      }
      let nextSlots = normalizeBackpackSlots(profileBackpackSlots(senderProfile));
      for (const item of ordinaryAttachments) {
        nextSlots = consumeBackpackItem(nextSlots, item.itemId, item.count);
      }
      senderProfile.backpackSlots = normalizeBackpackSlots(nextSlots);
      senderProfile.captureTools = captureToolBagFromProfile(senderProfile);
      parsedAttachments.equipmentEnvelopes = equipmentEnvelopes;
    }
    const builtMail = buildMailAttachmentState({
      mailId: mailIdResult.mailId,
      senderAccountId: resolved.account.accountId,
      senderUsername: resolved.account.username,
      senderDisplayName: resolved.account.displayName,
      recipientAccountId: recipient.accountId,
      recipientUsername: recipient.username,
      recipientDisplayName: recipient.displayName,
      title,
      body,
      items: attachments,
      equipmentEnvelopes: parsedAttachments.equipmentEnvelopes || [],
      currency: {},
      createdAt: isoNow(now),
      readAt: null,
    }, battleEquipmentCatalog, mailAttachmentStateOptions());
    if (!builtMail.ok) {
      return fail(builtMail.code, builtMail.message);
    }
    const mail = builtMail.mail;
    data.consumedEquipmentEnvelopes = nextConsumedLedger;
    if (senderProfile && senderBinding) {
      persistProfileForAccount(data, resolved.account, senderBinding, senderProfile, now);
    }
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
    for (const [mailKey, mail] of Object.entries(data.mailMessages || {})) {
      const rawRecipientAccountId = mail && typeof mail === "object" && !Array.isArray(mail)
        ? mail.recipientAccountId
        : null;
      if (
        typeof rawRecipientAccountId !== "string"
        || rawRecipientAccountId.trim() !== resolved.account.accountId
      ) {
        continue;
      }
      const identityConflict = mailRuntimeIdentityConflict(mailKey, mail);
      if (identityConflict) {
        return fail(identityConflict.code, identityConflict.message);
      }
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
    if (!mail) {
      return fail("mail_missing", "邮件不存在。");
    }
    const identityConflict = mailRuntimeIdentityConflict(normalizedMailId, mail);
    if (identityConflict) {
      return fail(identityConflict.code, identityConflict.message);
    }
    if (mail.recipientAccountId !== resolved.account.accountId) {
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
    if (!mail) {
      return fail("mail_missing", "邮件不存在。");
    }
    const identityConflict = mailRuntimeIdentityConflict(normalizedMailId, mail);
    if (identityConflict) {
      return fail(identityConflict.code, identityConflict.message);
    }
    if (mail.recipientAccountId !== resolved.account.accountId) {
      return fail("mail_missing", "邮件不存在。");
    }
    const attachmentState = readMailAttachmentState(
      mail,
      battleEquipmentCatalog,
      mailAttachmentStateOptions(),
    );
    if (!attachmentState.ok) {
      return fail(attachmentState.code, attachmentState.message, {
        mail: publicMail(mail),
      });
    }
    const envelopeRegistry = createEquipmentEnvelopeOwnershipRegistry(data);
    for (const envelope of attachmentState.equipmentEnvelopes) {
      const ownership = envelopeRegistry.requireUnique(envelope.envelopeId, {
        kind: OWNER_KIND_MAIL,
        id: normalizedMailId,
      });
      if (!ownership.ok) {
        return fail(ownership.code, ownership.message, {mail: publicMail(mail)});
      }
    }
    const currency = attachmentState.currency;
    if (attachmentState.items.length <= 0 && mailCurrencyTotal(currency) <= 0) {
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
    let profile = clone(profileDoc.profile);
    const stoneCoinAmount = Math.max(0, Math.trunc(Number(currency.stoneCoins || 0)));
    if (stoneCoinAmount > 0 && profileCurrencyAmount(profile, "stoneCoins") + stoneCoinAmount > profileStoneCoinLimit) {
      return fail("wallet_stone_coin_limit", `身上石币上限为${profileStoneCoinLimit}，请先存入银行后再领取。`, {
        mail: publicMail(mail),
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const claimedEnvelopeIds = [];
    const importedEquipmentItems = [];
    for (const envelope of attachmentState.equipmentEnvelopes) {
      const imported = importBackpackEquipmentEnvelope(
        profile,
        battleEquipmentCatalog,
        envelope,
        {
          ...equipmentTransferOptions,
          backpackSlotLimit: Math.max(1, normalizeBackpackSlots(profileBackpackSlots(profile)).length),
          stackLimit: Math.max(1, Number(bagItemStackLimit(envelope.itemId) || 1)),
          trustedServerEnvelope: true,
        },
      );
      if (!imported.ok) {
        if (imported.code === "equipment_transfer_backpack_full") {
          continue;
        }
        return fail(imported.code, imported.message, {
          mail: publicMail(mail),
          profileSummary: profileSummaryForAccount(resolved.account, data),
        });
      }
      profile = imported.profile;
      claimedEnvelopeIds.push(envelope.envelopeId);
      importedEquipmentItems.push({itemId: envelope.itemId, count: 1});
    }
    let addResult = {
      slots: profileBackpackSlots(profile),
      addedItems: [],
      lostItems: attachmentState.ordinaryItems,
    };
    if (attachmentState.ordinaryItems.length > 0) {
      addResult = addRewardItemsToBackpack(profileBackpackSlots(profile), attachmentState.ordinaryItems);
    }
    const addedItems = normalizeMailItems([...importedEquipmentItems, ...addResult.addedItems]);
    if (addedItems.length <= 0 && mailCurrencyTotal(currency) <= 0) {
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
    const updatedMail = updateMailAttachmentState(
      mail,
      {
        claimedOrdinaryItems: addResult.addedItems,
        claimedEnvelopeIds,
        claimCurrency: true,
      },
      battleEquipmentCatalog,
      mailAttachmentStateOptions(),
    );
    if (!updatedMail.ok) {
      return fail(updatedMail.code, updatedMail.message, {
        mail: publicMail(mail),
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const consumed = ensureConsumedEquipmentEnvelopeIds(
      data.consumedEquipmentEnvelopes,
      claimedEnvelopeIds,
    );
    if (!consumed.ok) {
      return fail(consumed.code, consumed.message, {
        mail: publicMail(mail),
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    data.consumedEquipmentEnvelopes = consumed.ledger;
    if (!updatedMail.empty) {
      data.mailMessages[normalizedMailId] = updatedMail.mail;
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
      ? addClaimedMailItemsToActiveBattleRoom(data, resolved.account.accountId, addedItems)
      : null;
    save(data);
    const message = "领取邮件附件：%s。".replace("%s", mailAttachmentText(currency, addedItems));
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: clone(profile),
      mail: updatedMail.empty ? null : publicMail(updatedMail.mail),
      battleRoom: battleRoom && publicBattleRoom
        ? publicBattleRoom(battleRoom, resolved.account.accountId)
        : null,
      claim: {
        mailId: normalizedMailId,
        addedItems,
        importedEquipmentInstanceIds: claimedEnvelopeIds.map((envelopeId) => {
          const instance = Object.values(profile.equipmentInstances || {}).find((entry) => (
            entry
            && entry.transferProvenance
            && entry.transferProvenance.originEnvelopeId === envelopeId
          ));
          return String(instance && instance.instanceId || "");
        }).filter(Boolean),
        currency,
        remainingItems: updatedMail.remaining.items,
        schemaVersion: 2,
      },
      questMessages,
      message: updatedMail.empty ? message : `${message} 背包空间不足，剩余附件留在邮箱。`,
    });
  }

  function mailCurrencyTotal(currency) {
    return Object.values(currency || {}).reduce((total, value) => total + Math.max(0, Math.trunc(Number(value || 0))), 0);
  }

  function mailAttachmentStateOptions() {
    return {
      itemById: (itemId) => typeof bagItemById === "function" ? bagItemById(itemId) : null,
      isEquipmentItemId: (itemId) => Boolean(equipmentItemPredicate && equipmentItemPredicate(itemId)),
      equipmentTransferOptions,
    };
  }

  function parseMailSendAttachments(payload) {
    const fullEnvelopeField = ["equipmentEnvelope", "equipmentEnvelopes", "envelope", "envelopes"]
      .find((field) => Object.hasOwn(payload, field));
    if (fullEnvelopeField) {
      return {
        ok: false,
        code: "mail_equipment_envelope_untrusted",
        message: "客户端不能提交完整装备信封，请只选择背包中的具体装备。",
        details: {field: fullEnvelopeField},
      };
    }
    if (Object.hasOwn(payload, "items") && Object.hasOwn(payload, "attachments")) {
      return {
        ok: false,
        code: "mail_representation_conflict",
        message: "邮件附件请求存在两份表示，请刷新后重试。",
      };
    }
    const rawItems = Object.hasOwn(payload, "items")
      ? payload.items
      : (Object.hasOwn(payload, "attachments") ? payload.attachments : []);
    if (!Array.isArray(rawItems)) {
      return {ok: false, code: "mail_item_invalid", message: "请选择有效的邮件附件。"};
    }
    if (rawItems.length > 0 && !equipmentItemPredicate) {
      return {
        ok: false,
        code: "mail_equipment_authority_missing",
        message: "邮件附件安全校验暂不可用，本次发送已取消，请联系GM处理。",
      };
    }
    const ordinaryItems = [];
    const equipmentItems = [];
    const selectedInstanceIds = new Set();
    for (const [index, rawItem] of rawItems.entries()) {
      if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
        return {ok: false, code: "mail_item_invalid", message: "请选择有效的邮件附件。", details: {index}};
      }
      const itemId = typeof rawItem.itemId === "string" ? rawItem.itemId.trim() : "";
      if (itemId === "" || typeof bagItemById !== "function" || !bagItemById(itemId)) {
        return {
          ok: false,
          code: itemId === "" ? "mail_item_invalid" : "mail_item_unknown",
          message: itemId === "" ? "请选择有效的邮件附件。" : "邮件附件含当前版本无法识别的物品。",
          details: {index, itemId},
        };
      }
      const equipment = equipmentItemPredicate(itemId);
      const allowedFields = equipment
        ? new Set(["itemId", "count", "instanceId", "sourceSlotIndex"])
        : new Set(["itemId", "count"]);
      const unknownField = Object.keys(rawItem).sort().find((key) => !allowedFields.has(key));
      if (unknownField) {
        const untrustedEnvelope = ["envelope", "envelopeId", "equipmentEnvelope", "equipmentEnvelopes", "instanceState", "provenance", "stateFingerprint"]
          .includes(unknownField);
        return {
          ok: false,
          code: untrustedEnvelope ? "mail_equipment_envelope_untrusted" : "mail_item_invalid",
          message: untrustedEnvelope
            ? "客户端不能提交完整装备信封，请只选择背包中的具体装备。"
            : "邮件附件请求含当前版本无法识别的字段。",
          details: {index, field: unknownField},
        };
      }
      const count = Number(rawItem.count);
      if (!Number.isSafeInteger(count) || count < 1) {
        return {ok: false, code: "mail_item_invalid", message: "邮件附件数量无效。", details: {index, itemId}};
      }
      if (!equipment) {
        ordinaryItems.push({itemId, count});
        continue;
      }
      const instanceId = typeof rawItem.instanceId === "string" ? rawItem.instanceId.trim() : "";
      const sourceSlotIndex = Number(rawItem.sourceSlotIndex);
      if (
        count !== 1
        || instanceId === ""
        || rawItem.instanceId !== instanceId
        || !Number.isSafeInteger(sourceSlotIndex)
        || sourceSlotIndex < 0
      ) {
        return {
          ok: false,
          code: "mail_equipment_selection_invalid",
          message: "请选择背包中的具体装备实例后再发送。",
          details: {index, itemId},
        };
      }
      if (selectedInstanceIds.has(instanceId)) {
        return {
          ok: false,
          code: "mail_equipment_selection_duplicate",
          message: "同一件装备不能在一封邮件中重复选择。",
          details: {index, itemId, instanceId},
        };
      }
      selectedInstanceIds.add(instanceId);
      equipmentItems.push({itemId, count: 1, instanceId, sourceSlotIndex});
    }
    const normalizedOrdinaryItems = normalizeMailItems(ordinaryItems);
    return {
      ok: true,
      items: normalizeMailItems([
        ...normalizedOrdinaryItems,
        ...equipmentItems.map((item) => ({itemId: item.itemId, count: 1})),
      ]),
      ordinaryItems: normalizedOrdinaryItems,
      equipmentItems,
      equipmentEnvelopes: [],
    };
  }

  function nextMailEquipmentEnvelopeId(registry, reservedIds = new Set()) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const envelopeId = `eqx_mail_${String(randomId() || "").trim()}`;
      if (
        /^eqx_[A-Za-z0-9_-]{8,156}$/.test(envelopeId)
        && !reservedIds.has(envelopeId)
        && registry.isAvailable(envelopeId)
      ) {
        return {ok: true, envelopeId};
      }
    }
    return {
      ok: false,
      code: "mail_equipment_envelope_id_unavailable",
      message: "暂时无法生成装备邮件凭证，请稍后重试。",
    };
  }

  function nextMailId(data) {
    const mailMessages = data && data.mailMessages && typeof data.mailMessages === "object"
      ? data.mailMessages
      : {};
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const mailId = `mail_${String(randomId() || "").trim()}`;
      if (mailId !== "mail_" && !Object.hasOwn(mailMessages, mailId)) {
        return {ok: true, mailId};
      }
    }
    return {ok: false, code: "mail_id_unavailable", message: "暂时无法生成邮件编号，请稍后重试。"};
  }

  function mailRuntimeIdentityConflict(mailKeyValue, mail) {
    const rawMailKey = typeof mailKeyValue === "string" ? mailKeyValue : "";
    if (!mail || typeof mail !== "object" || Array.isArray(mail)) {
      return {code: "mail_identity_invalid", message: "邮箱中存在身份异常的邮件，请联系GM处理。"};
    }
    const rawDeclaredMailId = typeof mail.mailId === "string" ? mail.mailId : "";
    const rawRecipientAccountId = typeof mail.recipientAccountId === "string" ? mail.recipientAccountId : "";
    if (
      rawMailKey === ""
      || rawMailKey !== rawMailKey.trim()
      || rawDeclaredMailId === ""
      || rawDeclaredMailId !== rawDeclaredMailId.trim()
      || rawDeclaredMailId !== rawMailKey
      || rawRecipientAccountId === ""
      || rawRecipientAccountId !== rawRecipientAccountId.trim()
    ) {
      return {code: "mail_identity_invalid", message: "邮箱中存在身份异常的邮件，请联系GM处理。"};
    }
    return null;
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
