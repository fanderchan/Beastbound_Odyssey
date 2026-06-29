"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
const PASSWORD_MIN_LENGTH = 4;
const ROLE_PLAYER = "player";
const ROLE_GM = "gm";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_AUDIT_ROWS = 500;
const MAX_PLAYER_SEARCH_RESULTS = 12;
const MAIL_TITLE_MAX_LENGTH = 40;
const MAIL_BODY_MAX_LENGTH = 500;
const PARTY_MAX_MEMBERS = 5;
const CHAT_CHANNEL_NEARBY = "nearby";
const CHAT_CHANNEL_TEAM = "team";
const CHAT_TEXT_MAX_LENGTH = 120;
const CHAT_HISTORY_LIMIT = 50;
const MAX_CHAT_MESSAGES = 500;
const POSITION_MAP_ID_MAX_LENGTH = 64;
const POSITION_FACING_VALUES = new Set(["east", "southeast", "south", "southwest", "west", "northwest", "north", "northeast"]);
const ONLINE_AOI_SCOPE = "aoi";
const ONLINE_AOI_DEFAULT_RADIUS = 18;
const ONLINE_AOI_MAX_RADIUS = 48;

function createAuthService(options = {}) {
  const store = options.store || createMemoryAuthStore();
  const now = options.now || (() => Date.now());
  const randomId = options.randomId || (() => crypto.randomUUID());
  const randomBytes = options.randomBytes || ((size) => crypto.randomBytes(size));
  const serviceEventListeners = new Set();

  function load() {
    return normalizeData(store.load());
  }

  function save(data) {
    store.save(normalizeData(data));
  }

  function emitServiceEvent(event) {
    const payload = {
      schemaVersion: 1,
      createdAt: isoNow(now),
      ...event,
    };
    for (const listener of serviceEventListeners) {
      listener(payload);
    }
  }

  function onEvent(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }
    serviceEventListeners.add(listener);
    return () => serviceEventListeners.delete(listener);
  }

  function register(payload = {}) {
    const username = normalizeUsername(payload.username);
    const password = String(payload.password || "");
    const displayName = String(payload.displayName || "").trim() || username;
    if (!isValidUsername(username)) {
      return fail("invalid_username", "账号只能使用3-20位小写字母、数字或下划线。");
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      return fail("weak_password", "密码至少需要4位。");
    }
    const data = load();
    if (data.accounts[username]) {
      recordAuthEvent(data, "register_denied", username, false, "账号已存在。", now);
      save(data);
      return fail("account_exists", "账号已存在，请直接登录。");
    }
    const accountId = `acc_${randomId()}`;
    const salt = randomBytes(16).toString("hex");
    const account = {
      accountId,
      username,
      displayName,
      role: ROLE_PLAYER,
      passwordSalt: salt,
      passwordHash: hashPassword(password, salt),
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    data.accounts[username] = account;
    data.profileBindings[accountId] = {
      accountId,
      playerId: `player_${accountId.slice(4, 16)}`,
      profileRevision: 0,
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    recordAuthEvent(data, "register", username, true, "", now);
    const sessionResult = createSessionForAccount(data, account, now, randomBytes);
    save(data);
    return ok({
      account: publicAccount(account),
      session: publicSession(sessionResult.session, account, data, sessionResult.token),
      profileBinding: data.profileBindings[accountId],
      profileSummary: profileSummaryForAccount(account, data),
    });
  }

  function login(payload = {}) {
    const username = normalizeUsername(payload.username);
    const password = String(payload.password || "");
    const data = load();
    const account = data.accounts[username];
    if (!account) {
      recordAuthEvent(data, "login_denied", username, false, "账号不存在。", now);
      save(data);
      return fail("account_missing", "账号不存在。");
    }
    if (hashPassword(password, account.passwordSalt) !== account.passwordHash) {
      recordAuthEvent(data, "login_denied", username, false, "密码不正确。", now);
      save(data);
      return fail("wrong_password", "密码不正确。");
    }
    const sessionResult = createSessionForAccount(data, account, now, randomBytes);
    recordAuthEvent(data, "login", username, true, "", now);
    save(data);
    return ok({
      account: publicAccount(account),
      session: publicSession(sessionResult.session, account, data, sessionResult.token),
      profileBinding: data.profileBindings[account.accountId] || null,
      profileSummary: profileSummaryForAccount(account, data),
    });
  }

  function logout(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    resolved.session.revokedAt = isoNow(now);
    recordAuthEvent(data, "logout", resolved.account.username, true, "", now);
    save(data);
    return ok({"message": "已退出登录。"});
  }

  function getSession(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    return ok({
      account: publicAccount(resolved.account),
      session: publicSession(resolved.session, resolved.account, data),
      profileBinding: data.profileBindings[resolved.account.accountId] || null,
      profileSummary: profileSummaryForAccount(resolved.account, data),
    });
  }

  function getProfile(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const binding = profileBindingForAccount(data, resolved.account, now);
    const profileDoc = data.profiles[binding.playerId] || null;
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      profile: profileDoc && profileDoc.profile ? profileDoc.profile : null,
    });
  }

  function saveProfile(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const profile = payload.profile;
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      return fail("invalid_profile", "角色档案必须是对象。");
    }
    const binding = profileBindingForAccount(data, resolved.account, now);
    const currentRevision = Number(binding.profileRevision || 0);
    const expectedRevision = Number(payload.expectedRevision || 0);
    if (expectedRevision !== currentRevision) {
      return fail("revision_conflict", "服务器档案已更新，请重新登录或重新拉取档案。", {
        profileBinding: binding,
        profileSummary: profileSummaryForAccount(resolved.account, data),
      });
    }
    const nextRevision = currentRevision + 1;
    binding.profileRevision = nextRevision;
    binding.updatedAt = isoNow(now);
    data.profileBindings[resolved.account.accountId] = binding;
    data.profiles[binding.playerId] = {
      playerId: binding.playerId,
      accountId: resolved.account.accountId,
      profileRevision: nextRevision,
      profile: clone(profile),
      updatedAt: binding.updatedAt,
      schemaVersion: 1,
    };
    save(data);
    return ok({
      account: publicAccount(resolved.account),
      profileBinding: binding,
      profileSummary: profileSummaryForAccount(resolved.account, data),
      message: "角色档案已同步。",
    });
  }

  function searchPlayers(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const username = normalizeUsername(payload.username || payload.query || "");
    if (!username) {
      return ok({"players": []});
    }
    const players = Object.values(data.accounts)
      .filter((account) => account && account.username && account.username.includes(username))
      .sort((a, b) => String(a.username).localeCompare(String(b.username)))
      .slice(0, MAX_PLAYER_SEARCH_RESULTS)
      .map((account) => publicPlayerSearchResult(account, data));
    return ok({players});
  }

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
      createdAt: isoNow(now),
      readAt: null,
      schemaVersion: 1,
    };
    data.mailMessages[mail.mailId] = mail;
    save(data);
    return ok({
      mail: publicMail(mail),
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

  function listOnlinePlayers(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const viewerPosition = data.playerPositions[resolved.account.accountId] || null;
    const aoi = normalizeOnlineAoiPayload(payload, viewerPosition);
    const players = onlinePlayersForViewer(data, resolved.account, aoi, now).map((account) => publicOnlinePlayer(account, data));
    players.sort((a, b) => String(a.username).localeCompare(String(b.username)));
    return ok({
      players,
      party: publicPartyForAccount(data, resolved.account.accountId),
      aoi: publicOnlineAoi(aoi),
    });
  }

  function updatePlayerPosition(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const position = normalizePlayerPositionPayload(payload, resolved.account, now);
    if (!position.mapId) {
      return fail("position_map_missing", "位置缺少地图。");
    }
    const previousPosition = data.playerPositions[resolved.account.accountId]
      ? publicPlayerPosition(data.playerPositions[resolved.account.accountId])
      : null;
    data.playerPositions[resolved.account.accountId] = position;
    save(data);
    const aoi = normalizeOnlineAoiPayload({
      scope: ONLINE_AOI_SCOPE,
      radius: payload.aoiRadius ?? payload.viewRadius ?? payload.radius,
    }, position);
    const players = onlinePlayersForViewer(data, resolved.account, aoi, now).map((account) => publicOnlinePlayer(account, data));
    players.sort((a, b) => String(a.username).localeCompare(String(b.username)));
    emitServiceEvent({
      type: "online.position",
      accountId: resolved.account.accountId,
      username: resolved.account.username,
      position: publicPlayerPosition(position),
      previousPosition,
      players,
      aoi: publicOnlineAoi(aoi),
    });
    return ok({
      position: publicPlayerPosition(position),
      players,
      party: publicPartyForAccount(data, resolved.account.accountId),
      aoi: publicOnlineAoi(aoi),
    });
  }

  function eventForSession(token, event = {}) {
    if (event && event.type === "online.position") {
      return onlinePositionEventForSession(token, event);
    }
    return ok({
      visible: true,
      event,
    });
  }

  function onlinePositionEventForSession(token, event = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const viewerPosition = data.playerPositions[resolved.account.accountId] || null;
    const aoi = normalizeOnlineAoiPayload({scope: ONLINE_AOI_SCOPE}, viewerPosition);
    const isSelf = resolved.account.accountId === event.accountId;
    const currentVisible = isSelf || onlinePositionVisibleToAoi(event.position, aoi);
    const previousVisible = onlinePositionVisibleToAoi(event.previousPosition, aoi);
    if (aoi.enabled && !currentVisible && !previousVisible) {
      return ok({visible: false});
    }
    const players = onlinePlayersForViewer(data, resolved.account, aoi, now).map((account) => publicOnlinePlayer(account, data));
    players.sort((a, b) => String(a.username).localeCompare(String(b.username)));
    return ok({
      visible: true,
      event: {
        ...event,
        players,
        aoi: publicOnlineAoi(aoi),
      },
    });
  }

  function getPartyState(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    return ok(partyStatePayload(data, resolved.account.accountId));
  }

  function inviteToParty(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const targetUsername = normalizeUsername(payload.username || payload.targetUsername || payload.recipientUsername || "");
    const target = data.accounts[targetUsername];
    if (!target) {
      return fail("party_target_missing", "玩家不存在。");
    }
    if (target.accountId === resolved.account.accountId) {
      return fail("party_invite_self", "不能邀请自己。");
    }
    const targetParty = partyForAccount(data, target.accountId);
    if (targetParty) {
      return fail("party_target_busy", "对方已经在队伍中。");
    }
    let party = partyForAccount(data, resolved.account.accountId);
    if (!party) {
      party = createPartyForLeader(data, resolved.account.accountId, now, randomId);
    }
    if (party.leaderAccountId !== resolved.account.accountId) {
      return fail("party_not_leader", "只有队长可以邀请。");
    }
    if (party.memberAccountIds.length >= PARTY_MAX_MEMBERS) {
      return fail("party_full", "队伍人数已满。");
    }
    const pendingInvite = Object.values(data.partyInvites).find((invite) => (
      invite &&
      invite.status === "pending" &&
      invite.partyId === party.partyId &&
      invite.toAccountId === target.accountId
    ));
    if (pendingInvite) {
      return ok({
        invite: publicPartyInvite(pendingInvite, data),
        party: publicParty(party, data),
        message: "邀请已发送。",
      });
    }
    const invite = {
      inviteId: `invite_${randomId()}`,
      partyId: party.partyId,
      fromAccountId: resolved.account.accountId,
      toAccountId: target.accountId,
      status: "pending",
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    data.partyInvites[invite.inviteId] = invite;
    party.updatedAt = isoNow(now);
    data.parties[party.partyId] = party;
    save(data);
    emitServiceEvent({
      type: "party.invite",
      targetAccountIds: [resolved.account.accountId, target.accountId],
      party: publicParty(party, data),
      invite: publicPartyInvite(invite, data),
    });
    return ok({
      invite: publicPartyInvite(invite, data),
      party: publicParty(party, data),
      message: "邀请已发送。",
    });
  }

  function acceptPartyInvite(token, inviteId) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const invite = data.partyInvites[String(inviteId || "").trim()];
    if (!invite || invite.status !== "pending" || invite.toAccountId !== resolved.account.accountId) {
      return fail("party_invite_missing", "邀请不存在。");
    }
    if (partyForAccount(data, resolved.account.accountId)) {
      return fail("party_already_joined", "你已经在队伍中。");
    }
    const party = data.parties[invite.partyId];
    if (!party) {
      invite.status = "expired";
      invite.updatedAt = isoNow(now);
      data.partyInvites[invite.inviteId] = invite;
      save(data);
      return fail("party_missing", "队伍已经解散。");
    }
    if (party.memberAccountIds.length >= PARTY_MAX_MEMBERS) {
      return fail("party_full", "队伍人数已满。");
    }
    party.memberAccountIds.push(resolved.account.accountId);
    party.updatedAt = isoNow(now);
    invite.status = "accepted";
    invite.updatedAt = isoNow(now);
    data.parties[party.partyId] = party;
    data.partyInvites[invite.inviteId] = invite;
    save(data);
    emitServiceEvent({
      type: "party.update",
      targetAccountIds: party.memberAccountIds.slice(),
      party: publicParty(party, data),
      invite: publicPartyInvite(invite, data),
    });
    return ok({
      party: publicParty(party, data),
      invite: publicPartyInvite(invite, data),
      message: "已加入队伍。",
    });
  }

  function declinePartyInvite(token, inviteId) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const invite = data.partyInvites[String(inviteId || "").trim()];
    if (!invite || invite.status !== "pending" || invite.toAccountId !== resolved.account.accountId) {
      return fail("party_invite_missing", "邀请不存在。");
    }
    invite.status = "declined";
    invite.updatedAt = isoNow(now);
    data.partyInvites[invite.inviteId] = invite;
    save(data);
    emitServiceEvent({
      type: "party.invite_declined",
      targetAccountIds: [invite.fromAccountId, invite.toAccountId],
      invite: publicPartyInvite(invite, data),
      party: publicPartyForAccount(data, resolved.account.accountId),
    });
    return ok({
      invite: publicPartyInvite(invite, data),
      party: publicPartyForAccount(data, resolved.account.accountId),
      message: "已拒绝邀请。",
    });
  }

  function leaveParty(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const party = partyForAccount(data, resolved.account.accountId);
    if (!party) {
      return fail("party_missing", "你还没有队伍。");
    }
    party.memberAccountIds = party.memberAccountIds.filter((accountId) => accountId !== resolved.account.accountId);
    if (party.memberAccountIds.length <= 0) {
      const leavingPartyId = party.partyId;
      delete data.parties[party.partyId];
      for (const invite of Object.values(data.partyInvites)) {
        if (invite && invite.partyId === party.partyId && invite.status === "pending") {
          invite.status = "expired";
          invite.updatedAt = isoNow(now);
          data.partyInvites[invite.inviteId] = invite;
        }
      }
      save(data);
      emitServiceEvent({
        type: "party.update",
        targetAccountIds: [resolved.account.accountId],
        party: null,
        partyId: leavingPartyId,
      });
      return ok({
        party: null,
        incomingInvites: publicIncomingPartyInvites(data, resolved.account.accountId),
        message: "已离开队伍。",
      });
    }
    if (party.leaderAccountId === resolved.account.accountId) {
      party.leaderAccountId = party.memberAccountIds[0];
    }
    party.updatedAt = isoNow(now);
    data.parties[party.partyId] = party;
    save(data);
    emitServiceEvent({
      type: "party.update",
      targetAccountIds: [resolved.account.accountId, ...party.memberAccountIds],
      party: publicParty(party, data),
    });
    return ok({
      party: null,
      incomingInvites: publicIncomingPartyInvites(data, resolved.account.accountId),
      message: "已离开队伍。",
    });
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

  function grantGm(payload = {}) {
    const username = normalizeUsername(payload.username);
    const data = load();
    const account = data.accounts[username];
    if (!account) {
      return fail("account_missing", "账号不存在。");
    }
    account.role = ROLE_GM;
    account.updatedAt = isoNow(now);
    const commandIds = normalizeCommandIds(payload.commandIds || ["*"]);
    data.gmUserGrants[account.accountId] = {
      accountId: account.accountId,
      username,
      enabled: true,
      grantedBy: String(payload.grantedBy || "system"),
      expiresAt: payload.expiresAt || null,
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    data.gmCommandGrants[account.accountId] = commandIds.map((commandId) => ({
      accountId: account.accountId,
      commandId,
      enabled: true,
      grantedBy: String(payload.grantedBy || "system"),
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    }));
    recordAuthEvent(data, "gm_grant", username, true, commandIds.join(","), now);
    save(data);
    return ok({
      account: publicAccount(account),
      gmGrant: data.gmUserGrants[account.accountId],
      commandGrants: data.gmCommandGrants[account.accountId],
    });
  }

  function listGmTools(token, commandCatalog = []) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    if (!effectiveRoleIsGm(data, resolved.account, now)) {
      return fail("gm_denied", "当前账号没有GM权限。");
    }
    const allowed = commandCatalog
      .map((entry) => String(entry.id || "").trim())
      .filter((commandId) => commandId && commandAllowed(data, resolved.account.accountId, commandId));
    return ok({
      account: publicAccount(resolved.account),
      effectiveRole: ROLE_GM,
      commandIds: allowed,
    });
  }

  function authorizeGmCommand(payload = {}) {
    const token = payload.token;
    const commandId = normalizeCommandId(payload.commandId);
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      const audit = recordGmAudit(data, "", commandId, false, resolved.message, now, randomId);
      save(data);
      return fail(resolved.code, resolved.message, {"auditId": audit.auditId});
    }
    if (!commandId) {
      const audit = recordGmAudit(data, resolved.account.username, commandId, false, "GM命令为空。", now, randomId);
      save(data);
      return fail("empty_command", "GM命令为空。", {"auditId": audit.auditId});
    }
    if (!effectiveRoleIsGm(data, resolved.account, now)) {
      const audit = recordGmAudit(data, resolved.account.username, commandId, false, "当前账号没有GM权限。", now, randomId);
      save(data);
      return fail("gm_denied", "当前账号没有GM权限。", {"auditId": audit.auditId});
    }
    if (!commandAllowed(data, resolved.account.accountId, commandId)) {
      const audit = recordGmAudit(data, resolved.account.username, commandId, false, "GM命令未授权。", now, randomId);
      save(data);
      return fail("command_denied", "GM命令未授权。", {"auditId": audit.auditId});
    }
    const audit = recordGmAudit(data, resolved.account.username, commandId, true, "", now, randomId);
    save(data);
    return ok({
      commandId,
      auditId: audit.auditId,
      message: "GM命令已授权。",
    });
  }

  function snapshot() {
    return load();
  }

  return {
    register,
    login,
    logout,
    getSession,
    getProfile,
    saveProfile,
    searchPlayers,
    sendMail,
    listInbox,
    markMailRead,
    listOnlinePlayers,
    updatePlayerPosition,
    onEvent,
    eventForSession,
    getPartyState,
    inviteToParty,
    acceptPartyInvite,
    declinePartyInvite,
    leaveParty,
    listChatMessages,
    sendChatMessage,
    grantGm,
    listGmTools,
    authorizeGmCommand,
    snapshot,
  };
}

function createMemoryAuthStore(initialData = null) {
  let data = normalizeData(initialData || {});
  return {
    load() {
      return clone(data);
    },
    save(nextData) {
      data = normalizeData(clone(nextData));
    },
  };
}

function createJsonAuthStore(filePath) {
  return {
    load() {
      if (!fs.existsSync(filePath)) {
        return {};
      }
      try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch {
        return {};
      }
    },
    save(nextData) {
      fs.mkdirSync(path.dirname(filePath), {"recursive": true});
      fs.writeFileSync(filePath, JSON.stringify(normalizeData(nextData), null, 2));
    },
  };
}

function normalizeData(raw) {
  const data = raw && typeof raw === "object" ? clone(raw) : {};
  return {
    schemaVersion: 1,
    accounts: objectOrEmpty(data.accounts),
    sessions: objectOrEmpty(data.sessions),
    profileBindings: objectOrEmpty(data.profileBindings),
    profiles: objectOrEmpty(data.profiles),
    mailMessages: objectOrEmpty(data.mailMessages),
    parties: objectOrEmpty(data.parties),
    partyInvites: objectOrEmpty(data.partyInvites),
    chatMessages: Array.isArray(data.chatMessages) ? data.chatMessages : [],
    playerPositions: objectOrEmpty(data.playerPositions),
    gmUserGrants: objectOrEmpty(data.gmUserGrants),
    gmCommandGrants: objectOrEmpty(data.gmCommandGrants),
    gmCommandAudit: Array.isArray(data.gmCommandAudit) ? data.gmCommandAudit : [],
    authEvents: Array.isArray(data.authEvents) ? data.authEvents : [],
  };
}

function createSessionForAccount(data, account, now, randomBytes) {
  const token = randomBytes(32).toString("base64url");
  const session = {
    sessionId: `sess_${crypto.randomUUID()}`,
    accountId: account.accountId,
    tokenHash: hashToken(token),
    createdAt: isoNow(now),
    expiresAt: new Date(now() + SESSION_TTL_MS).toISOString(),
    revokedAt: null,
    schemaVersion: 1,
  };
  data.sessions[session.sessionId] = session;
  return {session, token};
}

function resolveSession(data, token, now) {
  const tokenHash = hashToken(String(token || ""));
  const session = Object.values(data.sessions).find((value) => value && value.tokenHash === tokenHash);
  if (!session) {
    return {"ok": false, "code": "session_missing", "message": "登录会话不存在。"};
  }
  if (session.revokedAt) {
    return {"ok": false, "code": "session_revoked", "message": "登录会话已失效。"};
  }
  if (Date.parse(session.expiresAt) <= now()) {
    return {"ok": false, "code": "session_expired", "message": "登录会话已过期。"};
  }
  const account = Object.values(data.accounts).find((value) => value.accountId === session.accountId);
  if (!account) {
    return {"ok": false, "code": "account_missing", "message": "账号不存在。"};
  }
  return {"ok": true, session, account};
}

function publicAccount(account) {
  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    role: account.role,
    createdAt: account.createdAt,
  };
}

function publicSession(session, account, data, token = "") {
  const result = {
    sessionId: session.sessionId,
    username: account.username,
    effectiveRole: effectiveRoleIsGm(data, account, () => Date.now()) ? ROLE_GM : ROLE_PLAYER,
    expiresAt: session.expiresAt,
  };
  if (token) {
    result.token = token;
  }
  return result;
}

function publicPlayerSearchResult(account, data) {
  const summary = profileSummaryForAccount(account, data);
  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    playerId: summary && summary.playerId ? summary.playerId : "",
  };
}

function publicOnlinePlayer(account, data) {
  const summary = profileSummaryForAccount(account, data);
  const party = partyForAccount(data, account.accountId);
  const position = data.playerPositions[account.accountId] || null;
  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    playerId: summary && summary.playerId ? summary.playerId : "",
    partyId: party ? party.partyId : "",
    partyRole: party && party.leaderAccountId === account.accountId ? "leader" : (party ? "member" : ""),
    position: position ? publicPlayerPosition(position) : null,
  };
}

function publicPlayerPosition(position) {
  return {
    mapId: position.mapId,
    cellX: Number(position.cellX || 0),
    cellY: Number(position.cellY || 0),
    facing: position.facing,
    moving: Boolean(position.moving),
    updatedAt: position.updatedAt,
    schemaVersion: 1,
  };
}

function publicMail(mail) {
  return {
    mailId: mail.mailId,
    senderUsername: mail.senderUsername,
    senderDisplayName: mail.senderDisplayName,
    recipientUsername: mail.recipientUsername,
    recipientDisplayName: mail.recipientDisplayName,
    title: mail.title,
    body: mail.body,
    createdAt: mail.createdAt,
    readAt: mail.readAt || null,
    schemaVersion: 1,
  };
}

function publicChatMessage(message) {
  return {
    messageId: message.messageId,
    channel: message.channel,
    partyId: message.partyId || "",
    senderUsername: message.senderUsername,
    senderDisplayName: message.senderDisplayName,
    text: message.text,
    createdAt: message.createdAt,
    schemaVersion: 1,
  };
}

function partyStatePayload(data, accountId) {
  return {
    party: publicPartyForAccount(data, accountId),
    incomingInvites: publicIncomingPartyInvites(data, accountId),
    maxMembers: PARTY_MAX_MEMBERS,
  };
}

function publicPartyForAccount(data, accountId) {
  const party = partyForAccount(data, accountId);
  return party ? publicParty(party, data) : null;
}

function publicParty(party, data) {
  if (!party) {
    return null;
  }
  const members = [];
  for (const accountId of party.memberAccountIds || []) {
    const account = accountById(data, accountId);
    if (!account) {
      continue;
    }
    members.push({
      accountId: account.accountId,
      username: account.username,
      displayName: account.displayName,
      role: account.accountId === party.leaderAccountId ? "leader" : "member",
    });
  }
  return {
    partyId: party.partyId,
    leaderAccountId: party.leaderAccountId,
    members,
    memberCount: members.length,
    maxMembers: PARTY_MAX_MEMBERS,
    createdAt: party.createdAt,
    updatedAt: party.updatedAt,
    schemaVersion: 1,
  };
}

function publicIncomingPartyInvites(data, accountId) {
  return Object.values(data.partyInvites)
    .filter((invite) => invite && invite.status === "pending" && invite.toAccountId === accountId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((invite) => publicPartyInvite(invite, data));
}

function publicPartyInvite(invite, data) {
  const from = accountById(data, invite.fromAccountId);
  const to = accountById(data, invite.toAccountId);
  return {
    inviteId: invite.inviteId,
    partyId: invite.partyId,
    fromUsername: from ? from.username : "",
    fromDisplayName: from ? from.displayName : "",
    toUsername: to ? to.username : "",
    toDisplayName: to ? to.displayName : "",
    status: invite.status,
    createdAt: invite.createdAt,
    updatedAt: invite.updatedAt,
    schemaVersion: 1,
  };
}

function createPartyForLeader(data, leaderAccountId, now, randomId) {
  const party = {
    partyId: `party_${randomId()}`,
    leaderAccountId,
    memberAccountIds: [leaderAccountId],
    createdAt: isoNow(now),
    updatedAt: isoNow(now),
    schemaVersion: 1,
  };
  data.parties[party.partyId] = party;
  return party;
}

function partyForAccount(data, accountId) {
  return Object.values(data.parties).find((party) => (
    party &&
    Array.isArray(party.memberAccountIds) &&
    party.memberAccountIds.includes(accountId)
  )) || null;
}

function accountById(data, accountId) {
  return Object.values(data.accounts).find((account) => account && account.accountId === accountId) || null;
}

function activeOnlinePlayers(data, now) {
  const activeSessions = Object.values(data.sessions)
    .filter((session) => session && !session.revokedAt && Date.parse(session.expiresAt) > now())
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const seenAccountIds = new Set();
  const players = [];
  for (const session of activeSessions) {
    if (seenAccountIds.has(session.accountId)) {
      continue;
    }
    const account = accountById(data, session.accountId);
    if (!account) {
      continue;
    }
    seenAccountIds.add(session.accountId);
    players.push(account);
  }
  players.sort((a, b) => String(a.username).localeCompare(String(b.username)));
  return players;
}

function onlinePlayersForViewer(data, viewerAccount, aoi, now) {
  return activeOnlinePlayers(data, now).filter((account) => (
    onlineAccountVisibleToViewer(data, viewerAccount, account, aoi)
  ));
}

function onlineAccountVisibleToViewer(data, viewerAccount, account, aoi) {
  if (!aoi || !aoi.enabled) {
    return true;
  }
  if (viewerAccount && account.accountId === viewerAccount.accountId) {
    return true;
  }
  return onlinePositionVisibleToAoi(data.playerPositions[account.accountId] || null, aoi);
}

function normalizeOnlineAoiPayload(payload = {}, fallbackPosition = null) {
  const scope = String(payload.scope || payload.viewScope || "").trim().toLowerCase();
  const hasExplicitPosition = (
    String(payload.mapId || payload.map || "").trim() !== "" ||
    payload.cellX !== undefined ||
    payload.cellY !== undefined ||
    payload.x !== undefined ||
    payload.y !== undefined
  );
  if (scope !== ONLINE_AOI_SCOPE && scope !== "nearby" && !hasExplicitPosition) {
    return {
      enabled: false,
      scope: "all",
      mapId: "",
      cellX: 0,
      cellY: 0,
      radius: ONLINE_AOI_DEFAULT_RADIUS,
    };
  }
  const source = hasExplicitPosition ? payload : (fallbackPosition || {});
  const mapId = String(source.mapId || source.map || "").trim().slice(0, POSITION_MAP_ID_MAX_LENGTH);
  if (!mapId) {
    return {
      enabled: false,
      scope: "all",
      mapId: "",
      cellX: 0,
      cellY: 0,
      radius: ONLINE_AOI_DEFAULT_RADIUS,
    };
  }
  return {
    enabled: true,
    scope: ONLINE_AOI_SCOPE,
    mapId,
    cellX: clampInt(source.cellX ?? source.x, -9999, 9999, 0),
    cellY: clampInt(source.cellY ?? source.y, -9999, 9999, 0),
    radius: clampInt(payload.aoiRadius ?? payload.viewRadius ?? payload.radius, 1, ONLINE_AOI_MAX_RADIUS, ONLINE_AOI_DEFAULT_RADIUS),
  };
}

function onlinePositionVisibleToAoi(position, aoi) {
  if (!aoi || !aoi.enabled) {
    return true;
  }
  if (!position || typeof position !== "object") {
    return false;
  }
  if (String(position.mapId || "") !== aoi.mapId) {
    return false;
  }
  const dx = Math.abs(Number(position.cellX || 0) - aoi.cellX);
  const dy = Math.abs(Number(position.cellY || 0) - aoi.cellY);
  return dx <= aoi.radius && dy <= aoi.radius;
}

function publicOnlineAoi(aoi) {
  return {
    scope: aoi && aoi.enabled ? ONLINE_AOI_SCOPE : "all",
    mapId: aoi && aoi.enabled ? aoi.mapId : "",
    cellX: aoi && aoi.enabled ? aoi.cellX : 0,
    cellY: aoi && aoi.enabled ? aoi.cellY : 0,
    radius: aoi && Number.isFinite(aoi.radius) ? aoi.radius : ONLINE_AOI_DEFAULT_RADIUS,
    schemaVersion: 1,
  };
}

function profileSummaryForAccount(account, data) {
  const binding = data.profileBindings[account.accountId] || null;
  if (!binding) {
    return null;
  }
  const profileDoc = data.profiles[binding.playerId] || null;
  const hasProfile = Boolean(profileDoc && profileDoc.profile);
  const revision = Number(binding.profileRevision || (profileDoc && profileDoc.profileRevision) || 0);
  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    playerId: binding.playerId,
    profileRevision: revision,
    storageMode: hasProfile ? "server_document" : "local_shadow",
    serverAuthority: hasProfile ? "profile_document" : "account_binding",
    hasProfile,
    updatedAt: binding.updatedAt,
    schemaVersion: 1,
  };
}

function profileBindingForAccount(data, account, now) {
  let binding = data.profileBindings[account.accountId] || null;
  if (!binding) {
    binding = {
      accountId: account.accountId,
      playerId: `player_${account.accountId.slice(4, 16)}`,
      profileRevision: 0,
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    data.profileBindings[account.accountId] = binding;
  }
  return binding;
}

function effectiveRoleIsGm(data, account, now) {
  if (!account || account.role !== ROLE_GM) {
    return false;
  }
  const grant = data.gmUserGrants[account.accountId];
  if (!grant || !grant.enabled) {
    return false;
  }
  if (grant.expiresAt && Date.parse(grant.expiresAt) <= now()) {
    return false;
  }
  return true;
}

function commandAllowed(data, accountId, commandId) {
  const grants = Array.isArray(data.gmCommandGrants[accountId]) ? data.gmCommandGrants[accountId] : [];
  return grants.some((grant) => grant.enabled && (grant.commandId === "*" || grant.commandId === commandId));
}

function recordGmAudit(data, username, commandId, okValue, message, now, randomId) {
  const audit = {
    auditId: `audit_${randomId()}`,
    username,
    commandId,
    ok: Boolean(okValue),
    message,
    createdAt: isoNow(now),
    schemaVersion: 1,
  };
  data.gmCommandAudit.push(audit);
  while (data.gmCommandAudit.length > MAX_AUDIT_ROWS) {
    data.gmCommandAudit.shift();
  }
  return audit;
}

function recordAuthEvent(data, type, username, okValue, message, now) {
  data.authEvents.push({
    eventId: `auth_${crypto.randomUUID()}`,
    type,
    username,
    ok: Boolean(okValue),
    message,
    createdAt: isoNow(now),
    schemaVersion: 1,
  });
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function normalizeCommandId(commandId) {
  return String(commandId || "").trim().toLowerCase();
}

function normalizeCommandIds(commandIds) {
  const result = [];
  for (const value of commandIds) {
    const commandId = normalizeCommandId(value);
    if (commandId && !result.includes(commandId)) {
      result.push(commandId);
    }
  }
  return result.length > 0 ? result : ["*"];
}

function normalizeMailText(value, maxLength) {
  return String(value || "").trim().replace(/\s+\n/g, "\n").slice(0, maxLength);
}

function normalizeChatChannel(value) {
  const channel = String(value || "").trim().toLowerCase();
  if (channel === CHAT_CHANNEL_NEARBY || channel === CHAT_CHANNEL_TEAM) {
    return channel;
  }
  return "";
}

function normalizeChatText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, CHAT_TEXT_MAX_LENGTH);
}

function normalizePlayerPositionPayload(payload, account, now) {
  const mapId = String(payload.mapId || payload.map || "").trim().slice(0, POSITION_MAP_ID_MAX_LENGTH);
  let facing = String(payload.facing || "south").trim().toLowerCase();
  if (!POSITION_FACING_VALUES.has(facing)) {
    facing = "south";
  }
  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    mapId,
    cellX: clampInt(payload.cellX ?? payload.x, -9999, 9999, 0),
    cellY: clampInt(payload.cellY ?? payload.y, -9999, 9999, 0),
    facing,
    moving: Boolean(payload.moving),
    updatedAt: isoNow(now),
    schemaVersion: 1,
  };
}

function clampInt(value, minValue, maxValue, fallbackValue) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallbackValue;
  }
  return Math.max(minValue, Math.min(maxValue, Math.trunc(number)));
}

function isValidUsername(username) {
  return (
    username.length >= USERNAME_MIN_LENGTH &&
    username.length <= USERNAME_MAX_LENGTH &&
    /^[a-z0-9_]+$/.test(username)
  );
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), String(salt), 32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function isoNow(now) {
  return new Date(now()).toISOString();
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function ok(payload = {}) {
  return {"ok": true, ...payload};
}

function fail(code, message, extra = {}) {
  return {"ok": false, code, message, ...extra};
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  ROLE_PLAYER,
  ROLE_GM,
  createAuthService,
  createMemoryAuthStore,
  createJsonAuthStore,
  normalizeUsername,
  isValidUsername,
};
