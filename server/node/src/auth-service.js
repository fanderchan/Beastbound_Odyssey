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
const ONLINE_PLAYERS_RESPONSE_LIMIT = 64;
const MOVEMENT_MAX_STEP_CELLS = 1;
const BATTLE_ROOM_ENTRY_MAX_DISTANCE = 4;
const BATTLE_MODE_DUEL = "duel";
const BATTLE_INVITE_PENDING = "pending";
const BATTLE_INVITE_ACCEPTED = "accepted";
const BATTLE_INVITE_DECLINED = "declined";
const BATTLE_INVITE_CANCELLED = "cancelled";
const BATTLE_INVITE_EXPIRED = "expired";
const BATTLE_ROOM_READY = "ready";
const BATTLE_ROOM_CLOSED = "closed";
const BATTLE_PHASE_COMMAND = "command";
const BATTLE_PHASE_FINISHED = "finished";
const BATTLE_ACTION_ATTACK = "attack";
const BATTLE_ACTION_DEFEND = "defend";
const BATTLE_ACTION_PET_ATTACK = "pet_attack";
const BATTLE_ACTION_PET_DEFEND = "pet_defend";
const BATTLE_ACTION_PET_BUI_CHARGE = "pet_bui_charge";
const BATTLE_ACTOR_MAX_HP = 120;
const BATTLE_BASE_ATTACK_DAMAGE = 18;
const BATTLE_DEFEND_REDUCTION = 8;
const BATTLE_INVITE_TTL_MS = 2 * 60 * 1000;
const BATTLE_COMMAND_TIMEOUT_MS = 90 * 1000;
const BATTLE_ACTOR_KIND_PLAYER = "player";
const BATTLE_ACTOR_KIND_PET = "pet";
const BATTLE_PET_MAX_PER_PARTICIPANT = 1;
const DEFAULT_RECORD_POINT = {
  mapId: "firebud_village_gate",
  spawnName: "doctor_record",
  label: "火芽村医旁记录点",
};
const DEFAULT_RECORD_POINT_CELL = [10, 17];
const DEFAULT_PLAYER_BATTLE_STATS = {
  maxHp: 120,
  attack: 18,
  defense: 6,
  quick: 70,
};
const DEFAULT_PET_BATTLE_STATS = {
  maxHp: 90,
  attack: 12,
  defense: 6,
  quick: 50,
};

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
    const players = publicOnlinePlayersForViewer(data, resolved.account, aoi, now);
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
    const currentPosition = data.playerPositions[resolved.account.accountId] || null;
    if (activeBattleRoomForAccount(data, resolved.account.accountId)) {
      return rejectMovementStep("movement_battle_locked", "切磋房间中不能移动。", currentPosition);
    }
    if (!currentPosition || !currentPosition.mapId) {
      return rejectMovementStep("movement_position_missing", "请先同步当前位置。", null);
    }
    const step = normalizeMovementStepPayload(payload, currentPosition);
    if (!step.mapId) {
      return rejectMovementStep("movement_map_missing", "移动缺少地图。", currentPosition);
    }
    if (step.mapId !== currentPosition.mapId) {
      return rejectMovementStep("movement_map_mismatch", "不能用单步移动切换地图。", currentPosition);
    }
    if (step.fromCellX !== Number(currentPosition.cellX || 0) || step.fromCellY !== Number(currentPosition.cellY || 0)) {
      return rejectMovementStep("movement_origin_mismatch", "服务器位置已变化，请重新同步。", currentPosition, {
        movement: {
          retryable: true,
          requiresSync: true,
        },
      });
    }
    const dx = Math.abs(step.toCellX - step.fromCellX);
    const dy = Math.abs(step.toCellY - step.fromCellY);
    if (dx === 0 && dy === 0) {
      return rejectMovementStep("movement_noop", "移动目标与当前位置相同。", currentPosition);
    }
    if (dx > MOVEMENT_MAX_STEP_CELLS || dy > MOVEMENT_MAX_STEP_CELLS) {
      return rejectMovementStep("movement_step_too_far", "移动距离过远，请重新同步。", currentPosition, {
        maxStepCells: MOVEMENT_MAX_STEP_CELLS,
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

  function rejectMovementStep(code, message, currentPosition = null, extra = {}) {
    const extraMovement = extra.movement && typeof extra.movement === "object" && !Array.isArray(extra.movement)
      ? extra.movement
      : {};
    const payload = {...extra};
    delete payload.movement;
    return fail(code, message, {
      ...payload,
      position: currentPosition ? publicPlayerPosition(currentPosition) : null,
      movement: {
        authority: "server_step",
        stepAccepted: false,
        reason: code,
        retryable: false,
        requiresSync: Boolean(currentPosition),
        maxStepCells: MOVEMENT_MAX_STEP_CELLS,
        ...extraMovement,
      },
    });
  }

  function publishPositionUpdate(data, account, position, previousPosition, payload = {}, extra = {}) {
    const aoi = normalizeOnlineAoiPayload({
      scope: ONLINE_AOI_SCOPE,
      radius: payload.aoiRadius ?? payload.viewRadius ?? payload.radius,
    }, position);
    const players = publicOnlinePlayersForViewer(data, account, aoi, now);
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
    let players = publicOnlinePlayersForViewer(data, resolved.account, aoi, now);
    if (currentVisible) {
      players = withPinnedPublicOnlinePlayer(players, data, event.accountId);
    }
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
      String(invite.kind || "invite") === "invite" &&
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
      kind: "invite",
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

  function applyToParty(token, payload = {}) {
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
      return fail("party_apply_self", "不能申请加入自己的队伍。");
    }
    if (partyForAccount(data, resolved.account.accountId)) {
      return fail("party_already_joined", "你已经在队伍中。");
    }
    const party = partyForAccount(data, target.accountId);
    if (!party) {
      return fail("party_target_no_party", "对方还没有队伍。");
    }
    if (party.memberAccountIds.length >= PARTY_MAX_MEMBERS) {
      return fail("party_full", "队伍人数已满。");
    }
    const leader = accountById(data, party.leaderAccountId);
    if (!leader) {
      return fail("party_missing", "队伍已经解散。");
    }
    const pendingApplication = Object.values(data.partyInvites).find((invite) => (
      invite &&
      invite.status === "pending" &&
      String(invite.kind || "invite") === "application" &&
      invite.partyId === party.partyId &&
      invite.fromAccountId === resolved.account.accountId &&
      invite.toAccountId === leader.accountId
    ));
    if (pendingApplication) {
      return ok({
        invite: publicPartyInvite(pendingApplication, data),
        party: publicParty(party, data),
        message: "入队申请已发送。",
      });
    }
    const invite = {
      inviteId: `invite_${randomId()}`,
      partyId: party.partyId,
      fromAccountId: resolved.account.accountId,
      toAccountId: leader.accountId,
      kind: "application",
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
      targetAccountIds: [resolved.account.accountId, leader.accountId],
      party: publicParty(party, data),
      invite: publicPartyInvite(invite, data),
    });
    return ok({
      invite: publicPartyInvite(invite, data),
      party: publicParty(party, data),
      message: "入队申请已发送。",
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
    const party = data.parties[invite.partyId];
    if (!party) {
      invite.status = "expired";
      invite.updatedAt = isoNow(now);
      data.partyInvites[invite.inviteId] = invite;
      save(data);
      return fail("party_missing", "队伍已经解散。");
    }
    const inviteKind = String(invite.kind || "invite");
    const joiningAccountId = inviteKind === "application" ? invite.fromAccountId : resolved.account.accountId;
    if (inviteKind === "application" && party.leaderAccountId !== resolved.account.accountId) {
      return fail("party_not_leader", "只有队长可以同意入队申请。");
    }
    if (partyForAccount(data, joiningAccountId)) {
      return fail("party_already_joined", "玩家已经在队伍中。");
    }
    if (party.memberAccountIds.length >= PARTY_MAX_MEMBERS) {
      return fail("party_full", "队伍人数已满。");
    }
    party.memberAccountIds.push(joiningAccountId);
    party.updatedAt = isoNow(now);
    invite.status = "accepted";
    invite.updatedAt = isoNow(now);
    data.parties[party.partyId] = party;
    data.partyInvites[invite.inviteId] = invite;
    save(data);
    emitServiceEvent({
      type: "party.update",
      targetAccountIds: Array.from(new Set(party.memberAccountIds.concat([invite.fromAccountId, invite.toAccountId]))),
      party: publicParty(party, data),
      invite: publicPartyInvite(invite, data),
    });
    return ok({
      party: publicParty(party, data),
      invite: publicPartyInvite(invite, data),
      message: inviteKind === "application" ? "已同意入队申请。" : "已加入队伍。",
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
      message: String(invite.kind || "invite") === "application" ? "已拒绝入队申请。" : "已拒绝邀请。",
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
    expireBattleTimeoutsAndEmit(data);
    return ok(battleStatePayload(data, resolved.account.accountId));
  }

  function expireBattleTimeoutsAndEmit(data) {
    const timeoutEvents = expireBattleTimeouts(data, now);
    if (timeoutEvents.length > 0) {
      save(data);
      for (const event of timeoutEvents) {
        emitServiceEvent(event);
      }
    }
    return timeoutEvents;
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
      expiresAt: new Date(now() + BATTLE_INVITE_TTL_MS).toISOString(),
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
    if (battleInviteIsExpired(invite, now)) {
      const event = expireBattleInvite(data, invite, now);
      save(data);
      emitServiceEvent(event);
      return fail("battle_invite_missing", "切磋邀请已过期。");
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

  function cancelBattleInvite(token, inviteId) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const invite = data.battleInvites[String(inviteId || "").trim()];
    if (!invite || invite.status !== BATTLE_INVITE_PENDING || invite.fromAccountId !== resolved.account.accountId) {
      return fail("battle_invite_missing", "切磋邀请不存在。");
    }
    invite.status = BATTLE_INVITE_CANCELLED;
    invite.updatedAt = isoNow(now);
    data.battleInvites[invite.inviteId] = invite;
    save(data);
    emitServiceEvent({
      type: "battle.invite_cancelled",
      targetAccountIds: [invite.fromAccountId, invite.toAccountId],
      invite: publicBattleInvite(invite, data),
      room: null,
    });
    return ok({
      invite: publicBattleInvite(invite, data),
      room: null,
      message: "切磋邀请已取消。",
    });
  }

  function leaveBattleRoom(token, roomId = "") {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    expireBattleTimeoutsAndEmit(data);
    const normalizedRoomId = String(roomId || "").trim();
    const room = normalizedRoomId !== "" ? data.battleRooms[normalizedRoomId] || null : activeBattleRoomForAccount(data, resolved.account.accountId);
    if (!room || room.status === BATTLE_ROOM_CLOSED) {
      return fail("battle_room_missing", "切磋房间不存在。");
    }
    if (!Array.isArray(room.participantAccountIds) || !room.participantAccountIds.includes(resolved.account.accountId)) {
      return fail("battle_room_forbidden", "你不在这个切磋房间中。");
    }
    const result = battleRoomResultForLeave(room, resolved.account.accountId, now);
    closeBattleRoomWithResult(data, room, result, now);
    data.battleRooms[room.roomId] = room;
    save(data);
    emitServiceEvent({
      type: "battle.room_closed",
      targetAccountIds: room.participantAccountIds.slice(),
      roomId: room.roomId,
      reason: result.reason,
      result: publicBattleResult(result),
      room: publicBattleRoom(room),
    });
    return ok({
      room: publicBattleRoom(room),
      result: publicBattleResult(result),
      message: "已离开切磋房间。",
    });
  }

  function submitBattleCommand(token, roomId, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    expireBattleTimeoutsAndEmit(data);
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
    const commandResult = normalizeBattleCommandPayload(payload, data, room, battle, resolved.account, now, randomId);
    if (!commandResult.ok) {
      return commandResult;
    }
    if (battle.commands && battle.commands[commandResult.command.actorId]) {
      return fail("battle_command_duplicate", "本回合命令已经提交。", {
        room: publicBattleRoom(room),
      });
    }
    battle.commands[commandResult.command.actorId] = commandResult.command;
    battle.submittedActorIds = submittedBattleCommandActorIds(battle);
    battle.submittedAccountIds = submittedBattleCommandAccountIds(battle);
    battle.updatedAt = isoNow(now);
    room.updatedAt = battle.updatedAt;
    const commandSubmittedActorIds = battle.submittedActorIds.slice();
    const commandSubmittedAccountIds = battle.submittedAccountIds.slice();
    const commandSubmittedRoom = publicBattleRoom(room);
    let turn = null;
    const readyToResolve = requiredBattleCommandActorIds(battle).every((actorId) => battle.commands[actorId]);
    if (readyToResolve) {
      turn = resolveBattleRoomTurn(data, room, battle, now);
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
      submittedActorId: commandResult.command.actorId,
      submittedActorKind: commandResult.command.actorKind,
      submittedActorIds: commandSubmittedActorIds,
      submittedAccountIds: commandSubmittedAccountIds,
      requiredAccountIds: requiredBattleCommandAccountIds(room),
      requiredActorIds: requiredBattleCommandActorIds(battle),
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
      if (room.status === BATTLE_ROOM_CLOSED && room.battle && room.battle.result) {
        emitServiceEvent({
          type: "battle.room_closed",
          targetAccountIds: room.participantAccountIds.slice(),
          roomId: room.roomId,
          reason: String(room.closeReason || room.battle.result.reason || "battle_result"),
          result: publicBattleResult(room.battle.result),
          room: publicBattleRoom(room),
        });
      }
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
    applyToParty,
    acceptPartyInvite,
    declinePartyInvite,
    leaveParty,
    listChatMessages,
    sendChatMessage,
    getBattleState,
    inviteToBattle,
    acceptBattleInvite,
    declineBattleInvite,
    cancelBattleInvite,
    leaveBattleRoom,
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
      kind: String(invite.kind || "invite"),
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
    expiresAt: invite.expiresAt || "",
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
    closeReason: String(room.closeReason || ""),
    closedByAccountId: String(room.closedByAccountId || ""),
    closedAt: room.closedAt || "",
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
    requiredActorIds: Array.isArray(battle.requiredActorIds) ? battle.requiredActorIds.slice() : [],
    submittedActorIds: Array.isArray(battle.submittedActorIds) ? battle.submittedActorIds.slice() : [],
    actors: Array.isArray(battle.actors) ? battle.actors.map(publicBattleActor) : [],
    lastEventList: battle.lastEventList && typeof battle.lastEventList === "object" ? clone(battle.lastEventList) : null,
    result: battle.result && typeof battle.result === "object" ? publicBattleResult(battle.result) : null,
    commandDeadlineAt: battle.commandDeadlineAt || "",
    updatedAt: battle.updatedAt || "",
    schemaVersion: 1,
  };
}

function publicBattleResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }
  return {
    kind: "battle_result",
    reason: String(result.reason || ""),
    winnerAccountId: String(result.winnerAccountId || ""),
    loserAccountIds: Array.isArray(result.loserAccountIds) ? result.loserAccountIds.map((value) => String(value)) : [],
    closedByAccountId: String(result.closedByAccountId || ""),
    endedAt: String(result.endedAt || ""),
    battleReturns: Array.isArray(result.battleReturns) ? result.battleReturns.map(publicBattleReturn) : [],
    schemaVersion: 1,
  };
}

function publicBattleReturn(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return {};
  }
  return {
    kind: "record_point_return",
    accountId: String(entry.accountId || ""),
    reason: String(entry.reason || ""),
    recordPoint: entry.recordPoint && typeof entry.recordPoint === "object" ? clone(entry.recordPoint) : null,
    position: entry.position && typeof entry.position === "object" ? publicPlayerPosition(entry.position) : null,
    updatedAt: String(entry.updatedAt || ""),
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
    kind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    slotId: String(actor.slotId || ""),
    slotNumber: Number(actor.slotNumber || 0),
    level: Number(actor.level || 1),
    petId: String(actor.petId || ""),
    formId: String(actor.formId || ""),
    hp: Number(actor.hp || 0),
    maxHp: Number(actor.maxHp || BATTLE_ACTOR_MAX_HP),
    speed: Number(actor.speed || 0),
    attack: Number(actor.attack || 0),
    defense: Number(actor.defense || 0),
    guarding: Boolean(actor.guarding),
    defeated: Boolean(actor.defeated),
    activeSkillIds: Array.isArray(actor.activeSkillIds) ? actor.activeSkillIds.map((value) => String(value)) : [],
    petSkillSlots: Array.isArray(actor.petSkillSlots) ? actor.petSkillSlots.map((value) => String(value)) : [],
    passiveSkillIds: Array.isArray(actor.passiveSkillIds) ? actor.passiveSkillIds.map((value) => String(value)) : [],
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
    actorId: String(command.actorId || ""),
    actorKind: String(command.actorKind || BATTLE_ACTOR_KIND_PLAYER),
    actionId: String(command.actionId || ""),
    skillId: String(command.skillId || ""),
    targetActorId: String(command.targetActorId || ""),
    targetAccountId: String(command.targetAccountId || ""),
    targetUsername: String(command.targetUsername || ""),
    submittedAt: String(command.submittedAt || ""),
    schemaVersion: 1,
  };
}

function battleParticipantSnapshot(data, account, side) {
  const summary = profileSummaryForAccount(account, data);
  const profileDoc = summary && summary.playerId ? data.profiles[summary.playerId] || null : null;
  const profile = profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" ? profileDoc.profile : {};
  const playerSnapshot = battlePlayerSnapshotFromProfile(profile, account);
  const battlePets = battlePetSnapshotsFromProfile(profile).slice(0, BATTLE_PET_MAX_PER_PARTICIPANT);
  const position = data.playerPositions[account.accountId] || null;
  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    side,
    profileSummary: summary || null,
    position: position ? publicPlayerPosition(position) : null,
    teamSnapshot: {
      playerLevel: Number(playerSnapshot.level || 1),
      player: playerSnapshot,
      battlePetCount: battlePets.length,
      battlePets,
      schemaVersion: 1,
    },
    schemaVersion: 1,
  };
}

function battlePlayerSnapshotFromProfile(profile, account) {
  const player = profile && profile.player && typeof profile.player === "object" ? profile.player : {};
  const baseStats = player.baseStats && typeof player.baseStats === "object" ? player.baseStats : {};
  const maxHp = positiveNumber(player.maxHp, positiveNumber(baseStats.maxHp, DEFAULT_PLAYER_BATTLE_STATS.maxHp));
  return {
    kind: BATTLE_ACTOR_KIND_PLAYER,
    name: String(player.name || account.displayName || account.username || "猎人"),
    level: positiveNumber(player.level, 1),
    hp: clampNumber(player.hp, 1, maxHp, maxHp),
    maxHp,
    attack: positiveNumber(baseStats.attack, DEFAULT_PLAYER_BATTLE_STATS.attack),
    defense: positiveNumber(baseStats.defense, DEFAULT_PLAYER_BATTLE_STATS.defense),
    quick: positiveNumber(baseStats.quick, DEFAULT_PLAYER_BATTLE_STATS.quick),
    schemaVersion: 1,
  };
}

function battlePetSnapshotsFromProfile(profile) {
  const petInstances = Array.isArray(profile.petInstances) ? profile.petInstances : (Array.isArray(profile.pets) ? profile.pets : []);
  const activePetInstanceId = String(profile.activePetInstanceId || "").trim();
  const battlePets = petInstances
    .filter((pet) => pet && typeof pet === "object" && !Array.isArray(pet))
    .filter((pet) => petBattleStateIsActive(pet))
    .sort((a, b) => {
      const aActive = String(a.instanceId || a.petId || a.id || "") === activePetInstanceId ? 0 : 1;
      const bActive = String(b.instanceId || b.petId || b.id || "") === activePetInstanceId ? 0 : 1;
      return aActive - bActive;
    })
    .map(battlePetSnapshotFromProfilePet)
    .filter((pet) => pet.petId !== "" && pet.hp > 0);
  return battlePets;
}

function battlePetSnapshotFromProfilePet(pet) {
  const maxHp = positiveNumber(pet.maxHp, DEFAULT_PET_BATTLE_STATS.maxHp);
  const petId = String(pet.instanceId || pet.petId || pet.id || "").trim();
  return {
    kind: BATTLE_ACTOR_KIND_PET,
    petId,
    name: String(pet.name || pet.displayName || pet.speciesName || "宠物"),
    formId: String(pet.formId || pet.templateId || pet.speciesId || ""),
    speciesId: String(pet.speciesId || pet.templateId || pet.formId || ""),
    level: positiveNumber(pet.level, 1),
    hp: clampNumber(pet.hp, 1, maxHp, maxHp),
    maxHp,
    attack: positiveNumber(pet.attack, DEFAULT_PET_BATTLE_STATS.attack),
    defense: positiveNumber(pet.defense, DEFAULT_PET_BATTLE_STATS.defense),
    quick: positiveNumber(pet.quick, DEFAULT_PET_BATTLE_STATS.quick),
    activeSkillIds: stringArray(pet.activeSkillIds),
    petSkillSlots: stringArray(pet.petSkillSlots),
    passiveSkillIds: stringArray(pet.passiveSkillIds),
    schemaVersion: 1,
  };
}

function petBattleStateIsActive(pet) {
  const state = String(pet.state || pet.status || pet.battleState || "").trim();
  return state === "battle";
}

function stringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Number(fallback || 1);
  }
  return parsed;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Math.max(min, Math.min(max, Number(fallback || max)));
  }
  return Math.max(min, Math.min(max, parsed));
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
    requiredActorIds: requiredBattleCommandActorIdsFromActors(actors),
    submittedActorIds: [],
    commands: {},
    actors,
    lastEventList: null,
    eventLog: [],
    result: null,
    commandDeadlineAt: new Date(now() + BATTLE_COMMAND_TIMEOUT_MS).toISOString(),
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
  room.battle.requiredActorIds = requiredBattleCommandActorIds(room.battle);
  room.battle.submittedActorIds = submittedBattleCommandActorIds(room.battle);
  room.battle.submittedAccountIds = submittedBattleCommandAccountIds(room.battle);
  room.battle.phase = String(room.battle.phase || BATTLE_PHASE_COMMAND);
  room.battle.round = Math.max(1, Number(room.battle.round || 1));
  room.battle.turnSeq = Math.max(0, Number(room.battle.turnSeq || 0));
  if (!room.battle.commandDeadlineAt) {
    room.battle.commandDeadlineAt = new Date(now() + BATTLE_COMMAND_TIMEOUT_MS).toISOString();
  }
  return room.battle;
}

function battleRoomActors(room) {
  const participants = Array.isArray(room.participants) ? room.participants : [];
  const actors = [];
  participants.forEach((participant, index) => {
    const side = String(participant.side || (index === 0 ? "challenger" : "opponent"));
    const playerActor = battlePlayerActorFromParticipant(participant, side);
    if (playerActor.accountId !== "") {
      actors.push(playerActor);
    }
    const battlePets = participant.teamSnapshot && Array.isArray(participant.teamSnapshot.battlePets)
      ? participant.teamSnapshot.battlePets
      : [];
    battlePets.slice(0, BATTLE_PET_MAX_PER_PARTICIPANT).forEach((pet, petIndex) => {
      const petActor = battlePetActorFromParticipant(participant, side, pet, petIndex);
      if (petActor.accountId !== "" && petActor.petId !== "") {
        actors.push(petActor);
      }
    });
  });
  return actors;
}

function battlePlayerActorFromParticipant(participant, side) {
  const player = participant.teamSnapshot && participant.teamSnapshot.player && typeof participant.teamSnapshot.player === "object"
    ? participant.teamSnapshot.player
    : {};
  const level = positiveNumber(player.level || (participant.teamSnapshot && participant.teamSnapshot.playerLevel), 1);
  const maxHp = positiveNumber(player.maxHp, BATTLE_ACTOR_MAX_HP + Math.max(0, level - 1) * 4);
  const hp = clampNumber(player.hp, 1, maxHp, maxHp);
  return {
    actorId: `duel_${side}_player`,
    accountId: String(participant.accountId || ""),
    username: String(participant.username || ""),
    displayName: String(player.name || participant.displayName || participant.username || ""),
    side,
    kind: BATTLE_ACTOR_KIND_PLAYER,
    slotId: `${side}.back.3`,
    slotNumber: 3,
    level,
    hp,
    maxHp,
    speed: positiveNumber(player.quick, side === "challenger" ? 70 : 68),
    attack: positiveNumber(player.attack, DEFAULT_PLAYER_BATTLE_STATS.attack),
    defense: positiveNumber(player.defense, DEFAULT_PLAYER_BATTLE_STATS.defense),
    guarding: false,
    defeated: hp <= 0,
    schemaVersion: 1,
  };
}

function battlePetActorFromParticipant(participant, side, pet, petIndex) {
  const slotNumber = petIndex + 3;
  const maxHp = positiveNumber(pet.maxHp, DEFAULT_PET_BATTLE_STATS.maxHp);
  const hp = clampNumber(pet.hp, 1, maxHp, maxHp);
  const petId = String(pet.petId || pet.instanceId || pet.id || "").trim();
  return {
    actorId: `duel_${side}_pet_${petId || petIndex + 1}`,
    accountId: String(participant.accountId || ""),
    username: String(participant.username || ""),
    displayName: String(pet.name || "宠物"),
    side,
    kind: BATTLE_ACTOR_KIND_PET,
    petId,
    formId: String(pet.formId || pet.speciesId || ""),
    slotId: `${side}.front.${slotNumber}`,
    slotNumber,
    level: positiveNumber(pet.level, 1),
    hp,
    maxHp,
    speed: positiveNumber(pet.quick, DEFAULT_PET_BATTLE_STATS.quick),
    attack: positiveNumber(pet.attack, DEFAULT_PET_BATTLE_STATS.attack),
    defense: positiveNumber(pet.defense, DEFAULT_PET_BATTLE_STATS.defense),
    guarding: false,
    defeated: hp <= 0,
    activeSkillIds: stringArray(pet.activeSkillIds),
    petSkillSlots: stringArray(pet.petSkillSlots),
    passiveSkillIds: stringArray(pet.passiveSkillIds),
    schemaVersion: 1,
  };
}

function requiredBattleCommandAccountIds(room) {
  return Array.isArray(room.participantAccountIds) ? room.participantAccountIds.slice() : [];
}

function requiredBattleCommandActorIds(battle) {
  return requiredBattleCommandActorIdsFromActors(Array.isArray(battle.actors) ? battle.actors : []);
}

function requiredBattleCommandActorIdsFromActors(actors) {
  return actors
    .filter((actor) => actor && Number(actor.hp || 0) > 0 && String(actor.accountId || "") !== "")
    .map((actor) => String(actor.actorId || ""))
    .filter(Boolean)
    .sort();
}

function battleCommandValues(battle) {
  if (!battle || !battle.commands || typeof battle.commands !== "object" || Array.isArray(battle.commands)) {
    return [];
  }
  return Object.values(battle.commands).filter((command) => command && typeof command === "object");
}

function submittedBattleCommandActorIds(battle) {
  return battleCommandValues(battle)
    .map((command) => String(command.actorId || ""))
    .filter(Boolean)
    .sort();
}

function submittedBattleCommandAccountIds(battle) {
  const accountIds = new Set();
  for (const command of battleCommandValues(battle)) {
    const accountId = String(command.accountId || "");
    if (accountId) {
      accountIds.add(accountId);
    }
  }
  return Array.from(accountIds).sort();
}

function normalizeBattleCommandPayload(payload, data, room, battle, account, now, randomId) {
  const actor = battleCommandActorForPayload(payload, battle, account);
  if (!actor || Number(actor.hp || 0) <= 0) {
    return fail("battle_command_actor_missing", "当前无法提交战斗命令。");
  }
  if (!requiredBattleCommandActorIds(battle).includes(String(actor.actorId || ""))) {
    return fail("battle_command_actor_missing", "当前无法提交战斗命令。");
  }
  const action = normalizeBattleActionForActor(payload.actionId || payload.action || payload.command || BATTLE_ACTION_ATTACK, actor);
  if (!action.ok) {
    return action;
  }
  const targetActor = battleCommandTargetActor(payload, data, room, battle, actor, action.actionId);
  if (!targetActor) {
    return fail("battle_command_target_missing", "战斗目标不存在。");
  }
  if (battleActionRequiresEnemyTarget(action.actionKind)) {
    if (targetActor.actorId === actor.actorId) {
      return fail("battle_command_target_invalid", "攻击目标不能是自己。");
    }
    if (String(targetActor.side || "") === String(actor.side || "")) {
      return fail("battle_command_target_invalid", "攻击目标必须是对方。");
    }
  }
  if (!requiredBattleCommandAccountIds(room).includes(targetActor.accountId)) {
    return fail("battle_command_target_invalid", "目标不在切磋房间中。");
  }
  return ok({
    command: {
      commandId: `battle_command_${randomId()}`,
      roomId: room.roomId,
      round: Number(battle.round || 1),
      accountId: account.accountId,
      username: account.username,
      actorId: actor.actorId,
      actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
      actionId: action.actionId,
      actionKind: action.actionKind,
      skillId: action.skillId || "",
      targetActorId: targetActor.actorId,
      targetAccountId: targetActor.accountId,
      targetUsername: targetActor.username,
      submittedAt: isoNow(now),
      schemaVersion: 1,
    },
  });
}

function battleCommandActorForPayload(payload, battle, account) {
  const explicitActorId = String(payload.actorId || payload.sourceActorId || "").trim();
  if (explicitActorId) {
    const actor = battleActorByActorId(battle, explicitActorId);
    return actor && String(actor.accountId || "") === account.accountId ? actor : null;
  }
  return battlePlayerActorByAccountId(battle, account.accountId);
}

function normalizeBattleActionForActor(value, actor) {
  const actionId = String(value || "").trim().toLowerCase();
  const actorKind = String(actor.kind || BATTLE_ACTOR_KIND_PLAYER);
  if (actorKind === BATTLE_ACTOR_KIND_PET) {
    if (actionId === BATTLE_ACTION_ATTACK || actionId === "basic_attack" || actionId === BATTLE_ACTION_PET_ATTACK) {
      return ok({actionId: BATTLE_ACTION_PET_ATTACK, actionKind: "attack", skillId: BATTLE_ACTION_PET_ATTACK});
    }
    if (actionId === BATTLE_ACTION_DEFEND || actionId === "guard" || actionId === BATTLE_ACTION_PET_DEFEND) {
      return ok({actionId: BATTLE_ACTION_PET_DEFEND, actionKind: "defend", skillId: BATTLE_ACTION_PET_DEFEND});
    }
    const activeSkillIds = Array.isArray(actor.activeSkillIds) ? actor.activeSkillIds.map((item) => String(item || "").trim()) : [];
    if (activeSkillIds.includes(actionId)) {
      return ok({actionId, actionKind: "pet_skill", skillId: actionId});
    }
    return fail("battle_command_action_invalid", "宠物没有这个技能。");
  }
  if (actionId === BATTLE_ACTION_ATTACK || actionId === "basic_attack") {
    return ok({actionId: BATTLE_ACTION_ATTACK, actionKind: "attack", skillId: ""});
  }
  if (actionId === BATTLE_ACTION_DEFEND || actionId === "guard") {
    return ok({actionId: BATTLE_ACTION_DEFEND, actionKind: "defend", skillId: ""});
  }
  return fail("battle_command_action_invalid", "暂不支持这个战斗命令。");
}

function battleActionRequiresEnemyTarget(actionKind) {
  return actionKind === "attack" || actionKind === "pet_skill";
}

function battleCommandTargetActor(payload, data, room, battle, actor, actionId) {
  if (actionId === BATTLE_ACTION_DEFEND) {
    return actor;
  }
  const explicitActorId = String(payload.targetActorId || "").trim();
  if (explicitActorId) {
    return battleActorByActorId(battle, explicitActorId);
  }
  const explicitAccountId = String(payload.targetAccountId || payload.targetAccount || "").trim();
  if (explicitAccountId) {
    return battlePlayerActorByAccountId(battle, explicitAccountId);
  }
  const targetUsername = normalizeUsername(payload.targetUsername || payload.username || "");
  if (targetUsername) {
    const target = data.accounts[targetUsername];
    return target ? battlePlayerActorByAccountId(battle, target.accountId) : null;
  }
  const targetAccountId = requiredBattleCommandAccountIds(room).find((accountId) => accountId !== actor.accountId) || "";
  return targetAccountId ? battlePlayerActorByAccountId(battle, targetAccountId) : null;
}

function resolveBattleRoomTurn(data, room, battle, now) {
  battle.turnSeq = Number(battle.turnSeq || 0) + 1;
  const round = Number(battle.round || 1);
  const orderedCommands = Object.values(battle.commands)
    .filter((command) => command && typeof command === "object")
    .sort((a, b) => battleCommandSortValue(battle, b) - battleCommandSortValue(battle, a));
  for (const actor of battle.actors) {
    actor.guarding = false;
  }
  for (const command of orderedCommands) {
    if (String(command.actionKind || command.actionId || "") === "defend" || String(command.actionId || "") === BATTLE_ACTION_DEFEND || String(command.actionId || "") === BATTLE_ACTION_PET_DEFEND) {
      const actor = battleActorByActorId(battle, command.actorId);
      if (actor && Number(actor.hp || 0) > 0) {
        actor.guarding = true;
      }
    }
  }
  const events = [];
  let sequence = 1;
  for (const command of orderedCommands) {
    const actor = battleActorByActorId(battle, command.actorId);
    if (!actor || Number(actor.hp || 0) <= 0) {
      continue;
    }
    if (String(command.actionKind || command.actionId || "") === "defend" || String(command.actionId || "") === BATTLE_ACTION_DEFEND || String(command.actionId || "") === BATTLE_ACTION_PET_DEFEND) {
      events.push(battleDefendEvent(room, battle, command, actor, round, sequence));
      sequence += 1;
      continue;
    }
    const target = battleActorByActorId(battle, command.targetActorId) || battlePlayerActorByAccountId(battle, command.targetAccountId);
    if (!target || Number(target.hp || 0) <= 0) {
      events.push(battleTargetMissingEvent(room, battle, command, actor, round, sequence));
      sequence += 1;
      continue;
    }
    const damage = battleAttackDamage(room, battle, command, actor, target);
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
  const result = battleResultForResolvedActors(room, battle, now);
  if (result) {
    eventList.result = publicBattleResult(result);
  }
  battle.lastEventList = eventList;
  battle.eventLog = Array.isArray(battle.eventLog) ? battle.eventLog.concat([eventList]).slice(-20) : [eventList];
  battle.commands = {};
  battle.submittedActorIds = [];
  battle.submittedAccountIds = [];
  battle.requiredActorIds = requiredBattleCommandActorIds(battle);
  battle.round = round + 1;
  battle.phase = BATTLE_PHASE_COMMAND;
  battle.commandDeadlineAt = new Date(now() + BATTLE_COMMAND_TIMEOUT_MS).toISOString();
  battle.updatedAt = eventList.resolvedAt;
  room.updatedAt = eventList.resolvedAt;
  if (result) {
    closeBattleRoomWithResult(data, room, result, now);
    eventList.actors = battle.actors.map(publicBattleActor);
    eventList.result = publicBattleResult(battle.result);
  }
  return clone(eventList);
}

function battleCommandSortValue(battle, command) {
  const actor = battleActorByActorId(battle, command.actorId);
  return actor ? Number(actor.speed || 0) : 0;
}

function battlePlayerActorByAccountId(battle, accountId) {
  return (Array.isArray(battle.actors) ? battle.actors : []).find((actor) => (
    actor &&
    actor.accountId === accountId &&
    String(actor.kind || BATTLE_ACTOR_KIND_PLAYER) === BATTLE_ACTOR_KIND_PLAYER
  )) || null;
}

function battleActorByActorId(battle, actorId) {
  const normalizedActorId = String(actorId || "").trim();
  if (!normalizedActorId) {
    return null;
  }
  return (Array.isArray(battle.actors) ? battle.actors : []).find((actor) => actor && String(actor.actorId || "") === normalizedActorId) || null;
}

function battleResultForResolvedActors(room, battle, now) {
  const actors = Array.isArray(battle.actors) ? battle.actors : [];
  const livingSides = new Set(actors
    .filter((actor) => actor && Number(actor.hp || 0) > 0)
    .map((actor) => String(actor.side || ""))
    .filter(Boolean));
  if (livingSides.size > 1) {
    return null;
  }
  const winnerSide = livingSides.size === 1 ? Array.from(livingSides)[0] : "";
  const winner = actors.find((actor) => actor && String(actor.side || "") === winnerSide && Number(actor.hp || 0) > 0) || null;
  const winnerAccountId = winner ? String(winner.accountId || "") : "";
  const loserAccountIds = requiredBattleCommandAccountIds(room).filter((accountId) => accountId !== winnerAccountId);
  return {
    reason: "defeat",
    winnerAccountId,
    loserAccountIds,
    closedByAccountId: "",
    endedAt: isoNow(now),
    schemaVersion: 1,
  };
}

function battleRoomResultForLeave(room, leavingAccountId, now) {
  const winnerAccountId = requiredBattleCommandAccountIds(room).find((accountId) => accountId !== leavingAccountId) || "";
  return {
    reason: "leave",
    winnerAccountId,
    loserAccountIds: leavingAccountId ? [leavingAccountId] : [],
    closedByAccountId: leavingAccountId,
    endedAt: isoNow(now),
    schemaVersion: 1,
  };
}

function battleRoomResultForTimeout(room, battle, now) {
  const submittedActorIds = submittedBattleCommandActorIds(battle);
  const missingActorIds = requiredBattleCommandActorIds(battle).filter((actorId) => !submittedActorIds.includes(actorId));
  const missingAccountIds = Array.from(new Set(missingActorIds
    .map((actorId) => battleActorByActorId(battle, actorId))
    .filter(Boolean)
    .map((actor) => String(actor.accountId || ""))
    .filter(Boolean)));
  const submittedAccountIds = submittedBattleCommandAccountIds(battle);
  const participantAccountIds = requiredBattleCommandAccountIds(room);
  const winnerAccountId = submittedAccountIds.length === 1 && missingAccountIds.length > 0 ? submittedAccountIds[0] : "";
  return {
    reason: "timeout",
    winnerAccountId,
    loserAccountIds: missingAccountIds.length > 0 ? missingAccountIds : participantAccountIds.filter((accountId) => accountId !== winnerAccountId),
    closedByAccountId: missingAccountIds[0] || "",
    endedAt: isoNow(now),
    schemaVersion: 1,
  };
}

function closeBattleRoomWithResult(data, room, result, now) {
  const battle = battleRoomBattleStateForMutation(room, now);
  room.status = BATTLE_ROOM_CLOSED;
  room.closeReason = String(result.reason || "closed");
  room.closedByAccountId = String(result.closedByAccountId || "");
  room.closedAt = String(result.endedAt || isoNow(now));
  room.updatedAt = room.closedAt;
  battle.phase = BATTLE_PHASE_FINISHED;
  battle.result = {...result, kind: "battle_result"};
  battle.commands = {};
  battle.submittedActorIds = [];
  battle.submittedAccountIds = [];
  battle.commandDeadlineAt = "";
  battle.updatedAt = room.closedAt;
  battle.profileWriteback = applyBattleRoomProfileWriteback(data, room, battle, battle.result, now);
  battle.result.battleReturns = applyBattleRoomResultReturns(data, room, battle.result, now);
  return room;
}

function applyBattleRoomProfileWriteback(data, room, battle, result, now) {
  const updatedAt = String(result && result.endedAt || room.closedAt || isoNow(now));
  const writeback = {
    kind: "battle_profile_writeback",
    roomId: String(room.roomId || ""),
    reason: String(result && result.reason || room.closeReason || ""),
    updatedAt,
    profiles: [],
    skippedProfiles: [],
    schemaVersion: 1,
  };
  if (!data || !battle || !Array.isArray(battle.actors)) {
    return writeback;
  }
  for (const accountId of requiredBattleCommandAccountIds(room)) {
    const binding = data.profileBindings[String(accountId || "")] || null;
    if (!binding || !binding.playerId) {
      writeback.skippedProfiles.push({accountId, reason: "profile_binding_missing"});
      continue;
    }
    const profileDoc = data.profiles[binding.playerId] || null;
    const profile = profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" && !Array.isArray(profileDoc.profile)
      ? clone(profileDoc.profile)
      : null;
    if (!profile) {
      writeback.skippedProfiles.push({accountId, playerId: binding.playerId, reason: "profile_document_missing"});
      continue;
    }
    const accountActors = battle.actors.filter((actor) => actor && String(actor.accountId || "") === String(accountId || ""));
    const summary = {
      accountId: String(accountId || ""),
      playerId: String(binding.playerId || ""),
      profileRevision: Number(binding.profileRevision || profileDoc.profileRevision || 0),
      playerHp: null,
      petHps: [],
      schemaVersion: 1,
    };
    let changed = false;
    const playerActor = accountActors.find((actor) => String(actor.kind || BATTLE_ACTOR_KIND_PLAYER) === BATTLE_ACTOR_KIND_PLAYER) || null;
    if (playerActor) {
      const applied = applyBattleActorHpToProfilePlayer(profile, playerActor);
      changed = changed || applied.changed;
      summary.playerHp = applied.publicHp;
    }
    const petActors = accountActors.filter((actor) => String(actor.kind || "") === BATTLE_ACTOR_KIND_PET);
    for (const petActor of petActors) {
      const applied = applyBattleActorHpToProfilePet(profile, petActor);
      if (!applied.found) {
        writeback.skippedProfiles.push({
          accountId: String(accountId || ""),
          playerId: String(binding.playerId || ""),
          petId: String(petActor.petId || ""),
          reason: "pet_instance_missing",
        });
        continue;
      }
      changed = changed || applied.changed;
      summary.petHps.push(applied.publicHp);
    }
    if (!changed) {
      continue;
    }
    const nextRevision = Number(binding.profileRevision || profileDoc.profileRevision || 0) + 1;
    binding.profileRevision = nextRevision;
    binding.updatedAt = updatedAt;
    data.profileBindings[String(accountId || "")] = binding;
    data.profiles[binding.playerId] = {
      ...profileDoc,
      playerId: binding.playerId,
      accountId: String(accountId || ""),
      profileRevision: nextRevision,
      profile,
      updatedAt,
      schemaVersion: 1,
    };
    summary.profileRevision = nextRevision;
    writeback.profiles.push(summary);
  }
  return writeback;
}

function applyBattleActorHpToProfilePlayer(profile, actor) {
  if (!profile.player || typeof profile.player !== "object" || Array.isArray(profile.player)) {
    profile.player = {};
  }
  const hp = battleActorWritebackHp(actor);
  const maxHp = battleActorWritebackMaxHp(actor);
  const previousHp = Number(profile.player.hp);
  const changed = !Number.isFinite(previousHp) || previousHp !== hp;
  if (changed) {
    profile.player.hp = hp;
  }
  return {
    changed,
    publicHp: {
      actorId: String(actor.actorId || ""),
      hp,
      maxHp,
      schemaVersion: 1,
    },
  };
}

function applyBattleActorHpToProfilePet(profile, actor) {
  const petCollections = [];
  if (Array.isArray(profile.petInstances)) {
    petCollections.push(profile.petInstances);
  }
  if (Array.isArray(profile.pets) && profile.pets !== profile.petInstances) {
    petCollections.push(profile.pets);
  }
  const actorPetId = String(actor.petId || "").trim();
  let pet = null;
  for (const collection of petCollections) {
    pet = collection.find((item) => profilePetIdentityValues(item).includes(actorPetId)) || null;
    if (pet) {
      break;
    }
  }
  if (!pet) {
    return {found: false, changed: false, publicHp: null};
  }
  const hp = battleActorWritebackHp(actor);
  const maxHp = battleActorWritebackMaxHp(actor);
  const previousHp = Number(pet.hp);
  const changed = !Number.isFinite(previousHp) || previousHp !== hp;
  if (changed) {
    pet.hp = hp;
  }
  return {
    found: true,
    changed,
    publicHp: {
      actorId: String(actor.actorId || ""),
      petId: actorPetId,
      hp,
      maxHp,
      schemaVersion: 1,
    },
  };
}

function profilePetIdentityValues(pet) {
  if (!pet || typeof pet !== "object" || Array.isArray(pet)) {
    return [];
  }
  return [pet.instanceId, pet.petId, pet.id]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function battleActorWritebackMaxHp(actor) {
  const maxHp = Number(actor && actor.maxHp);
  return Number.isFinite(maxHp) && maxHp > 0 ? maxHp : 1;
}

function battleActorWritebackHp(actor) {
  const maxHp = battleActorWritebackMaxHp(actor);
  const hp = Number(actor && actor.hp);
  if (!Number.isFinite(hp)) {
    return maxHp;
  }
  return Math.max(0, Math.min(maxHp, hp));
}

function applyBattleRoomResultReturns(data, room, result, now) {
  const returnAccountIds = battleReturnAccountIdsForResult(room, result);
  const entries = [];
  for (const accountId of returnAccountIds) {
    const account = accountById(data, accountId);
    if (!account) {
      continue;
    }
    const recordPoint = recordPointForAccount(data, accountId);
    const spawnCell = spawnCellForRecordPoint(recordPoint);
    const previousPosition = data.playerPositions[accountId] || null;
    const position = normalizePlayerPositionPayload({
      mapId: recordPoint.mapId,
      cellX: spawnCell[0],
      cellY: spawnCell[1],
      facing: "south",
      moving: false,
    }, account, now);
    position.authority = "battle_result_return";
    position.movementSeq = Number(previousPosition && previousPosition.movementSeq || 0) + 1;
    position.returnReason = String(result.reason || room.closeReason || "");
    data.playerPositions[accountId] = position;
    entries.push({
      kind: "record_point_return",
      accountId,
      reason: position.returnReason,
      recordPoint,
      position,
      updatedAt: position.updatedAt,
      schemaVersion: 1,
    });
  }
  return entries;
}

function battleReturnAccountIdsForResult(room, result) {
  const reason = String(result && result.reason || room && room.closeReason || "");
  if (reason !== "defeat" && reason !== "timeout") {
    return [];
  }
  const loserIds = Array.isArray(result && result.loserAccountIds) ? result.loserAccountIds : [];
  return loserIds
    .map((value) => String(value || "").trim())
    .filter((value, index, array) => value !== "" && array.indexOf(value) === index);
}

function recordPointForAccount(data, accountId) {
  const binding = data.profileBindings[String(accountId || "")] || null;
  const profileDoc = binding && binding.playerId ? data.profiles[binding.playerId] || null : null;
  const profile = profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" && !Array.isArray(profileDoc.profile)
    ? profileDoc.profile
    : {};
  return normalizeRecordPoint(profile.recordPoint);
}

function normalizeRecordPoint(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const mapId = String(source.mapId || DEFAULT_RECORD_POINT.mapId).trim() || DEFAULT_RECORD_POINT.mapId;
  const spawnName = String(source.spawnName || DEFAULT_RECORD_POINT.spawnName).trim() || DEFAULT_RECORD_POINT.spawnName;
  const label = String(source.label || DEFAULT_RECORD_POINT.label).trim() || DEFAULT_RECORD_POINT.label;
  return {
    mapId,
    spawnName,
    label,
    schemaVersion: 1,
  };
}

function spawnCellForRecordPoint(recordPoint) {
  return spawnCellForMapSpawn(recordPoint.mapId, recordPoint.spawnName);
}

function spawnCellForMapSpawn(mapId, spawnName) {
  const mapDoc = mapDocumentById(mapId);
  const spawnPoints = mapDoc && mapDoc.spawnPoints && typeof mapDoc.spawnPoints === "object" && !Array.isArray(mapDoc.spawnPoints)
    ? mapDoc.spawnPoints
    : {};
  const explicit = spawnPoints[String(spawnName || "")];
  if (Array.isArray(explicit) && explicit.length >= 2) {
    return [clampInt(explicit[0], -9999, 9999, DEFAULT_RECORD_POINT_CELL[0]), clampInt(explicit[1], -9999, 9999, DEFAULT_RECORD_POINT_CELL[1])];
  }
  const fallback = Array.isArray(mapDoc && mapDoc.spawnCell) ? mapDoc.spawnCell : DEFAULT_RECORD_POINT_CELL;
  return [clampInt(fallback[0], -9999, 9999, DEFAULT_RECORD_POINT_CELL[0]), clampInt(fallback[1], -9999, 9999, DEFAULT_RECORD_POINT_CELL[1])];
}

let mapDocumentCache = null;

function mapDocumentById(mapId) {
  const normalizedMapId = String(mapId || "").trim();
  if (!normalizedMapId) {
    return null;
  }
  if (!mapDocumentCache) {
    mapDocumentCache = loadMapDocumentCache();
  }
  return mapDocumentCache[normalizedMapId] || null;
}

function loadMapDocumentCache() {
  const cache = {};
  const dataDir = path.resolve(__dirname, "../../..", "client/godot/data");
  try {
    for (const fileName of fs.readdirSync(dataDir)) {
      if (!fileName.endsWith("_map.json")) {
        continue;
      }
      const filePath = path.join(dataDir, fileName);
      const doc = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const mapId = String(doc && doc.id || "").trim();
      if (mapId) {
        cache[mapId] = doc;
      }
    }
  } catch {
    // Map data is a convenience for battle return cells; default record point remains usable without it.
  }
  return cache;
}

function battleInviteIsExpired(invite, now) {
  if (!invite || invite.status !== BATTLE_INVITE_PENDING) {
    return false;
  }
  const createdMs = Number.isFinite(Date.parse(invite.createdAt || "")) ? Date.parse(invite.createdAt || "") : now();
  const expiresAt = invite.expiresAt || new Date(createdMs + BATTLE_INVITE_TTL_MS).toISOString();
  return Date.parse(expiresAt) <= now();
}

function expireBattleInvite(data, invite, now) {
  invite.status = BATTLE_INVITE_EXPIRED;
  invite.updatedAt = isoNow(now);
  data.battleInvites[invite.inviteId] = invite;
  return {
    type: "battle.invite_expired",
    targetAccountIds: [invite.fromAccountId, invite.toAccountId],
    invite: publicBattleInvite(invite, data),
    room: null,
  };
}

function expireBattleTimeouts(data, now) {
  const events = [];
  for (const invite of Object.values(data.battleInvites)) {
    if (battleInviteIsExpired(invite, now)) {
      events.push(expireBattleInvite(data, invite, now));
    }
  }
  for (const room of Object.values(data.battleRooms)) {
    if (!room || room.status === BATTLE_ROOM_CLOSED) {
      continue;
    }
    const battle = battleRoomBattleStateForMutation(room, now);
    if (String(battle.phase || "") !== BATTLE_PHASE_COMMAND || !battle.commandDeadlineAt) {
      continue;
    }
    if (Date.parse(battle.commandDeadlineAt) > now()) {
      continue;
    }
    const result = battleRoomResultForTimeout(room, battle, now);
    closeBattleRoomWithResult(data, room, result, now);
    data.battleRooms[room.roomId] = room;
    events.push({
      type: "battle.room_closed",
      targetAccountIds: room.participantAccountIds.slice(),
      roomId: room.roomId,
      reason: result.reason,
      result: publicBattleResult(result),
      room: publicBattleRoom(room),
    });
  }
  return events;
}

function battleDefendEvent(room, battle, command, actor, round, sequence) {
  const actionId = String(command.actionId || BATTLE_ACTION_DEFEND);
  return {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: "defend",
    round,
    sequence,
    actorAccountId: actor.accountId,
    actorUsername: actor.username,
    actorId: actor.actorId,
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    actionId,
    skillId: String(command.skillId || ""),
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
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    actionId: String(command.actionId || BATTLE_ACTION_ATTACK),
    skillId: String(command.skillId || ""),
    targetActorId: String(command.targetActorId || ""),
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
  const actionKind = String(command.actionKind || "attack");
  const actionId = String(command.actionId || BATTLE_ACTION_ATTACK);
  const skillId = String(command.skillId || "");
  const eventType = actionKind === "pet_skill" ? "pet_skill" : "basic_attack";
  const actionLabel = actionKind === "pet_skill" ? "使用技能" : "攻击了";
  return {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType,
    round,
    sequence,
    actorAccountId: actor.accountId,
    actorUsername: actor.username,
    actorId: actor.actorId,
    actorKind: String(actor.kind || BATTLE_ACTOR_KIND_PLAYER),
    targetAccountId: target.accountId,
    targetUsername: target.username,
    targetActorId: target.actorId,
    targetKind: String(target.kind || BATTLE_ACTOR_KIND_PLAYER),
    actionId,
    skillId,
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
    message: `${actor.displayName || actor.username} ${actionLabel} ${target.displayName || target.username}，造成 ${damage} 点伤害。`,
    schemaVersion: 1,
  };
}

function battleAttackDamage(room, battle, command, actor, target) {
  const seed = `${room.seed || room.roomId}:${battle.turnSeq}:${battle.round}:${command.actorId}:${command.targetActorId}`;
  const roll = Number.parseInt(crypto.createHash("sha256").update(seed).digest("hex").slice(0, 4), 16) % 7;
  const reduction = target.guarding ? BATTLE_DEFEND_REDUCTION : 0;
  let baseDamage = BATTLE_BASE_ATTACK_DAMAGE;
  if (String(actor.kind || "") === BATTLE_ACTOR_KIND_PET) {
    baseDamage = Math.max(8, Math.round(Number(actor.attack || DEFAULT_PET_BATTLE_STATS.attack) * 0.75));
  }
  if (String(command.actionKind || "") === "pet_skill") {
    baseDamage += 12;
  }
  return Math.max(1, baseDamage + roll - reduction);
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

function publicOnlinePlayersForViewer(data, viewerAccount, aoi, now) {
  const viewerPosition = viewerAccount ? data.playerPositions[viewerAccount.accountId] || null : null;
  const players = onlinePlayersForViewer(data, viewerAccount, aoi, now).map((account) => publicOnlinePlayer(account, data));
  players.sort((a, b) => {
    const distanceDelta = onlinePlayerDistanceRank(a, viewerPosition) - onlinePlayerDistanceRank(b, viewerPosition);
    if (distanceDelta !== 0) {
      return distanceDelta;
    }
    return String(a.username).localeCompare(String(b.username));
  });
  return players.slice(0, ONLINE_PLAYERS_RESPONSE_LIMIT);
}

function withPinnedPublicOnlinePlayer(players, data, accountId) {
  if (!accountId || players.some((player) => player.accountId === accountId)) {
    return players;
  }
  const account = accountById(data, accountId);
  if (!account) {
    return players;
  }
  const pinned = publicOnlinePlayer(account, data);
  return [pinned, ...players].slice(0, ONLINE_PLAYERS_RESPONSE_LIMIT);
}

function onlinePlayerDistanceRank(player, viewerPosition) {
  if (!viewerPosition || !player || !player.position) {
    return Number.MAX_SAFE_INTEGER;
  }
  const position = player.position;
  if (String(position.mapId || "") !== String(viewerPosition.mapId || "")) {
    return Number.MAX_SAFE_INTEGER;
  }
  const dx = Math.abs(Number(position.cellX || 0) - Number(viewerPosition.cellX || 0));
  const dy = Math.abs(Number(position.cellY || 0) - Number(viewerPosition.cellY || 0));
  return Math.max(dx, dy);
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
