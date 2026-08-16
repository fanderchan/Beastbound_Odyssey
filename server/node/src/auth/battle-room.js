"use strict";

const {
  pendingInviteAdmission,
  terminalInvite,
} = require("./runtime-invite-boundary");
const {battleRoomForMutation} = require("./battle-room-cow");

const BATTLE_INVITE_MAX_PENDING = 1024;
const BATTLE_INVITE_MAX_PER_ACCOUNT = 16;
const BATTLE_RUNTIME_COMMAND_RECEIPT_LIMIT = 32;

function createBattleRoomDomain(ctx) {
  const {
    BATTLE_INVITE_ACCEPTED,
    BATTLE_INVITE_CANCELLED,
    BATTLE_INVITE_DECLINED,
    BATTLE_INVITE_PENDING,
    BATTLE_INVITE_TTL_MS,
    BATTLE_MODE_DUEL,
    BATTLE_MODE_PARTY_PVE,
    BATTLE_PHASE_COMMAND,
    BATTLE_ROOM_CLOSED,
    BATTLE_ROOM_READY,
    BATTLE_SIDE_ALLY,
    accountById,
    activeBattleRoomForAccount,
    activeOnlinePlayers,
    authorizePartyEncounter,
    battleInviteIsExpired,
    battleBackpackEntryCheck,
    battleParticipantSnapshot,
    battleRecordSummaryAgainst,
    battleRoomBattleStateForMutation,
    battleRoomConnectionStateForMutation,
    battleRoomEntryCheck,
    battleRoomResultForLeave,
    battleStatePayload,
    battleFailureTicketAdmission,
    battleFailureTicketStateForAccount,
    clampInt,
    clone,
    clearBattleFailureTickets,
    closeBattleRoomWithResult,
    createBattleRoomBattleState,
    consumePartyEncounterAuthorization,
    currentDurableOperation,
    emitServiceEvent,
    encounterRecoveryForAuthorization,
    expireBattleInvite,
    expireBattleTimeoutsAndEmit,
    fail,
    isoNow,
    installBattleFailureTickets,
    load,
    markBattleConnectionForAccount,
    matchmakingContextForParty,
    normalizeBattleCommandPayload,
    normalizeUsername,
    now,
    offlinePartyPveBattleParticipantAccountIds,
    ok,
    openBattleRandomRoom,
    partyEncounterEntry,
    partyForAccount,
    preparePartyEncounterCaptureCandidates,
    publicBattleCommand,
    publicBattleInterruption,
    publicBattleInvite,
    publicBattleResult,
    publicBattleRoom,
    publicBattleTraceRows,
    publicParty,
    randomBytes,
    randomId,
    recordBattleTrace,
    recoverBattleEncounterSlot,
    removeAccountFromParty,
    removeOfflinePartyPveParticipantsFromRoom,
    refreshPartyPresence,
    requiredBattleCommandAccountIds,
    requiredBattleCommandActorIds,
    resolvePartyEncounter,
    resolveBattleRoomTurn,
    resolveSession,
    save,
    settlePartyEncounterPositions,
    submittedBattleCommandAccountIds,
    submittedBattleCommandActorIds,
  } = ctx;

  function getBattleState(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    return getBattleStateForResolved(resolved);
  }

  function getBattleStateForCluster(credential, roomIdValue) {
    const data = load();
    const resolved = ctx.resolveClusterBattleCredential(data, credential);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const roomId = String(roomIdValue || "").trim();
    if (!battleRoomKnownForAccount(data, resolved.account.accountId, roomId)) {
      return fail("battle_cluster_room_not_owned", "战斗房间不由当前节点持有。");
    }
    return getBattleStateForResolved(resolved, roomId);
  }

  function getBattleStateForResolved(resolved, expectedRoomId = "") {
    let data = load();
    expireBattleTimeoutsAndEmit(data);
    data = load();
    if (typeof ctx.applyBattleConnectionState === "function") {
      ctx.applyBattleConnectionState(data, resolved.account.accountId, true, "http_poll");
    } else {
      markBattleConnectionForAccount(data, resolved.account.accountId, true, now);
    }
    const pruneResult = pruneOfflinePartyPveParticipants(data, resolved.account.accountId);
    if (pruneResult.changed) {
      save(data);
      for (const event of pruneResult.events) {
        emitServiceEvent(event);
      }
      data = load();
    }
    const payload = battleStatePayload(data, resolved.account.accountId, now);
    if (
      payload.room
      && String(expectedRoomId || "") !== ""
      && String(payload.room.roomId || "") !== String(expectedRoomId)
    ) {
      return fail("battle_cluster_room_changed", "战斗房间已经变化，请重新同步。");
    }
    const interruptionState = battleFailureTicketStateForAccount(data, resolved.account.accountId);
    if (!interruptionState.ok) {
      return fail(interruptionState.code, interruptionState.message);
    }
    payload.interruption = payload.room
      ? null
      : publicBattleInterruption(interruptionState.ticket);
    return ok(payload);
  }

  function clusterBattleRoomKnown(credential, roomIdValue) {
    const data = load();
    const resolved = ctx.resolveClusterBattleCredential(data, credential);
    return Boolean(
      resolved.ok
      && battleRoomKnownForAccount(
        data,
        resolved.account.accountId,
        String(roomIdValue || "").trim(),
      )
    );
  }

  function battleRoomKnownForAccount(data, accountIdValue, roomIdValue) {
    const accountId = String(accountIdValue || "");
    const roomId = String(roomIdValue || "").trim();
    if (accountId === "" || roomId === "") {
      return false;
    }
    const active = data.battleRooms && data.battleRooms[roomId];
    const recovery = data.battleRoomRecoveries && data.battleRoomRecoveries[roomId];
    const room = active || recovery || null;
    return Boolean(
      room
      && Array.isArray(room.participantAccountIds)
      && room.participantAccountIds.includes(accountId)
    );
  }

  function recoverBattleInterruption(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    if (activeBattleRoomForAccount(data, resolved.account.accountId)) {
      return fail("battle_interruption_room_active", "当前战斗仍在进行中，无需处理中断恢复。");
    }
    const interruptionState = battleFailureTicketStateForAccount(data, resolved.account.accountId);
    if (!interruptionState.ok) {
      return fail(interruptionState.code, interruptionState.message);
    }
    const ticket = interruptionState.ticket;
    if (!ticket) {
      return ok({
        interruption: null,
        encounterReturned: false,
        message: "当前没有需要处理的中断战斗。",
      });
    }
    const encounterRecovery = recoverBattleEncounterSlot(data, ticket);
    if (!encounterRecovery.ok) {
      return fail(encounterRecovery.code, encounterRecovery.message);
    }
    const cleared = clearBattleFailureTickets(
      data,
      ticket.roomId,
      [resolved.account.accountId],
    );
    if (!cleared.ok) {
      return fail(cleared.code, cleared.message);
    }
    save(data);
    return ok({
      interruption: null,
      encounterReturned: Boolean(encounterRecovery.refunded),
      message: encounterRecovery.refunded
        ? "战斗因服务器切换中断，本场未计胜负；本次遇敌次数已返还，可以重新发起。"
        : "战斗因服务器切换中断，本场未计胜负；现在可以重新发起。",
    });
  }

  function pruneOfflinePartyPveParticipants(data, viewerAccountId) {
    const result = {
      changed: false,
      events: [],
    };
    const normalizedViewerAccountId = String(viewerAccountId || "");
    if (!normalizedViewerAccountId) {
      return result;
    }
    for (const room of Object.values(data.battleRooms)) {
      if (
        !room ||
        room.status === BATTLE_ROOM_CLOSED ||
        String(room.mode || BATTLE_MODE_DUEL) !== BATTLE_MODE_PARTY_PVE
      ) {
        continue;
      }
      const participantAccountIds = Array.isArray(room.participantAccountIds)
        ? room.participantAccountIds.map((accountId) => String(accountId || "")).filter(Boolean)
        : [];
      if (!participantAccountIds.includes(normalizedViewerAccountId)) {
        continue;
      }
      const offlineAccountIds = offlinePartyPveBattleParticipantAccountIds(data, room);
      if (offlineAccountIds.length <= 0) {
        continue;
      }
      const mutableRoom = battleRoomForMutation(data, room);
      const update = removeOfflinePartyPveParticipantsFromRoom(data, mutableRoom, offlineAccountIds);
      if (!update.changed) {
        continue;
      }
      result.changed = true;
      for (const partyEvent of update.partyEvents) {
        result.events.push(partyEvent);
      }
      result.events.push({
        type: "battle.room_updated",
        targetAccountIds: update.targetAccountIds,
        roomId: mutableRoom.roomId,
        reason: "party_member_offline",
        removedAccountIds: update.removedAccountIds,
        escapedActorIds: update.escapedActorIds,
        turn: update.turn,
        room: publicBattleRoom(mutableRoom),
      });
    }
    return result;
  }

  function getBattleTrace(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    return ok({
      traces: publicBattleTraceRows(data, resolved.account, payload, now),
      message: "已读取战斗诊断日志。",
    });
  }

  function getBattleRecordSummary(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    const targetUsername = normalizeUsername(payload.username || payload.targetUsername || payload.opponentUsername || "");
    if (!targetUsername) {
      return fail("battle_record_target_missing", "请选择要查询的玩家。");
    }
    const target = data.accounts[targetUsername] || null;
    if (!target) {
      return fail("battle_record_target_missing", "玩家不存在。");
    }
    return ok({
      summary: battleRecordSummaryAgainst(data, resolved.account, target),
      message: "已读取对战战绩。",
    });
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
    const ticketAdmission = battleFailureTicketAdmission(
      data,
      [resolved.account.accountId, target.accountId],
    );
    if (!ticketAdmission.ok) {
      return fail(ticketAdmission.code, ticketAdmission.message);
    }
    const backpackEntry = battleBackpackEntryCheck(data, [resolved.account.accountId, target.accountId]);
    if (!backpackEntry.ok) {
      return backpackEntry;
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
    const admission = pendingInviteAdmission(data.battleInvites, {
      fromAccountId: resolved.account.accountId,
      toAccountId: target.accountId,
    }, {
      pendingStatus: BATTLE_INVITE_PENDING,
      maxPending: BATTLE_INVITE_MAX_PENDING,
      maxPerAccount: BATTLE_INVITE_MAX_PER_ACCOUNT,
    });
    if (!admission.ok) {
      return fail("battle_invite_capacity_full", "待处理的切磋邀请较多，请稍后再试。");
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
    const ticketAdmission = battleFailureTicketAdmission(
      data,
      [invite.fromAccountId, invite.toAccountId],
    );
    if (!ticketAdmission.ok) {
      return fail(ticketAdmission.code, ticketAdmission.message);
    }
    const completedInvite = terminalInvite(data.battleInvites, invite.inviteId, BATTLE_INVITE_ACCEPTED, {now});
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
    const ticketInstall = installBattleFailureTickets(data, room);
    if (!ticketInstall.ok) {
      return fail(ticketInstall.code, ticketInstall.message);
    }
    openPrivateBattleRandomRoom(room);
    battleRoomConnectionStateForMutation(room);
    data.battleRooms[room.roomId] = room;
    recordBattleTrace(data, room, "duel_room_created", {
      participantCount: room.participantAccountIds.length,
      actorCount: Array.isArray(room.battle.actors) ? room.battle.actors.length : 0,
    }, now);
    save(data);
    emitServiceEvent({
      type: "battle.room_ready",
      targetAccountIds: room.participantAccountIds.slice(),
      invite: publicBattleInvite(completedInvite, data),
      room: publicBattleRoom(room),
    });
    return ok({
      invite: publicBattleInvite(completedInvite, data),
      room: publicBattleRoom(room, resolved.account.accountId),
      message: "切磋房间已就绪。",
    });
  }

  function startPartyEncounter(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    expireBattleTimeoutsAndEmit(data);
    const party = partyForAccount(data, resolved.account.accountId);
    const partyLeaderAccountId = party ? String(party.leaderAccountId || "") : resolved.account.accountId;
    if (party && partyLeaderAccountId !== resolved.account.accountId) {
      return fail("party_encounter_leader_required", "队伍遇敌由队长触发。");
    }
    let activeParty = party;
    let partyPresenceRefresh = null;
    let partyPresencePreview = null;
    if (activeParty && typeof refreshPartyPresence === "function") {
      const partyId = String(activeParty.partyId || "");
      const previewParty = clone(activeParty);
      const previewData = {
        ...data,
        parties: {...data.parties, [partyId]: previewParty},
        partyInvites: clone(data.partyInvites),
      };
      partyPresenceRefresh = refreshPartyPresence(previewData, previewParty);
      activeParty = partyPresenceRefresh.party;
      partyPresencePreview = {
        parties: previewData.parties,
        partyInvites: previewData.partyInvites,
      };
    }
    const onlineAccountIds = new Set(activeOnlinePlayers(data, now).map((account) => String(account.accountId || "")));
    const allMemberAccountIds = (activeParty && Array.isArray(activeParty.memberAccountIds) ? activeParty.memberAccountIds : [resolved.account.accountId])
      .map((accountId) => String(accountId || ""))
      .filter((accountId) => accountById(data, accountId));
    const memberAccountIds = allMemberAccountIds.filter((accountId) => onlineAccountIds.has(accountId));
    if (memberAccountIds.length < 1) {
      return fail("party_encounter_party_missing", "缺少参战账号。");
    }
    const backpackEntry = battleBackpackEntryCheck(data, memberAccountIds);
    if (!backpackEntry.ok) {
      return backpackEntry;
    }
    const busyAccountId = memberAccountIds.find((accountId) => activeBattleRoomForAccount(data, accountId));
    if (busyAccountId) {
      const busyAccount = accountById(data, busyAccountId);
      return fail("battle_room_busy", `${busyAccount ? busyAccount.displayName || busyAccount.username : "队员"} 已在战斗房间中。`);
    }
    const ticketAdmission = battleFailureTicketAdmission(data, memberAccountIds);
    if (!ticketAdmission.ok) {
      return fail(ticketAdmission.code, ticketAdmission.message);
    }
    const authorizationResult = authorizePartyEncounter(data, resolved, payload, memberAccountIds);
    if (!authorizationResult.ok) {
      return fail(authorizationResult.code, authorizationResult.message);
    }
    const authorization = authorizationResult.authorization || {mode: "direct"};
    const permitStopsMovement = String(authorization.mode || "") === "permit";
    const participants = memberAccountIds
      .map((accountId) => accountById(data, accountId))
      .filter(Boolean)
      .map((account) => {
        const participant = battleParticipantSnapshot(data, account, BATTLE_SIDE_ALLY);
        if (permitStopsMovement && participant.position) {
          participant.position = {...participant.position, moving: false};
        }
        return participant;
      });
    const seed = String(authorization.encounterSeed || randomBytes(8).toString("hex"));
    const encounterResolution = resolvePartyEncounter(
      data,
      partyLeaderAccountId,
      payload,
      participants,
      seed,
      authorization,
    );
    if (!encounterResolution.ok) {
      return fail(encounterResolution.code, encounterResolution.message);
    }
    const encounter = encounterResolution.encounter;
    const entry = partyEncounterEntry(data, activeParty ? {
      ...activeParty,
      memberAccountIds,
    } : {
      leaderAccountId: resolved.account.accountId,
      memberAccountIds,
    });
    if (permitStopsMovement) {
      if (entry.leaderPosition) {
        entry.leaderPosition.moving = false;
      }
      for (const position of Object.values(entry.memberPositions || {})) {
        if (position && typeof position === "object") {
          position.moving = false;
        }
      }
    }
    const leaderPosition = data.playerPositions[partyLeaderAccountId] || null;
    const queuedMatchContext = typeof matchmakingContextForParty === "function"
      ? matchmakingContextForParty(data, activeParty || {
        leaderAccountId: resolved.account.accountId,
        memberAccountIds,
      }, {
        activeMemberAccountIds: memberAccountIds,
        mapId: String(leaderPosition && leaderPosition.mapId || ""),
        encounterGroupId: String(encounter && encounter.groupId || ""),
      })
      : null;
    const matchContext = queuedMatchContext;
    const room = {
      roomId: `battle_room_${randomId()}`,
      mode: BATTLE_MODE_PARTY_PVE,
      status: BATTLE_ROOM_READY,
      inviteId: "",
      partyId: activeParty ? activeParty.partyId : "",
      leaderAccountId: partyLeaderAccountId,
      seed,
      participantAccountIds: memberAccountIds,
      entry,
      participants,
      encounter,
      matchmaking: Boolean(matchContext),
      matchQueueId: String(matchContext && matchContext.queueId || ""),
      matchTarget: matchContext ? clone(matchContext.target) : null,
      matchBots: matchContext ? clone(matchContext.matchBots) : [],
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    room.battle = createBattleRoomBattleState(room, now);
    const candidatePreparation = preparePartyEncounterCaptureCandidates(room);
    if (!candidatePreparation || candidatePreparation.ok !== true || !candidatePreparation.room) {
      return fail(
        "battle_capture_candidate_invalid",
        "这次遭遇的宠物状态异常，请重新遇敌。",
      );
    }
    Object.assign(room, candidatePreparation.room);
    battleRoomConnectionStateForMutation(room);
    const encounterRecovery = encounterRecoveryForAuthorization(data, authorization);
    if (String(authorization.mode || "") === "timed" && !encounterRecovery) {
      return fail("battle_failure_ticket_recovery_invalid", "遇敌恢复状态不完整，请重新使用遇敌石。");
    }
    const consumed = consumePartyEncounterAuthorization(data, authorization);
    if (!consumed.ok) {
      return fail(consumed.code, consumed.message);
    }
    const ticketInstall = installBattleFailureTickets(data, room, {
      encounterRecoveryByAccountId: encounterRecovery
        ? {[String(authorization.accountId || "")]: encounterRecovery}
        : {},
    });
    if (!ticketInstall.ok) {
      return fail(ticketInstall.code, ticketInstall.message);
    }
    openPrivateBattleRandomRoom(room);
    if (partyPresencePreview) {
      data.parties = partyPresencePreview.parties;
      data.partyInvites = partyPresencePreview.partyInvites;
    }
    settlePartyEncounterPositions(data, memberAccountIds, authorization);
    data.battleRooms[room.roomId] = room;
    recordBattleTrace(data, room, "party_pve_room_created", {
      enemyCount: Number(room.encounter && room.encounter.enemyCount || 0),
      participantCount: room.participantAccountIds.length,
      actorCount: Array.isArray(room.battle.actors) ? room.battle.actors.length : 0,
    }, now);
    save(data);
    if (partyPresenceRefresh && partyPresenceRefresh.changed) {
      emitServiceEvent({
        type: "party.update",
        targetAccountIds: partyPresenceRefresh.targetAccountIds,
        party: activeParty ? publicParty(activeParty, data) : null,
        partyId: party.partyId,
        removedAccountIds: partyPresenceRefresh.removedAccountIds,
      });
    }
    emitServiceEvent({
      type: "battle.room_ready",
      targetAccountIds: room.participantAccountIds.slice(),
      invite: null,
      room: publicBattleRoom(room),
    });
    const skippedOfflineCount = Math.max(0, allMemberAccountIds.length - memberAccountIds.length);
    return ok({
      room: publicBattleRoom(room, resolved.account.accountId),
      message: skippedOfflineCount > 0 ? "队伍遭遇了野生宠物，离线队员未参战。" : (memberAccountIds.length > 1 ? "队伍遭遇了野生宠物。" : "遭遇了野生宠物。"),
    });
  }

  function openPrivateBattleRandomRoom(room) {
    if (
      typeof openBattleRandomRoom !== "function"
      || openBattleRandomRoom(room) !== true
    ) {
      const error = new Error("battle random room could not be opened");
      error.code = "battle_random_room_unavailable";
      throw error;
    }
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
    const completedInvite = terminalInvite(data.battleInvites, invite.inviteId, BATTLE_INVITE_DECLINED, {now});
    save(data);
    emitServiceEvent({
      type: "battle.invite_declined",
      targetAccountIds: [invite.fromAccountId, invite.toAccountId],
      invite: publicBattleInvite(completedInvite, data),
      room: null,
    });
    return ok({
      invite: publicBattleInvite(completedInvite, data),
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
    const completedInvite = terminalInvite(data.battleInvites, invite.inviteId, BATTLE_INVITE_CANCELLED, {now});
    save(data);
    emitServiceEvent({
      type: "battle.invite_cancelled",
      targetAccountIds: [invite.fromAccountId, invite.toAccountId],
      invite: publicBattleInvite(completedInvite, data),
      room: null,
    });
    return ok({
      invite: publicBattleInvite(completedInvite, data),
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
    let room = normalizedRoomId !== "" ? data.battleRooms[normalizedRoomId] || null : activeBattleRoomForAccount(data, resolved.account.accountId);
    if (!room || room.status === BATTLE_ROOM_CLOSED) {
      return fail("battle_room_missing", "战斗房间不存在。");
    }
    if (!Array.isArray(room.participantAccountIds) || !room.participantAccountIds.includes(resolved.account.accountId)) {
      return fail("battle_room_forbidden", "你不在这个战斗房间中。");
    }
    const isPartyPve = String(room.mode || BATTLE_MODE_DUEL) === BATTLE_MODE_PARTY_PVE;
    let partyRemoval = null;
    if (isPartyPve && typeof removeAccountFromParty === "function") {
      const party = (room.partyId && data.parties[room.partyId]) ? data.parties[room.partyId] : partyForAccount(data, resolved.account.accountId);
      const leaderAccountId = party ? String(party.leaderAccountId || "") : String(room.leaderAccountId || "");
      if (leaderAccountId && leaderAccountId !== resolved.account.accountId) {
        partyRemoval = removeAccountFromParty(data, resolved.account.accountId, now);
      }
    }
    room = battleRoomForMutation(data, room);
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
    if (partyRemoval && partyRemoval.changed) {
      emitServiceEvent({
        type: "party.update",
        targetAccountIds: partyRemoval.targetAccountIds,
        party: partyRemoval.party ? publicParty(partyRemoval.party, data) : null,
        partyId: partyRemoval.partyId,
        removedAccountIds: partyRemoval.removedAccountIds,
      });
    }
    return ok({
      room: publicBattleRoom(room, resolved.account.accountId),
      result: publicBattleResult(result),
      message: isPartyPve ? (partyRemoval && partyRemoval.changed ? "已逃离战斗并离开队伍。" : "已逃离战斗。") : "已离开切磋房间。",
    });
  }

  function submitBattleCommand(token, roomId, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    return submitBattleCommandForResolved(resolved, roomId, payload);
  }

  function submitBattleCommandForCluster(credential, roomId, payload = {}) {
    const data = load();
    const resolved = ctx.resolveClusterBattleCredential(data, credential);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    return submitBattleCommandForResolved(resolved, roomId, payload);
  }

  function submitBattleCommandForResolved(resolved, roomId, payload = {}) {
    const data = load();
    expireBattleTimeoutsAndEmit(data);
    const normalizedRoomId = String(roomId || payload.roomId || "").trim();
    let room = data.battleRooms[normalizedRoomId] || null;
    if (!room || room.status === "closed") {
      return fail("battle_room_missing", "切磋房间不存在。");
    }
    if (!Array.isArray(room.participantAccountIds) || !room.participantAccountIds.includes(resolved.account.accountId)) {
      return fail("battle_room_forbidden", "你不在这个切磋房间中。");
    }
    const durableOperation = typeof currentDurableOperation === "function"
      ? currentDurableOperation()
      : null;
    const operationReplay = battleRuntimeCommandOperationReplay(
      room,
      durableOperation,
      resolved.account.accountId,
    );
    if (operationReplay) {
      if (operationReplay.conflict) {
        return fail("idempotency_key_conflict", "这个操作标识已经用于另一项请求，请重新发起操作。");
      }
      return ok(clone(operationReplay.receipt.response));
    }
    const backpackEntry = battleBackpackEntryCheck(data, requiredBattleCommandAccountIds(room));
    if (!backpackEntry.ok) {
      return backpackEntry;
    }
    let battle = room.battle && typeof room.battle === "object" && !Array.isArray(room.battle)
      ? room.battle
      : null;
    if (!battle || String(battle.phase || "") !== BATTLE_PHASE_COMMAND) {
      return fail("battle_command_phase_invalid", "当前不能提交回合命令。", {
        room: publicBattleRoom(room, resolved.account.accountId),
      });
    }
    const expectedRound = Number(battle.round || 1);
    const commandRound = clampInt(payload.round, 1, Number.MAX_SAFE_INTEGER, expectedRound);
    if (commandRound !== expectedRound) {
      return fail("battle_command_round_mismatch", "回合已变化，请重新同步。", {
        expectedRound,
        room: publicBattleRoom(room, resolved.account.accountId),
      });
    }
    const commandResult = normalizeBattleCommandPayload(payload, data, room, battle, resolved.account, now, randomId);
    if (!commandResult.ok) {
      return {
        ...commandResult,
        room: publicBattleRoom(room, resolved.account.accountId),
      };
    }
    if (battle.commands && battle.commands[commandResult.command.actorId]) {
      return fail("battle_command_duplicate", "本回合命令已经提交。", {
        room: publicBattleRoom(room, resolved.account.accountId),
      });
    }
    room = battleRoomForMutation(data, room);
    battle = battleRoomBattleStateForMutation(room, now);
    battle.commands[commandResult.command.actorId] = commandResult.command;
    battle.requiredActorIds = requiredBattleCommandActorIds(battle);
    battle.submittedActorIds = submittedBattleCommandActorIds(battle);
    battle.submittedAccountIds = submittedBattleCommandAccountIds(battle);
    battle.updatedAt = isoNow(now);
    room.updatedAt = battle.updatedAt;
    const commandSubmittedActorIds = battle.submittedActorIds.slice();
    const commandSubmittedAccountIds = battle.submittedAccountIds.slice();
    // These progress lists describe the command round that is about to resolve.
    // Capture them before resolveBattleRoomTurn() clears commands and derives
    // the next round, otherwise the last submission can accidentally announce
    // next-round required actors.
    const commandRequiredActorIds = battle.requiredActorIds.slice();
    const commandRequiredAccountIds = requiredBattleCommandAccountIds(room);
    let turn = null;
    const readyToResolve = battle.requiredActorIds.every((actorId) => battle.commands[actorId]);
    recordBattleTrace(data, room, "battle_command_submitted", {
      accountId: resolved.account.accountId,
      actorId: commandResult.command.actorId,
      actionId: commandResult.command.actionId,
      round: expectedRound,
      submittedActorCount: commandSubmittedActorIds.length,
      requiredActorCount: commandRequiredActorIds.length,
      readyToResolve,
    }, now);
    if (readyToResolve) {
      turn = resolveBattleRoomTurn(data, room, battle, now);
    }
    rememberBattleRuntimeCommandOperation(
      room,
      durableOperation,
      resolved.account.accountId,
      {
        room: publicBattleRoom(room, resolved.account.accountId),
        command: publicBattleCommand(commandResult.command),
        turn,
        message: turn ? "本回合已结算。" : "回合命令已提交。",
      },
    );
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
      requiredAccountIds: commandRequiredAccountIds,
      requiredActorIds: commandRequiredActorIds,
    });
    if (turn) {
      emitServiceEvent({
        type: "battle.turn_resolved",
        targetAccountIds: room.participantAccountIds.slice(),
        roomId: room.roomId,
        round: turn.round,
        // The service event uses the compact replay view already attached to
        // the room. Per-viewer projection hydrates its static actor fields;
        // the direct HTTP response below still returns the complete turn.
        turn: room.battle && room.battle.lastEventList
          ? room.battle.lastEventList
          : turn,
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
      room: publicBattleRoom(room, resolved.account.accountId),
      command: publicBattleCommand(commandResult.command),
      turn,
      message: turn ? "本回合已结算。" : "回合命令已提交。",
    });
  }

  return {
    getBattleState,
    getBattleStateForCluster,
    clusterBattleRoomKnown,
    recoverBattleInterruption,
    getBattleTrace,
    getBattleRecordSummary,
    inviteToBattle,
    acceptBattleInvite,
    startPartyEncounter,
    declineBattleInvite,
    cancelBattleInvite,
    leaveBattleRoom,
    submitBattleCommand,
    submitBattleCommandForCluster,
  };
}

function battleRuntimeCommandOperationReplay(room, operation, accountIdValue) {
  const normalized = normalizeRuntimeCommandOperation(operation);
  if (!normalized) {
    return null;
  }
  const receipts = room && room.clusterCommandReceipts
    && typeof room.clusterCommandReceipts === "object"
    && !Array.isArray(room.clusterCommandReceipts)
    ? room.clusterCommandReceipts
    : {};
  const receipt = receipts[normalized.operationId] || null;
  if (!receipt) {
    return null;
  }
  const exact = (
    String(receipt.accountId || "") === String(accountIdValue || "")
    && String(receipt.requestHash || "") === normalized.requestHash
    && String(receipt.actionId || "") === normalized.actionId
  );
  const response = receipt.response && typeof receipt.response === "object"
    && !Array.isArray(receipt.response)
    ? receipt.response
    : null;
  return exact && response
    ? {conflict: false, receipt}
    : {conflict: true, receipt: null};
}

function rememberBattleRuntimeCommandOperation(room, operation, accountIdValue, responseValue) {
  const normalized = normalizeRuntimeCommandOperation(operation);
  if (!normalized || !room || typeof room !== "object" || Array.isArray(room)) {
    return;
  }
  const receipts = room.clusterCommandReceipts
    && typeof room.clusterCommandReceipts === "object"
    && !Array.isArray(room.clusterCommandReceipts)
    ? room.clusterCommandReceipts
    : {};
  const order = Array.isArray(room.clusterCommandReceiptOrder)
    ? room.clusterCommandReceiptOrder
      .map((value) => String(value || ""))
      .filter(Boolean)
    : [];
  receipts[normalized.operationId] = {
    schemaVersion: 1,
    operationId: normalized.operationId,
    requestHash: normalized.requestHash,
    actionId: normalized.actionId,
    accountId: String(accountIdValue || ""),
    response: cloneRuntimeCommandResponse(responseValue),
  };
  const nextOrder = order.filter((operationId) => operationId !== normalized.operationId);
  nextOrder.push(normalized.operationId);
  while (nextOrder.length > BATTLE_RUNTIME_COMMAND_RECEIPT_LIMIT) {
    delete receipts[nextOrder.shift()];
  }
  room.clusterCommandReceipts = receipts;
  room.clusterCommandReceiptOrder = nextOrder;
}

function normalizeRuntimeCommandOperation(value) {
  const operation = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const operationId = String(operation && operation.operationId || "").trim();
  const requestHash = String(operation && operation.requestHash || "").trim().toLowerCase();
  const actionId = String(operation && operation.actionId || "").trim();
  return operationId !== "" && requestHash !== "" && actionId !== ""
    ? {operationId, requestHash, actionId}
    : null;
}

function cloneRuntimeCommandResponse(value) {
  const response = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    room: response.room && typeof response.room === "object" && !Array.isArray(response.room)
      ? JSON.parse(JSON.stringify(response.room))
      : null,
    command: response.command && typeof response.command === "object" && !Array.isArray(response.command)
      ? JSON.parse(JSON.stringify(response.command))
      : null,
    turn: response.turn && typeof response.turn === "object" && !Array.isArray(response.turn)
      ? JSON.parse(JSON.stringify(response.turn))
      : null,
    message: String(response.message || ""),
  };
}

module.exports = {createBattleRoomDomain};
