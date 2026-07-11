"use strict";

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
    battleInviteIsExpired,
    battleParticipantSnapshot,
    battleRecordSummaryAgainst,
    battleRoomBattleStateForMutation,
    battleRoomConnectionStateForMutation,
    battleRoomEntryCheck,
    battleRoomResultForLeave,
    battleStatePayload,
    clampInt,
    closeBattleRoomWithResult,
    createBattleRoomBattleState,
    emitServiceEvent,
    expireBattleInvite,
    expireBattleTimeoutsAndEmit,
    fail,
    isoNow,
    load,
    markBattleConnectionForAccount,
    normalizeBattleCommandPayload,
    normalizeUsername,
    now,
    offlinePartyPveBattleParticipantAccountIds,
    ok,
    partyEncounterEntry,
    partyForAccount,
    publicBattleCommand,
    publicBattleInvite,
    publicBattleResult,
    publicBattleRoom,
    publicBattleTraceRows,
    publicParty,
    randomBytes,
    randomId,
    recordBattleStateTrace,
    recordBattleTrace,
    removeAccountFromParty,
    removeOfflinePartyPveParticipantsFromRoom,
    refreshPartyPresence,
    requiredBattleCommandAccountIds,
    requiredBattleCommandActorIds,
    resolvePartyEncounter,
    resolveBattleRoomTurn,
    resolveSession,
    save,
    submittedBattleCommandAccountIds,
    submittedBattleCommandActorIds,
  } = ctx;

  function getBattleState(token) {
    let data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
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
    recordBattleStateTrace(data, resolved.account.accountId, payload, now);
    return ok(payload);
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
      const update = removeOfflinePartyPveParticipantsFromRoom(data, room, offlineAccountIds);
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
        roomId: room.roomId,
        reason: "party_member_offline",
        removedAccountIds: update.removedAccountIds,
        escapedActorIds: update.escapedActorIds,
        turn: update.turn,
        room: publicBattleRoom(room),
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
      invite: publicBattleInvite(invite, data),
      room: publicBattleRoom(room),
    });
    return ok({
      invite: publicBattleInvite(invite, data),
      room: publicBattleRoom(room),
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
    if (activeParty && typeof refreshPartyPresence === "function") {
      partyPresenceRefresh = refreshPartyPresence(data, activeParty);
      activeParty = partyPresenceRefresh.party;
    }
    const onlineAccountIds = new Set(activeOnlinePlayers(data, now).map((account) => String(account.accountId || "")));
    const allMemberAccountIds = (activeParty && Array.isArray(activeParty.memberAccountIds) ? activeParty.memberAccountIds : [resolved.account.accountId])
      .map((accountId) => String(accountId || ""))
      .filter((accountId) => accountById(data, accountId));
    const memberAccountIds = allMemberAccountIds.filter((accountId) => onlineAccountIds.has(accountId));
    if (memberAccountIds.length < 1) {
      return fail("party_encounter_party_missing", "缺少参战账号。");
    }
    const busyAccountId = memberAccountIds.find((accountId) => activeBattleRoomForAccount(data, accountId));
    if (busyAccountId) {
      const busyAccount = accountById(data, busyAccountId);
      return fail("battle_room_busy", `${busyAccount ? busyAccount.displayName || busyAccount.username : "队员"} 已在战斗房间中。`);
    }
    const participants = memberAccountIds
      .map((accountId) => accountById(data, accountId))
      .filter(Boolean)
      .map((account) => battleParticipantSnapshot(data, account, BATTLE_SIDE_ALLY));
    const seed = randomBytes(8).toString("hex");
    const encounterResolution = resolvePartyEncounter(
      data,
      partyLeaderAccountId,
      payload,
      participants,
      seed,
    );
    if (!encounterResolution.ok) {
      return fail(encounterResolution.code, encounterResolution.message);
    }
    const encounter = encounterResolution.encounter;
    const room = {
      roomId: `battle_room_${randomId()}`,
      mode: BATTLE_MODE_PARTY_PVE,
      status: BATTLE_ROOM_READY,
      inviteId: "",
      partyId: activeParty ? activeParty.partyId : "",
      leaderAccountId: partyLeaderAccountId,
      seed,
      participantAccountIds: memberAccountIds,
      entry: partyEncounterEntry(data, activeParty ? {
        ...activeParty,
        memberAccountIds,
      } : {
        leaderAccountId: resolved.account.accountId,
        memberAccountIds,
      }),
      participants,
      encounter,
      createdAt: isoNow(now),
      updatedAt: isoNow(now),
      schemaVersion: 1,
    };
    room.battle = createBattleRoomBattleState(room, now);
    battleRoomConnectionStateForMutation(room);
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
      room: publicBattleRoom(room),
      message: skippedOfflineCount > 0 ? "队伍遭遇了野生宠物，离线队员未参战。" : (memberAccountIds.length > 1 ? "队伍遭遇了野生宠物。" : "遭遇了野生宠物。"),
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
      room: publicBattleRoom(room),
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
      return {
        ...commandResult,
        room: publicBattleRoom(room),
      };
    }
    if (battle.commands && battle.commands[commandResult.command.actorId]) {
      return fail("battle_command_duplicate", "本回合命令已经提交。", {
        room: publicBattleRoom(room),
      });
    }
    battle.commands[commandResult.command.actorId] = commandResult.command;
    battle.requiredActorIds = requiredBattleCommandActorIds(battle);
    battle.submittedActorIds = submittedBattleCommandActorIds(battle);
    battle.submittedAccountIds = submittedBattleCommandAccountIds(battle);
    battle.updatedAt = isoNow(now);
    room.updatedAt = battle.updatedAt;
    const commandSubmittedActorIds = battle.submittedActorIds.slice();
    const commandSubmittedAccountIds = battle.submittedAccountIds.slice();
    const commandSubmittedRoom = publicBattleRoom(room);
    let turn = null;
    const readyToResolve = battle.requiredActorIds.every((actorId) => battle.commands[actorId]);
    recordBattleTrace(data, room, "battle_command_submitted", {
      accountId: resolved.account.accountId,
      actorId: commandResult.command.actorId,
      actionId: commandResult.command.actionId,
      round: expectedRound,
      submittedActorCount: commandSubmittedActorIds.length,
      requiredActorCount: requiredBattleCommandActorIds(battle).length,
      readyToResolve,
    }, now);
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

  return {
    getBattleState,
    getBattleTrace,
    getBattleRecordSummary,
    inviteToBattle,
    acceptBattleInvite,
    startPartyEncounter,
    declineBattleInvite,
    cancelBattleInvite,
    leaveBattleRoom,
    submitBattleCommand,
  };
}

module.exports = {createBattleRoomDomain};
