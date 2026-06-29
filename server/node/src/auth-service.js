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
const MAX_SERVICE_EVENTS = 500;
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
const MOVEMENT_MAX_STEP_CELLS = 1;
const BATTLE_ROOM_ENTRY_MAX_DISTANCE = 4;
const BATTLE_MODE_DUEL = "duel";
const BATTLE_INVITE_PENDING = "pending";
const BATTLE_INVITE_ACCEPTED = "accepted";
const BATTLE_INVITE_DECLINED = "declined";
const BATTLE_ROOM_READY = "ready";
const BATTLE_PHASE_COMMAND = "command";
const BATTLE_ACTION_ATTACK = "attack";
const BATTLE_ACTION_DEFEND = "defend";
const BATTLE_ACTOR_MAX_HP = 120;
const BATTLE_BASE_ATTACK_DAMAGE = 18;
const BATTLE_DEFEND_REDUCTION = 8;

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
      ...event,
      schemaVersion: 1,
      createdAt: isoNow(now),
    };
    if (serviceEventIsReplayable(payload)) {
      const data = load();
      const eventSeq = nextServiceEventSeq(data);
      payload.eventId = `server_event_${eventSeq}`;
      payload.eventSeq = eventSeq;
      data.serviceEventSeq = eventSeq;
      data.serviceEvents.push(clone(payload));
      while (data.serviceEvents.length > MAX_SERVICE_EVENTS) {
        data.serviceEvents.shift();
      }
      save(data);
    }
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
    return publishPositionUpdate(data, resolved.account, position, previousPosition, payload, {
      authority: "client_snapshot",
    });
  }

  function movePlayerStep(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    if (activeBattleRoomForAccount(data, resolved.account.accountId)) {
      return fail("movement_battle_locked", "切磋房间中不能移动。");
    }
    const currentPosition = data.playerPositions[resolved.account.accountId] || null;
    if (!currentPosition || !currentPosition.mapId) {
      return fail("movement_position_missing", "请先同步当前位置。");
    }
    const step = normalizeMovementStepPayload(payload, currentPosition);
    if (!step.mapId) {
      return fail("movement_map_missing", "移动缺少地图。");
    }
    if (step.mapId !== currentPosition.mapId) {
      return fail("movement_map_mismatch", "不能用单步移动切换地图。");
    }
    if (step.fromCellX !== Number(currentPosition.cellX || 0) || step.fromCellY !== Number(currentPosition.cellY || 0)) {
      return fail("movement_origin_mismatch", "服务器位置已变化，请重新同步。", {
        position: publicPlayerPosition(currentPosition),
      });
    }
    const dx = Math.abs(step.toCellX - step.fromCellX);
    const dy = Math.abs(step.toCellY - step.fromCellY);
    if (dx === 0 && dy === 0) {
      return fail("movement_noop", "移动目标与当前位置相同。");
    }
    if (dx > MOVEMENT_MAX_STEP_CELLS || dy > MOVEMENT_MAX_STEP_CELLS) {
      return fail("movement_step_too_far", "移动距离过远，请重新同步。", {
        maxStepCells: MOVEMENT_MAX_STEP_CELLS,
        position: publicPlayerPosition(currentPosition),
      });
    }
    const position = normalizePlayerPositionPayload({
      mapId: currentPosition.mapId,
      cellX: step.toCellX,
      cellY: step.toCellY,
      facing: normalizeMovementFacing(payload.facing, step),
      moving: Boolean(payload.moving),
    }, resolved.account, now);
    position.movementSeq = Number(currentPosition.movementSeq || 0) + 1;
    position.authority = "server_step";
    const previousPosition = publicPlayerPosition(currentPosition);
    data.playerPositions[resolved.account.accountId] = position;
    save(data);
    return publishPositionUpdate(data, resolved.account, position, previousPosition, payload, {
      authority: "server_step",
      movement: {
        authority: "server_step",
        stepAccepted: true,
        movementSeq: position.movementSeq,
        maxStepCells: MOVEMENT_MAX_STEP_CELLS,
      },
    });
  }

  function publishPositionUpdate(data, account, position, previousPosition, payload = {}, extra = {}) {
    const aoi = normalizeOnlineAoiPayload({
      scope: ONLINE_AOI_SCOPE,
      radius: payload.aoiRadius ?? payload.viewRadius ?? payload.radius,
    }, position);
    const players = onlinePlayersForViewer(data, account, aoi, now).map((onlineAccount) => publicOnlinePlayer(onlineAccount, data));
    players.sort((a, b) => String(a.username).localeCompare(String(b.username)));
    emitServiceEvent({
      type: "online.position",
      accountId: account.accountId,
      username: account.username,
      position: publicPlayerPosition(position),
      previousPosition,
      players,
      aoi: publicOnlineAoi(aoi),
      authority: extra.authority || "client_snapshot",
      movement: extra.movement || null,
    });
    return ok({
      position: publicPlayerPosition(position),
      players,
      party: publicPartyForAccount(data, account.accountId),
      aoi: publicOnlineAoi(aoi),
      authority: extra.authority || "client_snapshot",
      movement: extra.movement || null,
    });
  }

  function eventForSession(token, event = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    return eventForResolvedSession(data, resolved, event);
  }

  function listEventsForSession(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const afterSeq = normalizeEventSeq(payload.afterSeq ?? payload.lastEventSeq ?? 0);
    const throughSeq = normalizeEventSeq(payload.throughSeq ?? payload.maxEventSeq ?? Number.MAX_SAFE_INTEGER);
    const events = [];
    for (const event of data.serviceEvents) {
      const eventSeq = normalizeEventSeq(event && event.eventSeq);
      if (eventSeq <= afterSeq || eventSeq > throughSeq) {
        continue;
      }
      if (!serviceEventVisibleToAccount(event, resolved.account.accountId)) {
        continue;
      }
      const prepared = eventForResolvedSession(data, resolved, event);
      if (prepared.ok && prepared.visible !== false) {
        events.push(prepared.event || event);
      }
    }
    return ok({
      events,
      latestEventSeq: normalizeEventSeq(data.serviceEventSeq),
    });
  }

  function latestEventSeq() {
    const data = load();
    return normalizeEventSeq(data.serviceEventSeq);
  }

  function eventForResolvedSession(data, resolved, event = {}) {
    if (event && event.type === "online.position") {
      return onlinePositionEventForResolvedSession(data, resolved, event);
    }
    return ok({
      visible: true,
      event,
    });
  }

  function onlinePositionEventForResolvedSession(data, resolved, event = {}) {
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

  function getBattleState(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    return ok(battleStatePayload(data, resolved.account.accountId));
  }

  function inviteToBattle(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const targetUsername = normalizeUsername(payload.username || payload.targetUsername || payload.recipientUsername || "");
    const target = data.accounts[targetUsername];
    if (!target) {
      return fail("battle_target_missing", "玩家不存在。");
    }
    if (target.accountId === resolved.account.accountId) {
      return fail("battle_invite_self", "不能向自己发起切磋。");
    }
    const onlineTarget = activeOnlinePlayers(data, now).some((account) => account.accountId === target.accountId);
    if (!onlineTarget) {
      return fail("battle_target_offline", "对方不在线。");
    }
    if (activeBattleRoomForAccount(data, resolved.account.accountId)) {
      return fail("battle_self_busy", "你已经在切磋房间中。");
    }
    if (activeBattleRoomForAccount(data, target.accountId)) {
      return fail("battle_target_busy", "对方已经在切磋房间中。");
    }
    const pendingInvite = Object.values(data.battleInvites).find((invite) => (
      invite &&
      invite.status === BATTLE_INVITE_PENDING &&
      invite.fromAccountId === resolved.account.accountId &&
      invite.toAccountId === target.accountId
    ));
    if (pendingInvite) {
      return ok({
        invite: publicBattleInvite(pendingInvite, data),
        room: null,
        message: "切磋邀请已发送。",
      });
    }
    const invite = {
      inviteId: `battle_invite_${randomId()}`,
      mode: BATTLE_MODE_DUEL,
      fromAccountId: resolved.account.accountId,
      toAccountId: target.accountId,
      status: BATTLE_INVITE_PENDING,
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    data.battleInvites[invite.inviteId] = invite;
    save(data);
    emitServiceEvent({
      type: "battle.invite",
      targetAccountIds: [resolved.account.accountId, target.accountId],
      invite: publicBattleInvite(invite, data),
    });
    return ok({
      invite: publicBattleInvite(invite, data),
      room: null,
      message: "切磋邀请已发送。",
    });
  }

  function acceptBattleInvite(token, inviteId) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const invite = data.battleInvites[String(inviteId || "").trim()];
    if (!invite || invite.status !== BATTLE_INVITE_PENDING || invite.toAccountId !== resolved.account.accountId) {
      return fail("battle_invite_missing", "切磋邀请不存在。");
    }
    if (activeBattleRoomForAccount(data, invite.fromAccountId) || activeBattleRoomForAccount(data, invite.toAccountId)) {
      return fail("battle_room_busy", "双方已有切磋房间。");
    }
    const challenger = accountById(data, invite.fromAccountId);
    const opponent = accountById(data, invite.toAccountId);
    if (!challenger || !opponent) {
      return fail("battle_account_missing", "切磋账号不存在。");
    }
    const entryCheck = battleRoomEntryCheck(data, invite);
    if (!entryCheck.ok) {
      return entryCheck;
    }
    invite.status = BATTLE_INVITE_ACCEPTED;
    invite.updatedAt = isoNow(now);
    data.battleInvites[invite.inviteId] = invite;
    const room = {
      roomId: `battle_room_${randomId()}`,
      mode: BATTLE_MODE_DUEL,
      status: BATTLE_ROOM_READY,
      inviteId: invite.inviteId,
      seed: randomBytes(8).toString("hex"),
      participantAccountIds: [invite.fromAccountId, invite.toAccountId],
      entry: entryCheck.entry,
      participants: [
        battleParticipantSnapshot(data, challenger, "challenger"),
        battleParticipantSnapshot(data, opponent, "opponent"),
      ],
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    room.battle = createBattleRoomBattleState(room, now);
    data.battleRooms[room.roomId] = room;
    save(data);
    emitServiceEvent({
      type: "battle.room_ready",
      targetAccountIds: room.participantAccountIds.slice(),
      invite: publicBattleInvite(invite, data),
      room: publicBattleRoom(room),
    });
    return ok({
      invite: publicBattleInvite(invite, data),
      room: publicBattleRoom(room),
      message: "切磋房间已就绪。",
    });
  }

  function declineBattleInvite(token, inviteId) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const invite = data.battleInvites[String(inviteId || "").trim()];
    if (!invite || invite.status !== BATTLE_INVITE_PENDING || invite.toAccountId !== resolved.account.accountId) {
      return fail("battle_invite_missing", "切磋邀请不存在。");
    }
    invite.status = BATTLE_INVITE_DECLINED;
    invite.updatedAt = isoNow(now);
    data.battleInvites[invite.inviteId] = invite;
    save(data);
    emitServiceEvent({
      type: "battle.invite_declined",
      targetAccountIds: [invite.fromAccountId, invite.toAccountId],
      invite: publicBattleInvite(invite, data),
      room: null,
    });
    return ok({
      invite: publicBattleInvite(invite, data),
      room: null,
      message: "已拒绝切磋邀请。",
    });
  }

  function submitBattleCommand(token, roomId, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const normalizedRoomId = String(roomId || payload.roomId || "").trim();
    const room = data.battleRooms[normalizedRoomId] || null;
    if (!room || room.status === "closed") {
      return fail("battle_room_missing", "切磋房间不存在。");
    }
    if (!Array.isArray(room.participantAccountIds) || !room.participantAccountIds.includes(resolved.account.accountId)) {
      return fail("battle_room_forbidden", "你不在这个切磋房间中。");
    }
    const battle = battleRoomBattleStateForMutation(room, now);
    if (String(battle.phase || "") !== BATTLE_PHASE_COMMAND) {
      return fail("battle_command_phase_invalid", "当前不能提交回合命令。", {
        room: publicBattleRoom(room),
      });
    }
    const expectedRound = Number(battle.round || 1);
    const commandRound = clampInt(payload.round, 1, Number.MAX_SAFE_INTEGER, expectedRound);
    if (commandRound !== expectedRound) {
      return fail("battle_command_round_mismatch", "回合已变化，请重新同步。", {
        expectedRound,
        room: publicBattleRoom(room),
      });
    }
    if (battle.commands && battle.commands[resolved.account.accountId]) {
      return fail("battle_command_duplicate", "本回合命令已经提交。", {
        room: publicBattleRoom(room),
      });
    }
    const commandResult = normalizeBattleCommandPayload(payload, data, room, battle, resolved.account, now, randomId);
    if (!commandResult.ok) {
      return commandResult;
    }
    battle.commands[resolved.account.accountId] = commandResult.command;
    battle.submittedAccountIds = submittedBattleCommandAccountIds(battle);
    battle.updatedAt = isoNow(now);
    room.updatedAt = battle.updatedAt;
    const commandSubmittedAccountIds = battle.submittedAccountIds.slice();
    const commandSubmittedRoom = publicBattleRoom(room);
    let turn = null;
    const readyToResolve = requiredBattleCommandAccountIds(room).every((accountId) => battle.commands[accountId]);
    if (readyToResolve) {
      turn = resolveBattleRoomTurn(room, battle, now);
    }
    data.battleRooms[room.roomId] = room;
    save(data);
    emitServiceEvent({
      type: "battle.command_submitted",
      targetAccountIds: room.participantAccountIds.slice(),
      roomId: room.roomId,
      round: expectedRound,
      submittedAccountId: resolved.account.accountId,
      submittedUsername: resolved.account.username,
      submittedAccountIds: commandSubmittedAccountIds,
      requiredAccountIds: requiredBattleCommandAccountIds(room),
      room: commandSubmittedRoom,
    });
    if (turn) {
      emitServiceEvent({
        type: "battle.turn_resolved",
        targetAccountIds: room.participantAccountIds.slice(),
        roomId: room.roomId,
        round: turn.round,
        turn,
        room: publicBattleRoom(room),
      });
    }
    return ok({
      room: publicBattleRoom(room),
      command: publicBattleCommand(commandResult.command),
      turn,
      message: turn ? "本回合已结算。" : "回合命令已提交。",
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
    movePlayerStep,
    onEvent,
    eventForSession,
    listEventsForSession,
    latestEventSeq,
    getPartyState,
    inviteToParty,
    acceptPartyInvite,
    declinePartyInvite,
    leaveParty,
    listChatMessages,
    sendChatMessage,
    getBattleState,
    inviteToBattle,
    acceptBattleInvite,
    declineBattleInvite,
    submitBattleCommand,
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
  const serviceEvents = normalizeServiceEvents(data.serviceEvents);
  const serviceEventSeq = Math.max(
    normalizeEventSeq(data.serviceEventSeq),
    0,
    ...serviceEvents.map((event) => normalizeEventSeq(event.eventSeq))
  );
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
    battleInvites: objectOrEmpty(data.battleInvites),
    battleRooms: objectOrEmpty(data.battleRooms),
    gmUserGrants: objectOrEmpty(data.gmUserGrants),
    gmCommandGrants: objectOrEmpty(data.gmCommandGrants),
    gmCommandAudit: Array.isArray(data.gmCommandAudit) ? data.gmCommandAudit : [],
    authEvents: Array.isArray(data.authEvents) ? data.authEvents : [],
    serviceEventSeq,
    serviceEvents,
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
    movementSeq: Number(position.movementSeq || 0),
    authority: String(position.authority || "client_snapshot"),
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

function battleStatePayload(data, accountId) {
  return {
    room: publicBattleRoom(activeBattleRoomForAccount(data, accountId)),
    incomingInvites: publicIncomingBattleInvites(data, accountId),
    outgoingInvites: publicOutgoingBattleInvites(data, accountId),
  };
}

function publicIncomingBattleInvites(data, accountId) {
  return Object.values(data.battleInvites)
    .filter((invite) => invite && invite.status === BATTLE_INVITE_PENDING && invite.toAccountId === accountId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((invite) => publicBattleInvite(invite, data));
}

function publicOutgoingBattleInvites(data, accountId) {
  return Object.values(data.battleInvites)
    .filter((invite) => invite && invite.status === BATTLE_INVITE_PENDING && invite.fromAccountId === accountId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((invite) => publicBattleInvite(invite, data));
}

function publicBattleInvite(invite, data) {
  if (!invite) {
    return {};
  }
  const from = accountById(data, invite.fromAccountId);
  const to = accountById(data, invite.toAccountId);
  return {
    inviteId: invite.inviteId,
    mode: invite.mode || BATTLE_MODE_DUEL,
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

function publicBattleRoom(room) {
  if (!room) {
    return null;
  }
  return {
    roomId: room.roomId,
    mode: room.mode || BATTLE_MODE_DUEL,
    status: room.status,
    seed: room.seed,
    inviteId: room.inviteId,
    participantAccountIds: Array.isArray(room.participantAccountIds) ? room.participantAccountIds.slice() : [],
    entry: room.entry && typeof room.entry === "object" ? clone(room.entry) : null,
    participants: Array.isArray(room.participants) ? clone(room.participants) : [],
    battle: publicBattleRoomBattle(room.battle || null),
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    schemaVersion: 1,
  };
}

function publicBattleRoomBattle(battle) {
  if (!battle || typeof battle !== "object" || Array.isArray(battle)) {
    return null;
  }
  return {
    round: Number(battle.round || 1),
    phase: String(battle.phase || BATTLE_PHASE_COMMAND),
    turnSeq: Number(battle.turnSeq || 0),
    requiredAccountIds: Array.isArray(battle.requiredAccountIds) ? battle.requiredAccountIds.slice() : [],
    submittedAccountIds: Array.isArray(battle.submittedAccountIds) ? battle.submittedAccountIds.slice() : [],
    actors: Array.isArray(battle.actors) ? battle.actors.map(publicBattleActor) : [],
    lastEventList: battle.lastEventList && typeof battle.lastEventList === "object" ? clone(battle.lastEventList) : null,
    updatedAt: battle.updatedAt || "",
    schemaVersion: 1,
  };
}

function publicBattleActor(actor) {
  return {
    actorId: String(actor.actorId || ""),
    accountId: String(actor.accountId || ""),
    username: String(actor.username || ""),
    displayName: String(actor.displayName || actor.username || ""),
    side: String(actor.side || ""),
    slotId: String(actor.slotId || ""),
    hp: Number(actor.hp || 0),
    maxHp: Number(actor.maxHp || BATTLE_ACTOR_MAX_HP),
    speed: Number(actor.speed || 0),
    guarding: Boolean(actor.guarding),
    defeated: Boolean(actor.defeated),
    schemaVersion: 1,
  };
}

function publicBattleCommand(command) {
  if (!command || typeof command !== "object") {
    return {};
  }
  return {
    commandId: String(command.commandId || ""),
    roomId: String(command.roomId || ""),
    round: Number(command.round || 1),
    accountId: String(command.accountId || ""),
    username: String(command.username || ""),
    actionId: String(command.actionId || ""),
    targetAccountId: String(command.targetAccountId || ""),
    submittedAt: String(command.submittedAt || ""),
    schemaVersion: 1,
  };
}

function battleParticipantSnapshot(data, account, side) {
  const summary = profileSummaryForAccount(account, data);
  const profileDoc = summary && summary.playerId ? data.profiles[summary.playerId] || null : null;
  const profile = profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" ? profileDoc.profile : {};
  const player = profile.player && typeof profile.player === "object" ? profile.player : {};
  const pets = Array.isArray(profile.pets) ? profile.pets : [];
  const battlePets = pets
    .filter((pet) => pet && (pet.state === "battle" || pet.status === "battle" || pet.battleState === "battle"))
    .slice(0, 5)
    .map((pet) => ({
      petId: String(pet.petId || pet.instanceId || pet.id || ""),
      name: String(pet.name || pet.displayName || pet.speciesName || "宠物"),
      speciesId: String(pet.speciesId || pet.templateId || ""),
      level: Number(pet.level || 1),
      schemaVersion: 1,
    }));
  const position = data.playerPositions[account.accountId] || null;
  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    side,
    profileSummary: summary || null,
    position: position ? publicPlayerPosition(position) : null,
    teamSnapshot: {
      playerLevel: Number(player.level || 1),
      battlePetCount: battlePets.length,
      battlePets,
      schemaVersion: 1,
    },
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

function activeBattleRoomForAccount(data, accountId) {
  return Object.values(data.battleRooms).find((room) => (
    room &&
    room.status !== "closed" &&
    Array.isArray(room.participantAccountIds) &&
    room.participantAccountIds.includes(accountId)
  )) || null;
}

function battleRoomEntryCheck(data, invite) {
  const challengerPosition = data.playerPositions[invite.fromAccountId] || null;
  const opponentPosition = data.playerPositions[invite.toAccountId] || null;
  if (!challengerPosition || !opponentPosition || !challengerPosition.mapId || !opponentPosition.mapId) {
    return fail("battle_position_missing", "切磋前需要双方同步当前位置。");
  }
  if (String(challengerPosition.mapId) !== String(opponentPosition.mapId)) {
    return fail("battle_map_mismatch", "双方不在同一张地图，无法开始切磋。");
  }
  if (challengerPosition.moving || opponentPosition.moving) {
    return fail("battle_player_moving", "双方需要停稳后才能开始切磋。");
  }
  const dx = Math.abs(Number(challengerPosition.cellX || 0) - Number(opponentPosition.cellX || 0));
  const dy = Math.abs(Number(challengerPosition.cellY || 0) - Number(opponentPosition.cellY || 0));
  const distanceCells = Math.max(dx, dy);
  if (distanceCells > BATTLE_ROOM_ENTRY_MAX_DISTANCE) {
    return fail("battle_distance_too_far", "距离太远，无法开始切磋。", {
      distanceCells,
      maxDistanceCells: BATTLE_ROOM_ENTRY_MAX_DISTANCE,
    });
  }
  return ok({
    entry: {
      mapId: String(challengerPosition.mapId),
      distanceCells,
      maxDistanceCells: BATTLE_ROOM_ENTRY_MAX_DISTANCE,
      challengerPosition: publicPlayerPosition(challengerPosition),
      opponentPosition: publicPlayerPosition(opponentPosition),
      schemaVersion: 1,
    },
  });
}

function createBattleRoomBattleState(room, now) {
  const actors = battleRoomActors(room);
  return {
    round: 1,
    phase: BATTLE_PHASE_COMMAND,
    turnSeq: 0,
    requiredAccountIds: requiredBattleCommandAccountIds(room),
    submittedAccountIds: [],
    commands: {},
    actors,
    lastEventList: null,
    eventLog: [],
    updatedAt: isoNow(now),
    schemaVersion: 1,
  };
}

function battleRoomBattleStateForMutation(room, now) {
  if (!room.battle || typeof room.battle !== "object" || Array.isArray(room.battle)) {
    room.battle = createBattleRoomBattleState(room, now);
  }
  if (!Array.isArray(room.battle.actors) || room.battle.actors.length === 0) {
    room.battle.actors = battleRoomActors(room);
  }
  if (!room.battle.commands || typeof room.battle.commands !== "object" || Array.isArray(room.battle.commands)) {
    room.battle.commands = {};
  }
  room.battle.requiredAccountIds = requiredBattleCommandAccountIds(room);
  room.battle.submittedAccountIds = submittedBattleCommandAccountIds(room.battle);
  room.battle.phase = String(room.battle.phase || BATTLE_PHASE_COMMAND);
  room.battle.round = Math.max(1, Number(room.battle.round || 1));
  room.battle.turnSeq = Math.max(0, Number(room.battle.turnSeq || 0));
  return room.battle;
}

function battleRoomActors(room) {
  const participants = Array.isArray(room.participants) ? room.participants : [];
  return participants.map((participant, index) => {
    const side = String(participant.side || (index === 0 ? "challenger" : "opponent"));
    const hp = BATTLE_ACTOR_MAX_HP + Math.max(0, Number(participant.teamSnapshot && participant.teamSnapshot.playerLevel || 1) - 1) * 4;
    return {
      actorId: `duel_${side}_player`,
      accountId: String(participant.accountId || ""),
      username: String(participant.username || ""),
      displayName: String(participant.displayName || participant.username || ""),
      side,
      slotId: side === "challenger" ? "ally.back.3" : "enemy.back.3",
      hp,
      maxHp: hp,
      speed: side === "challenger" ? 70 : 68,
      guarding: false,
      defeated: false,
      schemaVersion: 1,
    };
  }).filter((actor) => actor.accountId !== "");
}

function requiredBattleCommandAccountIds(room) {
  return Array.isArray(room.participantAccountIds) ? room.participantAccountIds.slice() : [];
}

function submittedBattleCommandAccountIds(battle) {
  if (!battle || !battle.commands || typeof battle.commands !== "object" || Array.isArray(battle.commands)) {
    return [];
  }
  return Object.keys(battle.commands).filter((accountId) => battle.commands[accountId]).sort();
}

function normalizeBattleCommandPayload(payload, data, room, battle, account, now, randomId) {
  const actionId = normalizeBattleActionId(payload.actionId || payload.action || payload.command || BATTLE_ACTION_ATTACK);
  if (!actionId) {
    return fail("battle_command_action_invalid", "暂不支持这个战斗命令。");
  }
  const targetAccountId = battleCommandTargetAccountId(payload, data, room, account.accountId, actionId);
  if (!targetAccountId) {
    return fail("battle_command_target_missing", "战斗目标不存在。");
  }
  if (actionId === BATTLE_ACTION_ATTACK && targetAccountId === account.accountId) {
    return fail("battle_command_target_invalid", "攻击目标不能是自己。");
  }
  if (!requiredBattleCommandAccountIds(room).includes(targetAccountId)) {
    return fail("battle_command_target_invalid", "目标不在切磋房间中。");
  }
  return ok({
    command: {
      commandId: `battle_command_${randomId()}`,
      roomId: room.roomId,
      round: Number(battle.round || 1),
      accountId: account.accountId,
      username: account.username,
      actionId,
      targetAccountId,
      submittedAt: isoNow(now),
      schemaVersion: 1,
    },
  });
}

function normalizeBattleActionId(value) {
  const actionId = String(value || "").trim().toLowerCase();
  if (actionId === BATTLE_ACTION_ATTACK || actionId === "basic_attack") {
    return BATTLE_ACTION_ATTACK;
  }
  if (actionId === BATTLE_ACTION_DEFEND || actionId === "guard") {
    return BATTLE_ACTION_DEFEND;
  }
  return "";
}

function battleCommandTargetAccountId(payload, data, room, actorAccountId, actionId) {
  if (actionId === BATTLE_ACTION_DEFEND) {
    return actorAccountId;
  }
  const explicitAccountId = String(payload.targetAccountId || payload.targetAccount || "").trim();
  if (explicitAccountId) {
    return explicitAccountId;
  }
  const targetUsername = normalizeUsername(payload.targetUsername || payload.username || "");
  if (targetUsername) {
    const target = data.accounts[targetUsername];
    return target ? target.accountId : "";
  }
  return requiredBattleCommandAccountIds(room).find((accountId) => accountId !== actorAccountId) || "";
}

function resolveBattleRoomTurn(room, battle, now) {
  battle.turnSeq = Number(battle.turnSeq || 0) + 1;
  const round = Number(battle.round || 1);
  const orderedCommands = Object.values(battle.commands)
    .filter((command) => command && typeof command === "object")
    .sort((a, b) => battleCommandSortValue(battle, b) - battleCommandSortValue(battle, a));
  for (const actor of battle.actors) {
    actor.guarding = false;
  }
  for (const command of orderedCommands) {
    if (String(command.actionId || "") === BATTLE_ACTION_DEFEND) {
      const actor = battleActorByAccountId(battle, command.accountId);
      if (actor && Number(actor.hp || 0) > 0) {
        actor.guarding = true;
      }
    }
  }
  const events = [];
  let sequence = 1;
  for (const command of orderedCommands) {
    const actor = battleActorByAccountId(battle, command.accountId);
    if (!actor || Number(actor.hp || 0) <= 0) {
      continue;
    }
    if (String(command.actionId || "") === BATTLE_ACTION_DEFEND) {
      events.push(battleDefendEvent(room, battle, command, actor, round, sequence));
      sequence += 1;
      continue;
    }
    const target = battleActorByAccountId(battle, command.targetAccountId);
    if (!target || Number(target.hp || 0) <= 0) {
      events.push(battleTargetMissingEvent(room, battle, command, actor, round, sequence));
      sequence += 1;
      continue;
    }
    const damage = battleAttackDamage(room, battle, command, target);
    const hpBefore = Number(target.hp || 0);
    target.hp = Math.max(0, hpBefore - damage);
    target.defeated = target.hp <= 0;
    events.push(battleAttackEvent(room, battle, command, actor, target, round, sequence, hpBefore, target.hp, damage));
    sequence += 1;
  }
  const eventList = {
    schemaVersion: 1,
    kind: "battle_event_list",
    roomId: room.roomId,
    round,
    turnSeq: battle.turnSeq,
    phase: "resolved",
    events,
    actors: battle.actors.map(publicBattleActor),
    resolvedAt: isoNow(now),
  };
  battle.lastEventList = eventList;
  battle.eventLog = Array.isArray(battle.eventLog) ? battle.eventLog.concat([eventList]).slice(-20) : [eventList];
  battle.commands = {};
  battle.submittedAccountIds = [];
  battle.round = round + 1;
  battle.phase = BATTLE_PHASE_COMMAND;
  battle.updatedAt = eventList.resolvedAt;
  room.updatedAt = eventList.resolvedAt;
  return clone(eventList);
}

function battleCommandSortValue(battle, command) {
  const actor = battleActorByAccountId(battle, command.accountId);
  return actor ? Number(actor.speed || 0) : 0;
}

function battleActorByAccountId(battle, accountId) {
  return (Array.isArray(battle.actors) ? battle.actors : []).find((actor) => actor && actor.accountId === accountId) || null;
}

function battleDefendEvent(room, battle, command, actor, round, sequence) {
  return {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: "defend",
    round,
    sequence,
    actorAccountId: actor.accountId,
    actorUsername: actor.username,
    actorId: actor.actorId,
    actionId: BATTLE_ACTION_DEFEND,
    damage: 0,
    animation: {
      actor: "defend",
      targetReaction: "none",
      observer: "watch_target",
    },
    message: `${actor.displayName || actor.username} 摆出防御姿态。`,
    schemaVersion: 1,
  };
}

function battleTargetMissingEvent(room, battle, command, actor, round, sequence) {
  return {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: "target_missing",
    round,
    sequence,
    actorAccountId: actor.accountId,
    actorUsername: actor.username,
    actorId: actor.actorId,
    actionId: BATTLE_ACTION_ATTACK,
    targetAccountId: String(command.targetAccountId || ""),
    damage: 0,
    animation: {
      actor: "watch_target",
      targetReaction: "none",
      observer: "idle",
    },
    message: `${actor.displayName || actor.username} 没有找到目标。`,
    schemaVersion: 1,
  };
}

function battleAttackEvent(room, battle, command, actor, target, round, sequence, hpBefore, hpAfter, damage) {
  return {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: "basic_attack",
    round,
    sequence,
    actorAccountId: actor.accountId,
    actorUsername: actor.username,
    actorId: actor.actorId,
    targetAccountId: target.accountId,
    targetUsername: target.username,
    targetActorId: target.actorId,
    actionId: BATTLE_ACTION_ATTACK,
    damage,
    blocked: Boolean(target.guarding),
    hpBefore,
    hpAfter,
    defeated: hpAfter <= 0,
    animation: {
      actor: "attack",
      targetReaction: hpAfter <= 0 ? "knockdown" : "hurt",
      observer: "watch_target",
    },
    message: `${actor.displayName || actor.username} 攻击了 ${target.displayName || target.username}，造成 ${damage} 点伤害。`,
    schemaVersion: 1,
  };
}

function battleAttackDamage(room, battle, command, target) {
  const seed = `${room.seed || room.roomId}:${battle.turnSeq}:${battle.round}:${command.accountId}:${command.targetAccountId}`;
  const roll = Number.parseInt(crypto.createHash("sha256").update(seed).digest("hex").slice(0, 4), 16) % 7;
  const reduction = target.guarding ? BATTLE_DEFEND_REDUCTION : 0;
  return Math.max(1, BATTLE_BASE_ATTACK_DAMAGE + roll - reduction);
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

function normalizeServiceEvents(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((event) => event && typeof event === "object" && !Array.isArray(event))
    .map((event) => clone(event))
    .filter((event) => normalizeEventSeq(event.eventSeq) > 0 && String(event.type || "").trim() !== "")
    .sort((a, b) => normalizeEventSeq(a.eventSeq) - normalizeEventSeq(b.eventSeq))
    .slice(-MAX_SERVICE_EVENTS);
}

function nextServiceEventSeq(data) {
  return normalizeEventSeq(data.serviceEventSeq) + 1;
}

function normalizeEventSeq(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number));
}

function serviceEventVisibleToAccount(event, accountId) {
  const targetAccountIds = event && Array.isArray(event.targetAccountIds) ? event.targetAccountIds : null;
  if (!targetAccountIds) {
    return true;
  }
  return targetAccountIds.includes(accountId);
}

function serviceEventIsReplayable(event) {
  const type = String(event && event.type || "");
  return type === "chat.message" || type.startsWith("party.") || type.startsWith("battle.");
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

function normalizeMovementStepPayload(payload = {}, currentPosition = {}) {
  const fallbackCellX = Number(currentPosition.cellX || 0);
  const fallbackCellY = Number(currentPosition.cellY || 0);
  return {
    mapId: String(payload.mapId || payload.toMapId || currentPosition.mapId || "").trim().slice(0, POSITION_MAP_ID_MAX_LENGTH),
    fromCellX: clampInt(payload.fromCellX ?? payload.fromX, -9999, 9999, fallbackCellX),
    fromCellY: clampInt(payload.fromCellY ?? payload.fromY, -9999, 9999, fallbackCellY),
    toCellX: clampInt(payload.toCellX ?? payload.targetCellX ?? payload.cellX ?? payload.x, -9999, 9999, fallbackCellX),
    toCellY: clampInt(payload.toCellY ?? payload.targetCellY ?? payload.cellY ?? payload.y, -9999, 9999, fallbackCellY),
  };
}

function normalizeMovementFacing(facing, step) {
  const explicitFacing = String(facing || "").trim().toLowerCase();
  if (POSITION_FACING_VALUES.has(explicitFacing)) {
    return explicitFacing;
  }
  const dx = Math.sign(Number(step.toCellX || 0) - Number(step.fromCellX || 0));
  const dy = Math.sign(Number(step.toCellY || 0) - Number(step.fromCellY || 0));
  if (dx > 0 && dy < 0) {
    return "northeast";
  }
  if (dx > 0 && dy > 0) {
    return "southeast";
  }
  if (dx < 0 && dy > 0) {
    return "southwest";
  }
  if (dx < 0 && dy < 0) {
    return "northwest";
  }
  if (dx > 0) {
    return "east";
  }
  if (dx < 0) {
    return "west";
  }
  if (dy < 0) {
    return "north";
  }
  return "south";
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
