"use strict";

const {
  loadPlayerAppearanceCatalog,
} = require("./player-appearance-catalog");
const {
  ELEMENT_IDS,
  ELEMENT_TOTAL_POINTS,
  inspectPlayerElementAllocation,
} = require("./battle-element-rules");
const {
  inspectCharacterNameSafety,
  loadCharacterNamePolicy,
} = require("./character-name-policy");

const CHARACTER_SLOT_LIMIT = 4;
const CHARACTER_SCHEMA_VERSION = 1;
const CHARACTER_NAME_MAX_GRAPHEMES = 24;
const CHARACTER_NAME_MAX_BYTES = 96;
const CHARACTER_APPEARANCE_CATALOG = loadPlayerAppearanceCatalog();
const CHARACTER_NAME_POLICY = loadCharacterNamePolicy();
const CHARACTER_DEFAULT_APPEARANCE_ID = CHARACTER_APPEARANCE_CATALOG.defaultAppearanceId;
const CHARACTER_APPEARANCE_IDS = CHARACTER_APPEARANCE_CATALOG.appearanceIds;
const CHARACTER_ELEMENT_IDS = ELEMENT_IDS;
const CHARACTER_ELEMENT_TOTAL = ELEMENT_TOTAL_POINTS;
const CHARACTER_NAME_SEGMENTER = new Intl.Segmenter("zh-CN", {granularity: "grapheme"});

function createAccountCharactersDomain(context) {
  const {
    activeBattleRoomForAccount,
    bagItemById,
    battleEquipmentCatalog,
    clone,
    createDefaultServerProfile,
    equipmentTransferOptions,
    fail,
    isoNow,
    load,
    now,
    ok,
    isEquipmentItemId,
    partyForAccount,
    persistProfileForAccount,
    profileSummaryForAccount,
    publicAccount,
    publicSession,
    randomId,
    readMailAttachmentState,
    resolveSession,
    rotateCharacterSession,
    save,
    storeAuthorityRootRecord,
  } = context;

  function ensureForAccount(data, account) {
    const accountId = String(account && account.accountId || "");
    if (accountId === "") {
      return fail("account_missing", "账号不存在。");
    }
    const existing = data.accountCharacterSlots && data.accountCharacterSlots[accountId];
    if (existing !== undefined) {
      return canonicalRoster(data, account, existing);
    }
    if (account.characterSlotsInitialized === true) {
      const slots = emptyCharacterSlots();
      storeAuthorityRootRecord(data, "accountCharacterSlots", accountId, slots);
      return {ok: true, slots, created: true};
    }
    const binding = data.profileBindings && data.profileBindings[accountId];
    if (!binding || String(binding.playerId || "") === "") {
      return fail("profile_binding_missing", "角色绑定不存在，无法建立角色槽。");
    }
    const playerId = String(binding.playerId);
    const profileDoc = data.profiles && data.profiles[playerId];
    if (
      !profileDoc
      || String(profileDoc.playerId || "") !== playerId
      || String(profileDoc.accountId || "") !== accountId
      || !isRecord(profileDoc.profile)
    ) {
      return fail("character_profile_invalid", "现有角色档案异常，已停止自动迁移，请联系GM处理。");
    }
    const timestamp = String(binding.updatedAt || profileDoc.updatedAt || isoNow(now));
    const createdAt = String(binding.createdAt || timestamp);
    const slots = [
      characterSlot({
        accountId,
        slotIndex: 0,
        playerId,
        createdAt,
        updatedAt: timestamp,
        lastSelectedAt: timestamp,
      }),
      null,
      null,
      null,
    ];
    storeAuthorityRootRecord(data, "accountCharacterSlots", accountId, slots);
    return {ok: true, slots, created: true};
  }

  function autoSelectionForAccount(data, account) {
    const ensured = ensureForAccount(data, account);
    if (!ensured.ok) {
      return ensured;
    }
    const occupied = ensured.slots.filter(Boolean);
    if (occupied.length !== 1) {
      return {ok: true, selection: null, slots: ensured.slots, created: ensured.created};
    }
    const activated = activateCharacter(
      data,
      account,
      ensured.slots,
      occupied[0],
      now,
      storeAuthorityRootRecord,
    );
    if (!activated.ok) {
      return activated;
    }
    return {
      ok: true,
      selection: activated.selection,
      slots: activated.slots,
      created: ensured.created,
    };
  }

  function listCharacters(token) {
    const data = load();
    const resolved = resolveSession(data, token, now, {allowUnselectedCharacter: true});
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const ensured = ensureForAccount(data, resolved.account);
    if (!ensured.ok) {
      return ensured;
    }
    if (ensured.created) {
      save(data);
    }
    return ok(characterRosterPayload(data, resolved.account, resolved.session, ensured.slots));
  }

  function payloadForAccount(data, account, session) {
    const ensured = ensureForAccount(data, account);
    if (!ensured.ok) {
      return ensured;
    }
    return {
      ok: true,
      ...characterRosterPayload(data, account, session, ensured.slots),
      created: ensured.created,
    };
  }

  function createCharacter(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now, {allowUnselectedCharacter: true});
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const ensured = ensureForAccount(data, resolved.account);
    if (!ensured.ok) {
      return ensured;
    }
    const intent = characterCreateIntent(payload, ensured.slots);
    if (!intent.ok) {
      return intent;
    }
    const duplicateName = ensured.slots.filter(Boolean).some((slot) => {
      const profileDoc = data.profiles && data.profiles[slot.playerId];
      const name = String(profileDoc && profileDoc.profile && profileDoc.profile.player && profileDoc.profile.player.name || "");
      return canonicalCharacterNameKey(name) === canonicalCharacterNameKey(intent.displayName);
    });
    if (duplicateName) {
      return fail("character_name_duplicate", "这个账号已经有同名角色，请换一个名字。");
    }
    const playerIdResult = nextPlayerId(data, randomId);
    if (!playerIdResult.ok) {
      return playerIdResult;
    }
    const timestamp = isoNow(now);
    const playerId = playerIdResult.playerId;
    const profile = createDefaultServerProfile({
      ...resolved.account,
      displayName: intent.displayName,
      appearanceId: intent.appearanceId,
      elements: intent.elements,
    });
    const profileDoc = {
      playerId,
      accountId: resolved.account.accountId,
      profileRevision: 0,
      profile,
      updatedAt: timestamp,
      schemaVersion: 1,
    };
    const slot = characterSlot({
      accountId: resolved.account.accountId,
      slotIndex: intent.slotIndex,
      playerId,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastSelectedAt: null,
    });
    const nextSlots = ensured.slots.map((entry, index) => index === intent.slotIndex ? slot : entry);
    storeAuthorityRootRecord(data, "profiles", playerId, profileDoc);
    storeAuthorityRootRecord(
      data,
      "accountCharacterSlots",
      resolved.account.accountId,
      nextSlots,
    );
    save(data);
    return ok({
      ...characterRosterPayload(data, resolved.account, resolved.session, nextSlots),
      character: publicCharacterSlot(data, slot, resolved.session),
      message: "角色创建成功，请选择角色进入游戏。",
    });
  }

  function allocateCharacterElements(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const ensured = ensureForAccount(data, resolved.account);
    if (!ensured.ok) {
      return ensured;
    }
    const intent = characterElementAllocationIntent(payload);
    if (!intent.ok) {
      return intent;
    }
    const binding = data.profileBindings && data.profileBindings[resolved.account.accountId];
    const profileDoc = binding && data.profiles ? data.profiles[binding.playerId] : null;
    const profile = profileDoc && isRecord(profileDoc.profile) ? clone(profileDoc.profile) : null;
    const player = profile && isRecord(profile.player) ? profile.player : null;
    if (
      !binding
      || String(binding.playerId || "") !== String(resolved.session.playerId || "")
      || !profileDoc
      || String(profileDoc.playerId || "") !== String(resolved.session.playerId || "")
      || !player
    ) {
      return fail("character_profile_invalid", "角色档案异常，已停止元素分配，请联系GM处理。");
    }
    if (normalizeCharacterElements(player.elements)) {
      return fail("character_elements_already_allocated", "这个角色已经完成元素分配，不能重复领取首次配点。");
    }
    player.appearanceId = normalizeCharacterAppearanceId(player.appearanceId);
    player.elements = intent.elements;
    const persisted = persistProfileForAccount(
      data,
      resolved.account,
      binding,
      profile,
      now,
    );
    const slot = ensured.slots.find((entry) => (
      entry && entry.playerId === persisted.binding.playerId
    )) || null;
    if (!slot) {
      return fail("character_slots_invalid", "账号角色槽档案异常，已停止元素分配，请联系GM处理。");
    }
    save(data);
    return ok({
      character: publicCharacterSlot(data, slot, resolved.session),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      message: "元素分配完成。",
    });
  }

  function selectCharacter(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now, {allowUnselectedCharacter: true});
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const ensured = ensureForAccount(data, resolved.account);
    if (!ensured.ok) {
      return ensured;
    }
    const intent = characterSelectionIntent(payload, ensured.slots);
    if (!intent.ok) {
      return intent;
    }
    const activeBinding = data.profileBindings && data.profileBindings[resolved.account.accountId];
    const currentPlayerId = String(resolved.session.playerId || activeBinding && activeBinding.playerId || "");
    if (currentPlayerId !== "" && currentPlayerId !== intent.slot.playerId) {
      const blocked = characterSelectionBlocker(
        data,
        resolved.account,
        {
          currentPlayerId,
          nextPlayerId: intent.slot.playerId,
          nextSlotIndex: intent.slot.slotIndex,
        },
        {
          activeBattleRoomForAccount,
          bagItemById,
          battleEquipmentCatalog,
          equipmentTransferOptions,
          isEquipmentItemId,
          now,
          partyForAccount,
          readMailAttachmentState,
        },
      );
      if (blocked) {
        return fail(blocked.code, blocked.message, blocked.details || {});
      }
    }
    const activated = activateCharacter(
      data,
      resolved.account,
      ensured.slots,
      intent.slot,
      now,
      storeAuthorityRootRecord,
    );
    if (!activated.ok) {
      return activated;
    }
    const rotated = rotateCharacterSession(data, resolved, activated.selection);
    if (!rotated.ok) {
      return rotated;
    }
    save(data);
    return ok({
      account: publicAccount(resolved.account),
      session: publicSession(
        rotated.session,
        resolved.account,
        data,
        rotated.token,
        {now},
      ),
      selectionRequired: false,
      characters: publicCharacterSlots(data, activated.slots, rotated.session),
      selectedCharacter: publicCharacterSlot(data, activated.slot, rotated.session),
      profileBinding: data.profileBindings[resolved.account.accountId],
      profileSummary: profileSummaryForAccount(resolved.account, data),
      message: "角色选择成功。",
    });
  }

  return Object.freeze({
    allocateCharacterElements,
    autoSelectionForAccount,
    createCharacter,
    ensureForAccount,
    listCharacters,
    payloadForAccount,
    selectCharacter,
  });
}

function characterSelectionBlocker(data, account, transition, dependencies) {
  const accountId = String(account && account.accountId || "");
  if (accountId === "") {
    return {code: "account_missing", message: "账号不存在。"};
  }
  if (dependencies.activeBattleRoomForAccount(data, accountId)) {
    return {code: "character_select_battle_active", message: "战斗尚未结束，暂不能切换角色。"};
  }
  if (dependencies.partyForAccount(data, accountId)) {
    return {code: "character_select_party_active", message: "请先退出队伍，再切换角色。"};
  }
  const pendingPartyInvite = values(data.partyInvites).some((invite) => (
    invite
    && invite.status === "pending"
    && (
      String(invite.fromAccountId || "") === accountId
      || String(invite.toAccountId || "") === accountId
    )
  ));
  if (pendingPartyInvite) {
    return {
      code: "character_select_party_invite_active",
      message: "仍有待处理的组队邀请，暂不能切换角色。",
    };
  }
  const pendingBattleInvite = values(data.battleInvites).some((invite) => (
    invite
    && invite.status === "pending"
    && (
      String(invite.fromAccountId || "") === accountId
      || String(invite.toAccountId || "") === accountId
    )
  ));
  if (pendingBattleInvite) {
    return {
      code: "character_select_battle_invite_active",
      message: "仍有待处理的战斗邀请，暂不能切换角色。",
    };
  }
  const currentMs = typeof dependencies.now === "function"
    ? Number(dependencies.now())
    : Date.now();
  const activeTrade = values(data.tradeOffers).some((offer) => {
    if (
      !offer
      || (
        String(offer.fromAccountId || "") !== accountId
        && String(offer.toAccountId || "") !== accountId
      )
    ) {
      return false;
    }
    const expiresAtMs = Date.parse(String(offer.expiresAt || ""));
    return !Number.isFinite(expiresAtMs)
      || !Number.isFinite(currentMs)
      || expiresAtMs > currentMs;
  });
  if (activeTrade) {
    return {code: "character_select_trade_active", message: "面对面交易尚未结束，暂不能切换角色。"};
  }
  const scheduledManorWar = (Array.isArray(data.manorWars) ? data.manorWars : []).some((war) => (
    war
    && String(war.status || "") === "scheduled"
    && (
      (Array.isArray(war.challengerParticipantAccountIds)
        && war.challengerParticipantAccountIds.some((entry) => String(entry || "") === accountId))
      || (Array.isArray(war.defenderParticipantAccountIds)
        && war.defenderParticipantAccountIds.some((entry) => String(entry || "") === accountId))
    )
  ));
  if (scheduledManorWar) {
    return {
      code: "character_select_manor_war_active",
      message: "当前角色已登记参加庄园战，请先退出参战名单或等待结算。",
    };
  }
  const activeListing = values(data.marketListings).some((listing) => (
    listing && String(listing.sellerAccountId || "") === accountId
  ));
  if (activeListing) {
    return {
      code: "character_select_market_active",
      message: "仍有角色资产正在交易所出售，请先完成或撤销挂单。",
    };
  }
  for (const mail of values(data.mailMessages)) {
    if (!mail || String(mail.recipientAccountId || "") !== accountId) {
      continue;
    }
    const attachmentState = dependencies.readMailAttachmentState(
      mail,
      dependencies.battleEquipmentCatalog,
      {
        itemById: dependencies.bagItemById,
        isEquipmentItemId: dependencies.isEquipmentItemId,
        equipmentTransferOptions: dependencies.equipmentTransferOptions,
      },
    );
    if (!attachmentState.ok) {
      return {
        code: "character_select_mail_state_invalid",
        message: "邮箱资产状态异常，已停止切换角色，请联系GM处理。",
      };
    }
    if (
      attachmentState.items.length > 0
      || attachmentState.equipmentEnvelopes.length > 0
      || values(attachmentState.currency).some((amount) => Number(amount) > 0)
    ) {
      return {
        code: "character_select_mail_assets_pending",
        message: "邮箱仍有未领取的角色资产，请先使用当前角色处理。",
      };
    }
  }
  const currentPlayerId = String(transition && transition.currentPlayerId || "");
  const profileDoc = currentPlayerId && data.profiles ? data.profiles[currentPlayerId] : null;
  const profile = profileDoc && isRecord(profileDoc.profile) ? profileDoc.profile : null;
  if (
    profile
    && (
      Boolean(profile.hangSession && profile.hangSession.enabled)
      || (
        profile.offlineHang
        && profile.offlineHang.session
        && !["", "idle", "claimed", "cancelled"].includes(String(profile.offlineHang.session.status || ""))
      )
    )
  ) {
    return {code: "character_select_hang_active", message: "当前角色仍在挂机，请先结束挂机再切换角色。"};
  }
  return null;
}

function canonicalRoster(data, account, value) {
  const accountId = String(account && account.accountId || "");
  if (
    !Array.isArray(value)
    || value.length !== CHARACTER_SLOT_LIMIT
  ) {
    return rosterFailure();
  }
  const playerIds = new Set();
  const slots = [];
  for (let slotIndex = 0; slotIndex < CHARACTER_SLOT_LIMIT; slotIndex += 1) {
    const rawSlot = value[slotIndex];
    if (rawSlot === null) {
      slots.push(null);
      continue;
    }
    if (
      !isRecord(rawSlot)
      || String(rawSlot.accountId || "") !== accountId
      || rawSlot.slotIndex !== slotIndex
      || Number(rawSlot.schemaVersion) !== CHARACTER_SCHEMA_VERSION
      || typeof rawSlot.playerId !== "string"
      || rawSlot.playerId === ""
      || rawSlot.playerId !== rawSlot.playerId.trim()
      || playerIds.has(rawSlot.playerId)
      || !validIsoTimestamp(rawSlot.createdAt)
      || !validIsoTimestamp(rawSlot.updatedAt)
      || !(rawSlot.lastSelectedAt === null || validIsoTimestamp(rawSlot.lastSelectedAt))
    ) {
      return rosterFailure();
    }
    const profileDoc = data.profiles && data.profiles[rawSlot.playerId];
    if (
      !profileDoc
      || String(profileDoc.playerId || "") !== rawSlot.playerId
      || String(profileDoc.accountId || "") !== accountId
      || !isRecord(profileDoc.profile)
    ) {
      return fail("character_profile_invalid", "角色槽关联档案异常，已停止角色操作，请联系GM处理。");
    }
    playerIds.add(rawSlot.playerId);
    slots.push(characterSlot(rawSlot));
  }
  const activeBinding = data.profileBindings && data.profileBindings[accountId];
  if (
    activeBinding
    && String(activeBinding.playerId || "") !== ""
    && !playerIds.has(String(activeBinding.playerId))
  ) {
    return fail("character_binding_conflict", "当前角色绑定不属于账号角色槽，已停止角色操作，请联系GM处理。");
  }
  return {ok: true, slots, created: false};
}

function characterRosterPayload(data, account, session, slots) {
  const selection = selectedCharacterForSession(data, session, {allowLegacySingle: true});
  return {
    account: {
      accountId: String(account && account.accountId || ""),
      username: String(account && account.username || ""),
      displayName: String(account && account.displayName || ""),
      role: String(account && account.role || ""),
      createdAt: String(account && account.createdAt || ""),
    },
    selectionRequired: !selection.ok,
    characters: publicCharacterSlots(data, slots, selection.ok ? selection.session : session),
    selectedCharacter: selection.ok
      ? publicCharacterSlot(data, selection.slot, selection.session)
      : null,
    slotLimit: CHARACTER_SLOT_LIMIT,
    schemaVersion: CHARACTER_SCHEMA_VERSION,
  };
}

function publicCharacterSlots(data, slots, session) {
  return slots.map((slot, slotIndex) => slot
    ? publicCharacterSlot(data, slot, session)
    : {
      slotIndex,
      occupied: false,
      schemaVersion: CHARACTER_SCHEMA_VERSION,
    });
}

function publicCharacterSlot(data, slot, session) {
  const profileDoc = data.profiles && data.profiles[slot.playerId];
  const profile = profileDoc && isRecord(profileDoc.profile) ? profileDoc.profile : {};
  const player = isRecord(profile.player) ? profile.player : {};
  const elements = normalizeCharacterElements(player.elements);
  return {
    slotIndex: slot.slotIndex,
    occupied: true,
    playerId: slot.playerId,
    displayName: String(player.name || "见习猎人"),
    appearanceId: normalizeCharacterAppearanceId(player.appearanceId),
    elements,
    needsElementAllocation: elements === null,
    level: positiveInteger(player.level, 1),
    rebirthCount: nonNegativeInteger(profile.rebirthCount, 0),
    profileRevision: nonNegativeInteger(profileDoc && profileDoc.profileRevision, 0),
    selected: String(session && session.playerId || "") === slot.playerId,
    createdAt: slot.createdAt,
    updatedAt: String(profileDoc && profileDoc.updatedAt || slot.updatedAt),
    lastSelectedAt: slot.lastSelectedAt,
    schemaVersion: CHARACTER_SCHEMA_VERSION,
  };
}

function characterCreateIntent(payload, slots) {
  if (!isRecord(payload)) {
    return {ok: false, code: "character_create_payload_invalid", message: "角色创建请求不正确。"};
  }
  const allowed = new Set(["appearanceId", "displayName", "elements", "slotIndex"]);
  if (Object.keys(payload).some((key) => !allowed.has(key))) {
    return {ok: false, code: "character_create_payload_invalid", message: "角色创建请求包含不支持的字段。"};
  }
  const displayName = String(payload.displayName || "").trim();
  if (!isValidCharacterName(displayName)) {
    return {ok: false, code: "invalid_display_name", message: "角色名最多24个字符，且不能包含控制字符。"};
  }
  const nameSafety = inspectCharacterNameSafety(displayName, CHARACTER_NAME_POLICY);
  if (!nameSafety.ok) {
    return {
      ok: false,
      code: "character_name_restricted",
      message: CHARACTER_NAME_POLICY.playerMessage,
    };
  }
  const appearanceId = String(payload.appearanceId || "").trim();
  if (!CHARACTER_APPEARANCE_CATALOG.has(appearanceId)) {
    return {ok: false, code: "character_appearance_invalid", message: "请选择可用的角色形象。"};
  }
  const elementIntent = characterElementsIntent(payload.elements);
  if (!elementIntent.ok) {
    return elementIntent;
  }
  let slotIndex = slots.findIndex((slot) => slot === null);
  if (Object.hasOwn(payload, "slotIndex")) {
    if (!Number.isSafeInteger(payload.slotIndex) || payload.slotIndex < 0 || payload.slotIndex >= CHARACTER_SLOT_LIMIT) {
      return {ok: false, code: "character_slot_invalid", message: "角色槽位无效。"};
    }
    slotIndex = payload.slotIndex;
  }
  if (slotIndex < 0) {
    return {ok: false, code: "character_slot_limit", message: "每个账号最多创建4个角色。"};
  }
  if (slots[slotIndex] !== null) {
    return {ok: false, code: "character_slot_occupied", message: "这个角色槽已经被占用。"};
  }
  return {
    ok: true,
    appearanceId,
    displayName,
    elements: elementIntent.elements,
    slotIndex,
  };
}

function characterElementAllocationIntent(payload) {
  if (
    !isRecord(payload)
    || Object.keys(payload).length !== 1
    || !Object.hasOwn(payload, "elements")
  ) {
    return {ok: false, code: "character_elements_payload_invalid", message: "元素分配请求不正确。"};
  }
  return characterElementsIntent(payload.elements);
}

function characterElementsIntent(value) {
  const inspected = inspectPlayerElementAllocation(value);
  if (inspected.ok) {
    return {ok: true, elements: {...inspected.elements}};
  }
  if (inspected.reason === "total_invalid") {
    return {ok: false, code: "character_elements_total_invalid", message: "创建角色时必须分配完10点元素。"};
  }
  if (inspected.reason === "too_many_active_elements") {
    return {ok: false, code: "character_elements_affinity_limit", message: "一个角色最多选择两种元素。"};
  }
  if (inspected.reason === "forbidden_pair") {
    const pair = Array.isArray(inspected.forbiddenPair) ? inspected.forbiddenPair.join("+") : "";
    const message = pair === "earth+fire"
      ? "地与火不能同时分配元素点。"
      : "水与风不能同时分配元素点。";
    return {ok: false, code: "character_elements_conflict", message};
  }
  return {ok: false, code: "character_elements_invalid", message: "元素点必须完整包含地、水、火、风四项，且每项为0到10之间的整数。"};
}

function normalizeCharacterAppearanceId(value) {
  const appearanceId = String(value || "").trim();
  return CHARACTER_APPEARANCE_CATALOG.has(appearanceId)
    ? appearanceId
    : CHARACTER_DEFAULT_APPEARANCE_ID;
}

function normalizeCharacterElements(value) {
  const intent = characterElementsIntent(value);
  return intent.ok ? intent.elements : null;
}

function characterSelectionIntent(payload, slots) {
  if (!isRecord(payload)) {
    return {ok: false, code: "character_select_payload_invalid", message: "角色选择请求不正确。"};
  }
  const allowed = new Set(["playerId", "slotIndex"]);
  if (
    Object.keys(payload).some((key) => !allowed.has(key))
    || (!Object.hasOwn(payload, "playerId") && !Object.hasOwn(payload, "slotIndex"))
  ) {
    return {ok: false, code: "character_select_payload_invalid", message: "请选择一个账号角色。"};
  }
  const hasSlotIndex = Object.hasOwn(payload, "slotIndex");
  const hasPlayerId = Object.hasOwn(payload, "playerId");
  let slot = null;
  if (hasSlotIndex) {
    if (!Number.isSafeInteger(payload.slotIndex) || payload.slotIndex < 0 || payload.slotIndex >= CHARACTER_SLOT_LIMIT) {
      return {ok: false, code: "character_slot_invalid", message: "角色槽位无效。"};
    }
    slot = slots[payload.slotIndex];
  }
  if (hasPlayerId) {
    const playerId = String(payload.playerId || "").trim();
    if (playerId === "") {
      return {ok: false, code: "character_player_id_invalid", message: "角色编号无效。"};
    }
    const playerSlot = slots.find((entry) => entry && entry.playerId === playerId) || null;
    if (
      hasSlotIndex
      && (
        !slot
        || !playerSlot
        || slot.playerId !== playerSlot.playerId
      )
    ) {
      return {ok: false, code: "character_select_mismatch", message: "角色槽与角色编号不一致。"};
    }
    slot = playerSlot;
  }
  if (!slot) {
    return {ok: false, code: "character_missing", message: "这个角色不存在或不属于当前账号。"};
  }
  return {ok: true, slot};
}

function activateCharacter(data, account, slots, slot, now, storeAuthorityRootRecord) {
  const accountId = String(account && account.accountId || "");
  const profileDoc = data.profiles && data.profiles[slot.playerId];
  if (
    !profileDoc
    || String(profileDoc.accountId || "") !== accountId
    || String(profileDoc.playerId || "") !== slot.playerId
    || !isRecord(profileDoc.profile)
  ) {
    return {ok: false, code: "character_profile_invalid", message: "角色档案异常，已停止进入游戏，请联系GM处理。"};
  }
  const timestamp = isoTimestamp(now);
  const selectionEpoch = nextSelectionEpoch(data, accountId, now);
  const nextSlot = characterSlot({
    ...slot,
    updatedAt: timestamp,
    lastSelectedAt: timestamp,
  });
  const nextSlots = slots.map((entry, index) => index === slot.slotIndex ? nextSlot : entry);
  const binding = {
    accountId,
    playerId: slot.playerId,
    profileRevision: nonNegativeInteger(profileDoc.profileRevision, 0),
    createdAt: String(slot.createdAt),
    updatedAt: timestamp,
    schemaVersion: 1,
  };
  storeAuthorityRootRecord(data, "accountCharacterSlots", accountId, nextSlots);
  storeAuthorityRootRecord(data, "profileBindings", accountId, binding);
  return {
    ok: true,
    slots: nextSlots,
    slot: nextSlot,
    selection: {
      playerId: slot.playerId,
      slotIndex: slot.slotIndex,
      selectionEpoch,
    },
  };
}

function selectedCharacterForSession(data, session, options = {}) {
  const accountId = String(session && session.accountId || "");
  const playerId = String(session && session.playerId || "");
  const slotIndex = session && session.slotIndex;
  const selectionEpoch = session && session.selectionEpoch;
  const rosterValue = data && data.accountCharacterSlots && data.accountCharacterSlots[accountId];
  const binding = data && data.profileBindings && data.profileBindings[accountId];
  if (!rosterValue && options.allowLegacySingle && binding && String(binding.playerId || "") !== "") {
    const legacyPlayerId = String(binding.playerId);
    const profileDoc = data.profiles && data.profiles[legacyPlayerId];
    if (profileDoc && String(profileDoc.accountId || "") === accountId && isRecord(profileDoc.profile)) {
      return {
        ok: true,
        slot: characterSlot({
          accountId,
          slotIndex: 0,
          playerId: legacyPlayerId,
          createdAt: String(binding.createdAt || profileDoc.updatedAt),
          updatedAt: String(binding.updatedAt || profileDoc.updatedAt),
          lastSelectedAt: String(binding.updatedAt || profileDoc.updatedAt),
        }),
        session: {
          ...session,
          playerId: legacyPlayerId,
          slotIndex: 0,
          selectionEpoch: 1,
        },
        legacy: true,
      };
    }
  }
  if (!Array.isArray(rosterValue) || rosterValue.length !== CHARACTER_SLOT_LIMIT) {
    return {ok: false, code: "character_selection_required", message: "请先选择角色进入游戏。"};
  }
  if (playerId === "" && options.allowLegacySingle) {
    const occupied = rosterValue.filter(Boolean);
    const onlySlot = occupied.length === 1 ? occupied[0] : null;
    if (
      onlySlot
      && binding
      && String(binding.playerId || "") === String(onlySlot.playerId || "")
    ) {
      return {
        ok: true,
        slot: characterSlot(onlySlot),
        session: {
          ...session,
          playerId: String(onlySlot.playerId),
          slotIndex: Number(onlySlot.slotIndex),
          selectionEpoch: 1,
        },
        legacy: true,
      };
    }
  }
  if (
    playerId === ""
    || !Number.isSafeInteger(slotIndex)
    || !Number.isSafeInteger(selectionEpoch)
    || selectionEpoch < 1
  ) {
    return {ok: false, code: "character_selection_required", message: "请先选择角色进入游戏。"};
  }
  const slot = rosterValue[slotIndex];
  if (
    !slot
    || String(slot.playerId || "") !== playerId
    || String(slot.accountId || "") !== accountId
    || !binding
    || String(binding.playerId || "") !== playerId
  ) {
    return {ok: false, code: "character_selection_stale", message: "角色选择已失效，请重新选择角色。"};
  }
  return {ok: true, slot: characterSlot(slot), session, legacy: false};
}

function characterSlot(value) {
  return {
    accountId: String(value.accountId || ""),
    slotIndex: Number(value.slotIndex),
    playerId: String(value.playerId || ""),
    createdAt: String(value.createdAt || ""),
    updatedAt: String(value.updatedAt || ""),
    lastSelectedAt: value.lastSelectedAt === null || value.lastSelectedAt === undefined
      ? null
      : String(value.lastSelectedAt),
    schemaVersion: CHARACTER_SCHEMA_VERSION,
  };
}

function emptyCharacterSlots() {
  return Array.from({length: CHARACTER_SLOT_LIMIT}, () => null);
}

function nextPlayerId(data, randomId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const entropy = String(randomId() || "").trim().replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
    const playerId = entropy === "" ? "" : `player_${entropy}`;
    if (
      playerId !== ""
      && !Object.hasOwn(data.profiles || {}, playerId)
      && !Object.values(data.accountCharacterSlots || {}).some((slots) => (
        Array.isArray(slots)
        && slots.some((slot) => slot && slot.playerId === playerId)
      ))
    ) {
      return {ok: true, playerId};
    }
  }
  return {ok: false, code: "character_player_id_unavailable", message: "角色编号暂时不可用，请重试。"};
}

function isValidCharacterName(value) {
  const text = String(value || "");
  if (
    text === ""
    || Buffer.byteLength(text) > CHARACTER_NAME_MAX_BYTES
    || /[\p{Cc}\p{Cf}]/u.test(text)
  ) {
    return false;
  }
  let graphemes = 0;
  for (const _entry of CHARACTER_NAME_SEGMENTER.segment(text)) {
    graphemes += 1;
    if (graphemes > CHARACTER_NAME_MAX_GRAPHEMES) {
      return false;
    }
  }
  return graphemes > 0;
}

function canonicalCharacterNameKey(value) {
  return String(value || "").trim().normalize("NFKC").toLocaleLowerCase("zh-CN");
}

function rosterFailure() {
  return {
    ok: false,
    code: "character_slots_invalid",
    message: "账号角色槽档案异常，已停止角色操作，请联系GM处理。",
  };
}

function validIsoTimestamp(value) {
  return typeof value === "string" && value !== "" && Number.isFinite(Date.parse(value));
}

function isoTimestamp(now) {
  const nowMs = typeof now === "function" ? Number(now()) : Date.now();
  return new Date(Number.isFinite(nowMs) ? nowMs : Date.now()).toISOString();
}

function nextSelectionEpoch(data, accountId, now) {
  const nowMs = typeof now === "function" ? Math.trunc(Number(now())) : Date.now();
  let epoch = Number.isSafeInteger(nowMs) && nowMs > 0 ? nowMs : 1;
  for (const records of [
    Object.values(data && data.sessions || {}),
    Object.values(data && data.mutationReceipts || {}),
  ]) {
    for (const record of records) {
      if (!record || String(record.accountId || "") !== accountId) {
        continue;
      }
      const previous = Number(record.selectionEpoch);
      if (Number.isSafeInteger(previous) && previous >= epoch && previous < Number.MAX_SAFE_INTEGER) {
        epoch = previous + 1;
      }
    }
  }
  return epoch;
}

function positiveInteger(value, fallback) {
  const normalized = Math.trunc(Number(value));
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function nonNegativeInteger(value, fallback) {
  const normalized = Math.trunc(Number(value));
  return Number.isSafeInteger(normalized) && normalized >= 0 ? normalized : fallback;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function values(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.values(value)
    : [];
}

module.exports = {
  CHARACTER_APPEARANCE_IDS,
  CHARACTER_DEFAULT_APPEARANCE_ID,
  CHARACTER_ELEMENT_IDS,
  CHARACTER_ELEMENT_TOTAL,
  CHARACTER_SLOT_LIMIT,
  createAccountCharactersDomain,
  isValidCharacterName,
  normalizeCharacterAppearanceId,
  normalizeCharacterElements,
  selectedCharacterForSession,
};
