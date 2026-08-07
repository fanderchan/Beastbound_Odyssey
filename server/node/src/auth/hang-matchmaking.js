"use strict";

const {authorityRootRecordForMutation} = require("./authority-root-clone");

const DEFAULT_NPC_FILL_DELAY_MS = 8 * 1000;
const IDEMPOTENCY_RECEIPT_LIMIT = 1024;
const MATCHMAKING_NPC_NAMES = Object.freeze([
  "系统陪练·阿岩",
  "系统陪练·小叶",
  "系统陪练·蓝芽",
  "系统陪练·风铃",
]);

function createHangMatchmakingDomain(ctx) {
  const {
    PARTY_MAX_MEMBERS,
    accountById,
    activeBattleRoomForAccount,
    activeOnlinePlayers,
    activeQuestAutoClaim,
    applyAfterDurableCommit,
    battleParticipantSnapshot,
    claimActiveQuestToProfile,
    clone,
    createPartyForLeader,
    currentProfileQuestId,
    emitServiceEvent,
    fail,
    isoNow,
    load,
    normalizeHangSession,
    now,
    ok,
    partyForAccount,
    petEncounterAuthority,
    persistProfileForAccount,
    publicParty,
    questById,
    randomId,
    recordQuestEventToProfile,
    resolveSession,
    save,
  } = ctx;

  const npcFillDelayMs = positiveInteger(
    ctx.hangMatchmakingNpcFillDelayMs,
    DEFAULT_NPC_FILL_DELAY_MS,
  );
  let entriesByQueueId = new Map();
  let idempotencyReceipts = new Map();
  let stateRevision = 0;
  const publishRuntimeEffect = typeof applyAfterDurableCommit === "function"
    ? applyAfterDurableCommit
    : (effect) => effect();

  function getState(token) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    prune(data);
    return ok({
      state: publicStateForAccount(data, resolved.account.accountId),
      message: "已同步挂机匹配状态。",
    });
  }

  function join(token, payload = {}) {
    return runtimeMutation(() => joinInternal(token, payload));
  }

  function joinInternal(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    prune(data);
    const accountId = String(resolved.account.accountId || "");
    const idempotencyKey = normalizeIdempotencyKey(payload.idempotencyKey);
    if (!idempotencyKey) {
      return fail("idempotency_key_required", "本操作需要有效的操作标识，请刷新后重试。");
    }
    const receiptKey = idempotencyKey ? `${accountId}:join:${idempotencyKey}` : "";
    const preferredQueueId = String(payload.preferredQueueId || payload.queueId || "").trim().slice(0, 128);
    const intentFingerprint = fingerprint({
      preferredQueueId,
      target: requestedTargetFingerprint(payload.target || payload),
    });
    const previousReceipt = receiptKey ? idempotencyReceipts.get(receiptKey) || null : null;
    if (previousReceipt && previousReceipt.fingerprint !== intentFingerprint) {
      return fail("idempotency_key_conflict", "这个操作标识已经用于另一项匹配请求，请重新发起操作。");
    }
    if (previousReceipt) {
      return ok({
        state: {...publicStateForAccount(data, accountId), replayed: true},
        questMessages: [],
        message: "已恢复先前的匹配请求。",
      });
    }

    const profileState = profileStateForAccount(data, resolved.account);
    if (!profileState.profile) {
      return fail("profile_missing", "请先创建角色档案。");
    }
    const hangSession = normalizeHangSession(profileState.profile.hangSession);
    if (!hangSession.enabled) {
      return fail("hang_match_hang_required", "请先开始挂机，再进行组队匹配。");
    }
    const targetResult = authoritativeTarget(hangSession, payload.target || payload);
    if (!targetResult.ok) {
      return fail(targetResult.code, targetResult.message);
    }
    const target = targetResult.target;

    let party = partyForAccount(data, accountId);
    if (party && String(party.leaderAccountId || "") !== accountId) {
      return fail("hang_match_leader_required", "只有队长可以发起挂机匹配。");
    }
    const memberAccountIds = party ? partyMemberAccountIds(party) : [accountId];
    if (memberAccountIds.some((memberAccountId) => activeBattleRoomForAccount(data, memberAccountId))) {
      return fail("hang_match_battle_busy", "队伍正在战斗中，请在本场结束后再开始匹配。");
    }
    const onlineAccountIds = new Set(activeOnlinePlayers(data, now)
      .map((account) => String(account && account.accountId || ""))
      .filter(Boolean));
    const offlineMember = memberAccountIds.find((memberAccountId) => !onlineAccountIds.has(memberAccountId));
    if (offlineMember) {
      const account = accountById(data, offlineMember);
      return fail(
        "hang_match_party_member_offline",
        `${account ? account.displayName || account.username : "队员"} 当前不在线，不能进入挂机匹配。`,
      );
    }

    const existing = entryForAccount(data, accountId);
    if (existing) {
      if (!sameTarget(existing.target, target)) {
        return fail("hang_match_target_changed", "匹配目标已经变化，请先取消当前匹配。");
      }
      rememberReceipt(receiptKey, intentFingerprint);
      return ok({
        state: {...publicStateForAccount(data, accountId), replayed: true},
        questMessages: [],
        message: "已经在匹配中。",
      });
    }

    let preferredEntry = null;
    if (preferredQueueId) {
      preferredEntry = entriesByQueueId.get(preferredQueueId) || null;
      if (!preferredEntry) {
        return fail("hang_match_preferred_queue_missing", "这个队伍已离开匹配，请刷新列表后重试。");
      }
      if (!sameTarget(preferredEntry.target, target)) {
        return fail("hang_match_preferred_target_mismatch", "这个队伍的挂机地点与当前路线不同，请刷新列表后重试。");
      }
      const preferredParty = data.parties[String(preferredEntry.partyId || "")] || null;
      if (!preferredParty) {
        return fail("hang_match_preferred_queue_missing", "这个队伍已离开匹配，请刷新列表后重试。");
      }
      if (partyMemberAccountIds(preferredParty).length + memberAccountIds.length > PARTY_MAX_MEMBERS) {
        return fail("hang_match_preferred_queue_full", "这个队伍的真人席位已经不足，请刷新列表后重试。");
      }
    }

    if (!party) {
      party = createPartyForLeader(data, accountId, now, randomId);
    }

    const timestampMs = Number(now());
    const entry = {
      queueId: `hang_match_${randomId()}`,
      partyId: String(party.partyId || ""),
      leaderAccountId: accountId,
      target,
      joinedAtMs: timestampMs,
      createdAt: new Date(timestampMs).toISOString(),
      updatedAt: new Date(timestampMs).toISOString(),
      lastHumanCount: memberAccountIds.length,
      lastRosterSignature: rosterSignature(memberAccountIds),
      lastNpcCount: 0,
      schemaVersion: 1,
    };
    entriesByQueueId.set(entry.queueId, entry);
    bumpRevision();
    const mergeResult = preferredEntry
      ? mergePreferredQueue(data, preferredEntry, entry)
      : reconcileTarget(data, target);
    const activeEntry = entryForAccount(data, accountId) || entry;
    const questResult = recordJoinQuest(data, resolved.account, profileState, activeEntry);
    save(data);
    rememberReceipt(receiptKey, intentFingerprint);
    emitMatchUpdate(data, activeEntry, mergeResult.targetAccountIds);
    return ok({
      state: publicStateForAccount(data, accountId),
      questMessages: questResult.questMessages,
      message: mergeResult.merged
        ? "已匹配到真人队友，空位会由系统陪练临时补齐。"
        : "正在优先匹配真人队友，稍后会用系统陪练临时补齐空位。",
    });
  }

  function cancel(token, payload = {}) {
    return runtimeMutation(() => cancelInternal(token, payload));
  }

  function cancelInternal(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return fail(resolved.code, resolved.message);
    }
    prune(data);
    const accountId = String(resolved.account.accountId || "");
    const idempotencyKey = normalizeIdempotencyKey(payload.idempotencyKey);
    if (!idempotencyKey) {
      return fail("idempotency_key_required", "本操作需要有效的操作标识，请刷新后重试。");
    }
    const receiptKey = idempotencyKey ? `${accountId}:cancel:${idempotencyKey}` : "";
    const intentFingerprint = fingerprint({reason: String(payload.reason || "manual").trim().slice(0, 64)});
    const previousReceipt = receiptKey ? idempotencyReceipts.get(receiptKey) || null : null;
    if (previousReceipt && previousReceipt.fingerprint !== intentFingerprint) {
      return fail("idempotency_key_conflict", "这个操作标识已经用于另一项取消请求，请重新发起操作。");
    }
    if (previousReceipt) {
      return ok({
        state: {...idleState(data, accountId, "cancelled"), replayed: true},
        message: "匹配已经取消。",
      });
    }
    const entry = entryForAccount(data, accountId);
    if (!entry) {
      rememberReceipt(receiptKey, intentFingerprint);
      return ok({
        state: idleState(data, accountId, "cancelled"),
        message: "当前没有进行中的匹配。",
      });
    }
    const party = data.parties[String(entry.partyId || "")] || partyForAccount(data, accountId);
    if (party && String(party.leaderAccountId || "") !== accountId) {
      return fail("hang_match_leader_required", "只有队长可以取消队伍匹配。");
    }
    const targetAccountIds = partyMemberAccountIds(party);
    entriesByQueueId.delete(entry.queueId);
    bumpRevision();
    rememberReceipt(receiptKey, intentFingerprint);
    emitServiceEvent({
      type: "hang.match_cancelled",
      targetAccountIds,
      queueId: entry.queueId,
      reason: String(payload.reason || "manual"),
      stateRevision,
    });
    return ok({
      state: idleState(data, accountId, "cancelled", entry.target),
      message: "匹配已经取消。",
    });
  }

  function cancelAfterHangStop(token, payload = {}) {
    return runtimeMutation(() => cancelAfterHangStopInternal(token, payload));
  }

  function cancelAfterHangStopInternal(token, payload = {}) {
    const data = load();
    const resolved = resolveSession(data, token, now);
    if (!resolved.ok) {
      return null;
    }
    const accountId = String(resolved.account.accountId || "");
    const entry = entryForAccount(data, accountId);
    if (!entry) {
      return idleState(data, accountId, "cancelled");
    }
    const party = data.parties[String(entry.partyId || "")] || partyForAccount(data, accountId);
    if (party && String(party.leaderAccountId || "") !== accountId) {
      return publicStateForAccount(data, accountId);
    }
    const targetAccountIds = partyMemberAccountIds(party);
    entriesByQueueId.delete(entry.queueId);
    bumpRevision();
    emitServiceEvent({
      type: "hang.match_cancelled",
      targetAccountIds,
      queueId: entry.queueId,
      reason: String(payload.reason || "hang_stopped"),
      stateRevision,
    });
    return idleState(data, accountId, "cancelled", entry.target);
  }

  // Durable join receipts prove the profile/party mutation, while the queue
  // itself deliberately remains process-local. Rehydrate only that ephemeral
  // projection on a proven retry (including another Node or a restarted
  // process); never replay quest progress or create another durable party.
  function restoreCommittedJoinReplay(token, payload = {}, options = {}) {
    return runtimeMutation(() => {
      const data = load();
      const resolved = resolveSession(data, token, now);
      if (!resolved.ok) {
        return fail(resolved.code, resolved.message);
      }
      prune(data);
      const accountId = String(resolved.account.accountId || "");
      const idempotencyKey = normalizeIdempotencyKey(payload.idempotencyKey);
      if (!idempotencyKey) {
        return fail("idempotency_key_required", "本操作需要有效的操作标识，请刷新后重试。");
      }
      const preferredQueueId = String(payload.preferredQueueId || payload.queueId || "").trim().slice(0, 128);
      const receiptKey = `${accountId}:join:${idempotencyKey}`;
      const intentFingerprint = fingerprint({
        preferredQueueId,
        target: requestedTargetFingerprint(payload.target || payload),
      });
      const previousReceipt = idempotencyReceipts.get(receiptKey) || null;
      if (previousReceipt && previousReceipt.fingerprint !== intentFingerprint) {
        return fail("idempotency_key_conflict", "这个操作标识已经用于另一项匹配请求，请重新发起操作。");
      }
      const receipt = objectOrEmpty(options.receipt);
      const receiptResponse = objectOrEmpty(receipt.response);
      const committedState = objectOrEmpty(receiptResponse.state);
      const committedPartyId = String(objectOrEmpty(committedState.party).partyId || "").trim();
      const committedTarget = objectOrEmpty(committedState.target);
      const party = partyForAccount(data, accountId);
      const memberAccountIds = partyMemberAccountIds(party);
      if (
        committedPartyId === ""
        || !party
        || String(party.partyId || "") !== committedPartyId
        || !memberAccountIds.includes(accountId)
      ) {
        rememberReceipt(receiptKey, intentFingerprint);
        return ok({
          state: {...idleState(data, accountId, "idle"), replayed: true},
          questMessages: [],
          message: "先前的匹配请求已提交，但当前挂机或队伍状态已经变化。",
        });
      }
      const leaderAccountId = String(party.leaderAccountId || "");
      const leader = accountById(data, leaderAccountId);
      const leaderProfileState = profileStateForAccount(data, leader);
      const leaderHangSession = normalizeHangSession(
        leaderProfileState.profile && leaderProfileState.profile.hangSession,
      );
      const targetResult = authoritativeTarget(leaderHangSession, committedTarget);
      const requestedTargetResult = authoritativeTarget(leaderHangSession, payload.target || payload);
      if (
        !leader
        || !leaderProfileState.profile
        || !leaderHangSession.enabled
        || !targetResult.ok
        || !requestedTargetResult.ok
        || !sameTarget(targetResult.target, requestedTargetResult.target)
      ) {
        rememberReceipt(receiptKey, intentFingerprint);
        return ok({
          state: {...idleState(data, accountId, "idle"), replayed: true},
          questMessages: [],
          message: "先前的匹配请求已提交，但当前挂机或队伍状态已经变化。",
        });
      }
      const target = targetResult.target;
      const existing = entryForAccount(data, accountId);
      if (existing) {
        rememberReceipt(receiptKey, intentFingerprint);
        return ok({
          state: {...publicStateForAccount(data, accountId), replayed: true},
          questMessages: [],
          message: "已恢复先前的匹配请求。",
        });
      }
      const onlineAccountIds = new Set(activeOnlinePlayers(data, now)
        .map((account) => String(account && account.accountId || ""))
        .filter(Boolean));
      if (
        !onlineAccountIds.has(leaderAccountId)
        || memberAccountIds.some((memberAccountId) => activeBattleRoomForAccount(data, memberAccountId))
      ) {
        rememberReceipt(receiptKey, intentFingerprint);
        return ok({
          state: {...idleState(data, accountId, "idle", target), replayed: true},
          questMessages: [],
          message: "先前的匹配请求已提交，但当前队伍暂时不能重新进入匹配。",
        });
      }
      const timestampMs = Number(now());
      const entry = {
        queueId: `hang_match_${randomId()}`,
        partyId: String(party.partyId || ""),
        leaderAccountId,
        target,
        joinedAtMs: timestampMs,
        createdAt: new Date(timestampMs).toISOString(),
        updatedAt: new Date(timestampMs).toISOString(),
        lastHumanCount: onlinePartyMemberAccountIds(data, party).length,
        lastRosterSignature: rosterSignature(onlinePartyMemberAccountIds(data, party)),
        lastNpcCount: 0,
        schemaVersion: 1,
      };
      entriesByQueueId.set(entry.queueId, entry);
      bumpRevision();
      rememberReceipt(receiptKey, intentFingerprint);
      return ok({
        state: {...publicStateForAccount(data, accountId), replayed: true},
        questMessages: [],
        message: "已恢复先前的匹配请求。",
      });
    });
  }

  function matchmakingContextForParty(data, partyValue, options = {}) {
    const party = partyValue && typeof partyValue === "object"
      ? partyValue
      : partyForAccount(data, String(partyValue || ""));
    if (!party) {
      return null;
    }
    const entry = entriesByQueueIdValues().find((candidate) => (
      candidate && String(candidate.partyId || "") === String(party.partyId || "")
    )) || null;
    if (!entry) {
      return null;
    }
    const activeMemberAccountIds = Array.isArray(options.activeMemberAccountIds)
      ? partyMemberAccountIds({memberAccountIds: options.activeMemberAccountIds})
      : onlinePartyMemberAccountIds(data, party);
    const humanCount = activeMemberAccountIds.length;
    const npcCount = npcCountForEntry(data, entry, party, humanCount);
    const encounterAuthorization = matchmakingEncounterAuthorization(
      data,
      party,
      entry,
      options,
    );
    if (!encounterAuthorization.ok) {
      return null;
    }
    return {
      queueId: entry.queueId,
      target: clone(entry.target),
      humanCount,
      npcCount,
      matchBots: matchBotsForEntry(data, entry, party, npcCount),
      encounterAuthorization: encounterAuthorization.authorization,
      schemaVersion: 1,
    };
  }

  // Match NPCs normally follow the queued training target exactly. The one
  // deliberate exception is a server-authored active quest objective that
  // explicitly permits server fillers. This keeps quest encounters usable in
  // quiet populations without turning arbitrary client-supplied groups into
  // matchmaking targets.
  function matchmakingEncounterAuthorization(data, party, entry, options = {}) {
    const encounterGroupId = String(options.encounterGroupId || "").trim();
    const mapId = String(options.mapId || "").trim();
    if (encounterGroupId === "" && mapId === "") {
      return {ok: true, authorization: null};
    }
    if (
      mapId !== String(entry.target && entry.target.mapId || "")
      || encounterGroupId === ""
    ) {
      return {ok: false, authorization: null};
    }
    if (encounterGroupId === String(entry.target && entry.target.encounterGroupId || "")) {
      return {
        ok: true,
        authorization: {
          type: "match_target",
          encounterGroupId,
          schemaVersion: 1,
        },
      };
    }
    const leaderAccountId = String(party && party.leaderAccountId || entry.leaderAccountId || "");
    const leader = accountById(data, leaderAccountId);
    const profileState = profileStateForAccount(data, leader);
    const profile = profileState.profile;
    const questId = String(typeof currentProfileQuestId === "function" && profile
      ? currentProfileQuestId(profile)
      : profile && profile.activeQuestId || "").trim();
    const quest = typeof questById === "function" ? questById(questId) : null;
    const objective = questServerFillerObjective(quest, encounterGroupId);
    if (!objective) {
      return {ok: false, authorization: null};
    }
    return {
      ok: true,
      authorization: {
        type: "active_quest_server_fillers",
        questId,
        encounterGroupId,
        minPartyMemberCount: Math.max(1, Math.trunc(Number(objective.minPartyMemberCount || 1))),
        schemaVersion: 1,
      },
    };
  }

  function questServerFillerObjective(quest, encounterGroupId) {
    const objectives = Array.isArray(quest && quest.objectives)
      ? quest.objectives
      : (quest && quest.objective && typeof quest.objective === "object" ? [quest.objective] : []);
    return objectives.find((objective) => (
      objective
      && String(objective.type || "") === "battle_victory"
      && objective.allowServerFillers === true
      && Math.max(0, Math.trunc(Number(objective.minPartyMemberCount || 0))) >= 1
      && String(objective.encounterGroupId || "").trim() === encounterGroupId
    )) || null;
  }

  function publicStateForAccount(data, accountId) {
    const entry = entryForAccount(data, accountId);
    if (!entry) {
      return idleState(data, accountId, "idle");
    }
    const party = data.parties[String(entry.partyId || "")] || partyForAccount(data, accountId);
    if (!party) {
      return idleState(data, accountId, "idle");
    }
    const activeMemberAccountIds = onlinePartyMemberAccountIds(data, party);
    const humanCount = activeMemberAccountIds.length;
    const currentRosterSignature = rosterSignature(activeMemberAccountIds);
    const npcCount = npcCountForEntry(data, entry, party, humanCount);
    if (
      entry.lastHumanCount !== humanCount
      || entry.lastRosterSignature !== currentRosterSignature
      || entry.lastNpcCount !== npcCount
    ) {
      entry.lastHumanCount = humanCount;
      entry.lastRosterSignature = currentRosterSignature;
      entry.lastNpcCount = npcCount;
      entry.updatedAt = isoNow(now);
      bumpRevision();
      emitMatchUpdate(data, entry);
    }
    const full = humanCount >= PARTY_MAX_MEMBERS;
    const npcFillInMs = full || npcCount > 0
      ? 0
      : Math.max(0, entry.joinedAtMs + npcFillDelayMs - Number(now()));
    const targetEntries = waitingEntriesForTarget(data, entry.target);
    const npcMembers = publicNpcMembers(data, entry, party, npcCount);
    return {
      active: !full,
      status: full ? "full" : (npcCount > 0 ? "npc_filled" : "matching"),
      stateRevision,
      queueId: entry.queueId,
      target: clone(entry.target),
      humanCount,
      npcCount,
      emptyCount: Math.max(0, PARTY_MAX_MEMBERS - humanCount - npcCount),
      maxMembers: PARTY_MAX_MEMBERS,
      waitingPlayerCount: targetEntries.reduce((sum, candidate) => (
        sum + onlinePartyMemberAccountIds(
          data,
          data.parties[String(candidate.partyId || "")],
        ).length
      ), 0),
      waitingPartyCount: targetEntries.length,
      npcFillInMs,
      party: publicParty(party, data),
      npcMembers,
      listings: publicListings(data),
      message: full
        ? "真人队伍已满，匹配完成。"
        : (npcCount > 0 ? "系统陪练已临时补位，仍会继续优先匹配真人。" : "正在优先匹配真人队友。"),
      replayed: false,
      schemaVersion: 1,
    };
  }

  function idleState(data, accountId, status = "idle", targetOverride = null) {
    const party = partyForAccount(data, accountId);
    const humanCount = Math.max(1, onlinePartyMemberAccountIds(data, party).length || 1);
    const profileState = profileStateForAccount(data, accountById(data, accountId));
    const hangSession = normalizeHangSession(profileState.profile && profileState.profile.hangSession);
    const target = targetOverride || (hangSession.enabled ? targetFromHangSession(hangSession) : emptyTarget());
    const listings = publicListings(data);
    return {
      active: false,
      status,
      stateRevision,
      queueId: "",
      target,
      humanCount,
      npcCount: 0,
      emptyCount: Math.max(0, PARTY_MAX_MEMBERS - humanCount),
      maxMembers: PARTY_MAX_MEMBERS,
      waitingPlayerCount: listings.reduce((sum, listing) => sum + Math.max(0, Number(listing.humanCount || 0)), 0),
      waitingPartyCount: listings.length,
      npcFillInMs: 0,
      party: party ? publicParty(party, data) : null,
      npcMembers: [],
      listings,
      message: status === "cancelled" ? "匹配已经取消。" : "当前没有进行挂机匹配。",
      replayed: false,
      schemaVersion: 1,
    };
  }

  function prune(data) {
    const onlineAccountIds = new Set(activeOnlinePlayers(data, now)
      .map((account) => String(account && account.accountId || ""))
      .filter(Boolean));
    for (const entry of entriesByQueueIdValues()) {
      const party = data.parties[String(entry.partyId || "")] || null;
      if (!party) {
        entriesByQueueId.delete(entry.queueId);
        bumpRevision();
        continue;
      }
      const leaderAccountId = String(party.leaderAccountId || "");
      const leader = accountById(data, leaderAccountId);
      const leaderProfileState = profileStateForAccount(data, leader);
      const leaderHangSession = normalizeHangSession(
        leaderProfileState.profile && leaderProfileState.profile.hangSession,
      );
      if (
        !leader
        || !onlineAccountIds.has(leaderAccountId)
        || !leaderHangSession.enabled
        || !hangTargetMatchesEntry(leaderHangSession, entry)
      ) {
        entriesByQueueId.delete(entry.queueId);
        bumpRevision();
        continue;
      }
      if (entry.leaderAccountId !== leaderAccountId) {
        entry.leaderAccountId = leaderAccountId;
        entry.updatedAt = isoNow(now);
        bumpRevision();
      }
    }
  }

  function reconcileTarget(data, target) {
    const targetAccountIds = new Set();
    let merged = false;
    let searching = true;
    while (searching) {
      searching = false;
      const candidates = entriesByQueueIdValues()
        .filter((entry) => sameTarget(entry.target, target))
        .filter((entry) => data.parties[String(entry.partyId || "")])
        .sort((left, right) => (
          Number(left.joinedAtMs || 0) - Number(right.joinedAtMs || 0)
          || String(left.queueId).localeCompare(String(right.queueId))
        ));
      outer: for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
        const destination = candidates[leftIndex];
        const destinationParty = data.parties[String(destination.partyId || "")];
        if (!destinationParty) {
          continue;
        }
        const destinationIds = partyMemberAccountIds(destinationParty);
        for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
          const source = candidates[rightIndex];
          const sourceParty = data.parties[String(source.partyId || "")];
          if (!sourceParty) {
            continue;
          }
          const sourceIds = partyMemberAccountIds(sourceParty);
          if (destinationIds.length + sourceIds.length > PARTY_MAX_MEMBERS) {
            continue;
          }
          mergeParties(data, destinationParty, sourceParty);
          entriesByQueueId.delete(source.queueId);
          destination.joinedAtMs = Math.min(destination.joinedAtMs, source.joinedAtMs);
          destination.lastHumanCount = partyMemberAccountIds(destinationParty).length;
          destination.lastRosterSignature = rosterSignature(partyMemberAccountIds(destinationParty));
          destination.updatedAt = isoNow(now);
          for (const accountId of destinationIds.concat(sourceIds)) {
            targetAccountIds.add(accountId);
          }
          bumpRevision();
          emitServiceEvent({
            type: "party.update",
            targetAccountIds: destinationIds.concat(sourceIds),
            party: publicParty(destinationParty, data),
            partyId: destinationParty.partyId,
            removedPartyId: sourceParty.partyId,
            reason: "hang_matchmaking",
          });
          merged = true;
          searching = true;
          break outer;
        }
      }
    }
    return {merged, targetAccountIds: Array.from(targetAccountIds)};
  }

  function mergePreferredQueue(data, destination, source) {
    const destinationParty = data.parties[String(destination.partyId || "")] || null;
    const sourceParty = data.parties[String(source.partyId || "")] || null;
    if (!destinationParty || !sourceParty) {
      return {merged: false, targetAccountIds: []};
    }
    const destinationIds = partyMemberAccountIds(destinationParty);
    const sourceIds = partyMemberAccountIds(sourceParty);
    mergeParties(data, destinationParty, sourceParty);
    entriesByQueueId.delete(source.queueId);
    destination.joinedAtMs = Math.min(destination.joinedAtMs, source.joinedAtMs);
    destination.lastHumanCount = partyMemberAccountIds(destinationParty).length;
    destination.lastRosterSignature = rosterSignature(partyMemberAccountIds(destinationParty));
    destination.updatedAt = isoNow(now);
    bumpRevision();
    const targetAccountIds = destinationIds.concat(sourceIds);
    emitServiceEvent({
      type: "party.update",
      targetAccountIds,
      party: publicParty(destinationParty, data),
      partyId: destinationParty.partyId,
      removedPartyId: sourceParty.partyId,
      reason: "hang_matchmaking_preferred",
    });
    return {merged: true, targetAccountIds};
  }

  function mergeParties(data, destination, source) {
    const destinationIds = partyMemberAccountIds(destination);
    const sourceIds = partyMemberAccountIds(source);
    destination.memberAccountIds = destinationIds.concat(sourceIds);
    const destinationPresence = objectOrEmpty(destination.memberPresence);
    const sourcePresence = objectOrEmpty(source.memberPresence);
    for (const accountId of sourceIds) {
      destinationPresence[accountId] = clone(sourcePresence[accountId] || {
        accountId,
        online: true,
        connectionState: "online",
        offlineSince: null,
        autoKickAt: null,
        updatedAt: isoNow(now),
        schemaVersion: 1,
      });
    }
    destination.memberPresence = destinationPresence;
    destination.updatedAt = isoNow(now);
    authorityRootRecordForMutation(data, "parties")[destination.partyId] = destination;
    delete authorityRootRecordForMutation(data, "parties")[source.partyId];
    const invites = authorityRootRecordForMutation(data, "partyInvites");
    for (const [inviteId, invite] of Object.entries(invites)) {
      if (invite && String(invite.partyId || "") === String(source.partyId || "")) {
        delete invites[inviteId];
      }
    }
  }

  function recordJoinQuest(data, account, profileState, entry) {
    const profile = clone(profileState.profile);
    const party = data.parties[String(entry.partyId || "")] || null;
    const humanCount = partyMemberAccountIds(party).length;
    const event = {
      type: "hang_matchmaking_join",
      target: clone(entry.target),
      progressionZoneId: String(entry.target.progressionZoneId || ""),
      mapId: String(entry.target.mapId || ""),
      encounterGroupId: String(entry.target.encounterGroupId || ""),
      amount: 1,
      humanCount,
      npcCount: 0,
      schemaVersion: 1,
    };
    const progress = recordQuestEventToProfile(profile, event);
    const questMessages = [];
    if (progress.changed && progress.message) {
      questMessages.push(progress.message);
    }
    if (progress.ready && activeQuestAutoClaim(profile)) {
      const claim = claimActiveQuestToProfile(profile);
      if (claim.ok && claim.message) {
        questMessages.push(claim.message);
      }
    }
    if (progress.changed) {
      persistProfileForAccount(data, account, profileState.binding, profile, now);
    }
    return {changed: progress.changed, questMessages};
  }

  function profileStateForAccount(data, account) {
    const accountId = String(account && account.accountId || "");
    const binding = data.profileBindings && data.profileBindings[accountId] || null;
    const profileDoc = binding && binding.playerId && data.profiles
      ? data.profiles[binding.playerId] || null
      : null;
    const profile = profileDoc && profileDoc.profile && typeof profileDoc.profile === "object" && !Array.isArray(profileDoc.profile)
      ? profileDoc.profile
      : null;
    return {binding, profileDoc, profile};
  }

  function authoritativeTarget(hangSession, requestedValue) {
    const requested = objectOrEmpty(requestedValue);
    const authoritativeMapId = String(hangSession.originMapId || "").trim();
    const authoritativeEncounterGroupId = String(hangSession.encounterGroupId || "").trim();
    const requestedMapId = String(requested.mapId || "").trim();
    const requestedEncounterGroupId = String(requested.encounterGroupId || "").trim();
    if (authoritativeMapId === "") {
      return {ok: false, code: "hang_match_target_missing", message: "挂机目标不完整，请重新开始挂机。"};
    }
    if (requestedMapId && requestedMapId !== authoritativeMapId) {
      return {ok: false, code: "hang_match_target_mismatch", message: "匹配地图与当前挂机地点不一致。"};
    }
    if (requestedEncounterGroupId && requestedEncounterGroupId !== authoritativeEncounterGroupId) {
      return {ok: false, code: "hang_match_target_mismatch", message: "匹配目标与当前挂机区域不一致。"};
    }
    const route = routeForHangSession(hangSession);
    if (!route) {
      return {ok: false, code: "hang_match_route_unregistered", message: "当前地点不在正式挂机匹配路线中，请更换练级区。"};
    }
    const progressionZoneId = String(route.progressionZoneId || "");
    const label = labelForProgressionZone(progressionZoneId);
    if (
      (String(requested.progressionZoneId || "").trim() && String(requested.progressionZoneId).trim() !== progressionZoneId)
      || (String(requested.label || "").trim() && String(requested.label).trim() !== label)
    ) {
      return {ok: false, code: "hang_match_target_mismatch", message: "匹配路线与当前挂机地点不一致。"};
    }
    return {
      ok: true,
      target: {
        progressionZoneId,
        mapId: authoritativeMapId,
        encounterGroupId: authoritativeEncounterGroupId,
        label,
        schemaVersion: 1,
      },
    };
  }

  function targetFromHangSession(hangSession) {
    const route = routeForHangSession(hangSession);
    if (!route) {
      return emptyTarget();
    }
    const progressionZoneId = String(route.progressionZoneId || "");
    return {
      progressionZoneId,
      mapId: String(route.mapId || ""),
      encounterGroupId: String(route.encounterGroupId || ""),
      label: labelForProgressionZone(progressionZoneId),
      schemaVersion: 1,
    };
  }

  function routeForHangSession(hangSession) {
    const catalog = petEncounterAuthority && petEncounterAuthority.progressionRoutes;
    const routeEntries = Array.isArray(catalog && catalog.routeEntries) ? catalog.routeEntries : [];
    const mapId = String(hangSession && hangSession.originMapId || "");
    const encounterGroupId = String(hangSession && hangSession.encounterGroupId || "");
    const encounterZoneId = String(hangSession && hangSession.encounterZoneId || "");
    const matches = routeEntries.filter((entry) => (
      entry
      && String(entry.contentType || "") === "wild_training"
      && String(entry.mapId || "") === mapId
      && String(entry.encounterGroupId || "") === encounterGroupId
      && (!encounterZoneId || String(entry.encounterZoneId || "") === encounterZoneId)
    ));
    if (matches.length === 1) {
      return matches[0];
    }
    const zoneIds = new Set(matches.map((entry) => String(entry.progressionZoneId || "")).filter(Boolean));
    return zoneIds.size === 1 ? matches[0] : null;
  }

  function labelForProgressionZone(progressionZoneId) {
    const catalog = petEncounterAuthority && petEncounterAuthority.progressionRoutes;
    const zones = Array.isArray(catalog && catalog.trainingZones) ? catalog.trainingZones : [];
    const zone = zones.find((entry) => String(entry && entry.id || "") === String(progressionZoneId || ""));
    return String(zone && zone.label || progressionZoneId || "").trim().slice(0, 48);
  }

  function emptyTarget() {
    return {
      progressionZoneId: "",
      mapId: "",
      encounterGroupId: "",
      label: "",
      schemaVersion: 1,
    };
  }

  function hangTargetMatchesEntry(hangSession, entry) {
    return (
      String(hangSession.originMapId || "") === String(entry.target.mapId || "")
      && String(hangSession.encounterGroupId || "") === String(entry.target.encounterGroupId || "")
    );
  }

  function entryForAccount(data, accountId) {
    const normalizedAccountId = String(accountId || "");
    return entriesByQueueIdValues().find((entry) => {
      const party = data.parties[String(entry.partyId || "")] || null;
      return partyMemberAccountIds(party).includes(normalizedAccountId);
    }) || null;
  }

  function waitingEntriesForTarget(data, target) {
    return entriesByQueueIdValues()
      .filter((entry) => sameTarget(entry.target, target))
      .filter((entry) => {
        const party = data.parties[String(entry.partyId || "")] || null;
        const count = partyMemberAccountIds(party).length;
        return count > 0 && count < PARTY_MAX_MEMBERS;
      })
      .sort((left, right) => (
        Number(left.joinedAtMs || 0) - Number(right.joinedAtMs || 0)
        || String(left.queueId).localeCompare(String(right.queueId))
      ));
  }

  function publicListing(data, entry) {
    const party = data.parties[String(entry.partyId || "")] || null;
    const humanCount = onlinePartyMemberAccountIds(data, party).length;
    const npcCount = npcCountForEntry(data, entry, party, humanCount);
    const leader = accountById(data, String(party && party.leaderAccountId || ""));
    const leaderProfileState = profileStateForAccount(data, leader);
    const leaderLevel = Math.max(1, Math.trunc(Number(
      leaderProfileState.profile && leaderProfileState.profile.player && leaderProfileState.profile.player.level || 1,
    )));
    return {
      queueId: entry.queueId,
      target: clone(entry.target),
      routeId: String(entry.target && entry.target.progressionZoneId || ""),
      routeLabel: String(entry.target && entry.target.label || ""),
      progressionZoneId: String(entry.target && entry.target.progressionZoneId || ""),
      mapId: String(entry.target && entry.target.mapId || ""),
      encounterGroupId: String(entry.target && entry.target.encounterGroupId || ""),
      leaderName: String(leader && (leader.displayName || leader.username) || ""),
      leaderLevel,
      humanCount,
      npcCount,
      emptyCount: Math.max(0, PARTY_MAX_MEMBERS - humanCount - npcCount),
      maxMembers: PARTY_MAX_MEMBERS,
      leader: {
        displayName: String(leader && (leader.displayName || leader.username) || ""),
        level: leaderLevel,
        schemaVersion: 1,
      },
      status: npcCount > 0 ? "npc_filled" : "matching",
      schemaVersion: 1,
    };
  }

  function publicListings(data) {
    return entriesByQueueIdValues()
      .filter((entry) => {
        const party = data.parties[String(entry && entry.partyId || "")] || null;
        const count = partyMemberAccountIds(party).length;
        return count > 0 && count < PARTY_MAX_MEMBERS;
      })
      .sort((left, right) => (
        Number(left.joinedAtMs || 0) - Number(right.joinedAtMs || 0)
        || String(left.queueId).localeCompare(String(right.queueId))
      ))
      .slice(0, 24)
      .map((entry) => publicListing(data, entry));
  }

  function npcCountForEntry(data, entry, partyValue = null, humanCountOverride = null) {
    const party = partyValue || data.parties[String(entry.partyId || "")] || null;
    const humanCount = humanCountOverride === null
      ? onlinePartyMemberAccountIds(data, party).length
      : Math.max(0, Math.trunc(Number(humanCountOverride || 0)));
    if (humanCount <= 0 || humanCount >= PARTY_MAX_MEMBERS) {
      return 0;
    }
    return Number(now()) >= Number(entry.joinedAtMs || 0) + npcFillDelayMs
      ? PARTY_MAX_MEMBERS - humanCount
      : 0;
  }

  function publicNpcMembers(data, entry, party, count) {
    return matchBotsForEntry(data, entry, party, count).map((bot) => ({
      npcId: bot.npcId,
      displayName: bot.displayName,
      level: bot.level,
      controller: "server_ai",
      matchmakingNpc: true,
      rewardEligible: false,
      schemaVersion: 1,
    }));
  }

  function matchBotsForEntry(data, entry, party, count) {
    const botCount = Math.max(0, Math.min(PARTY_MAX_MEMBERS - 1, Math.trunc(Number(count || 0))));
    if (botCount <= 0) {
      return [];
    }
    const leader = accountById(data, String(party && party.leaderAccountId || entry.leaderAccountId || ""));
    const leaderParticipant = leader ? battleParticipantSnapshot(data, leader, "ally") : null;
    const snapshot = objectOrEmpty(leaderParticipant && leaderParticipant.teamSnapshot);
    const player = objectOrEmpty(snapshot.player);
    const activePet = (Array.isArray(snapshot.battlePets) ? snapshot.battlePets : [])
      .find((pet) => pet && (pet.activeInBattle || String(pet.state || "") === "battle")) || null;
    const result = [];
    for (let index = 0; index < botCount; index += 1) {
      const scale = 0.9 + index * 0.03;
      const npcId = `${entry.queueId}_npc_${index + 1}`;
      result.push({
        npcId,
        displayName: MATCHMAKING_NPC_NAMES[index % MATCHMAKING_NPC_NAMES.length],
        level: Math.max(1, Math.trunc(Number(player.level || snapshot.playerLevel || 1))),
        hp: scaledPositive(player.hp || player.maxHp, scale, 100),
        maxHp: scaledPositive(player.maxHp || player.hp, scale, 100),
        attack: scaledPositive(player.attack, scale, 20),
        defense: scaledPositive(player.defense, scale, 10),
        quick: scaledPositive(player.quick, scale, 10),
        elements: clone(objectOrEmpty(player.elements)),
        pet: {
          petId: `${npcId}_pet`,
          displayName: String(activePet && activePet.name || "陪练乌力"),
          formId: String(activePet && (activePet.formId || activePet.speciesId) || "wuli_normal_orange_fire10"),
          speciesId: String(activePet && (activePet.speciesId || activePet.formId) || "wuli_normal_orange_fire10"),
          level: Math.max(1, Math.trunc(Number(activePet && activePet.level || player.level || 1))),
          hp: scaledPositive(activePet && (activePet.hp || activePet.maxHp) || player.hp || player.maxHp, scale, 80),
          maxHp: scaledPositive(activePet && (activePet.maxHp || activePet.hp) || player.maxHp || player.hp, scale, 80),
          attack: scaledPositive(activePet && activePet.attack || player.attack, scale, 16),
          defense: scaledPositive(activePet && activePet.defense || player.defense, scale, 8),
          quick: scaledPositive(activePet && activePet.quick || player.quick, scale, 8),
          elements: clone(objectOrEmpty(activePet && activePet.elements || player.elements)),
          activeSkillIds: stringArray(activePet && activePet.activeSkillIds),
          petSkillSlots: stringArray(activePet && activePet.petSkillSlots),
          forgottenSkillIds: stringArray(activePet && activePet.forgottenSkillIds),
          passiveSkillIds: stringArray(activePet && activePet.passiveSkillIds),
          accountId: "",
          ownerAccountId: "",
          partnerId: "",
          controller: "server_ai",
          matchmakingNpc: true,
          rewardEligible: false,
          schemaVersion: 1,
        },
        accountId: "",
        ownerAccountId: "",
        partnerId: "",
        controller: "server_ai",
        matchmakingNpc: true,
        rewardEligible: false,
        schemaVersion: 1,
      });
    }
    return result;
  }

  function emitMatchUpdate(data, entry, extraTargetAccountIds = []) {
    const party = data.parties[String(entry.partyId || "")] || null;
    const targetAccountIds = Array.from(new Set(
      partyMemberAccountIds(party).concat(extraTargetAccountIds).filter(Boolean),
    ));
    emitServiceEvent({
      type: "hang.match_update",
      targetAccountIds,
      queueId: entry.queueId,
      stateRevision,
    });
  }

  function rememberReceipt(key, intentFingerprint) {
    if (!key) {
      return;
    }
    idempotencyReceipts.delete(key);
    idempotencyReceipts.set(key, {
      fingerprint: String(intentFingerprint || ""),
      createdAtMs: Number(now()),
    });
    while (idempotencyReceipts.size > IDEMPOTENCY_RECEIPT_LIMIT) {
      const oldest = idempotencyReceipts.keys().next().value;
      idempotencyReceipts.delete(oldest);
    }
  }

  function bumpRevision() {
    stateRevision = stateRevision >= Number.MAX_SAFE_INTEGER ? 1 : stateRevision + 1;
  }

  function entriesByQueueIdValues() {
    return Array.from(entriesByQueueId.values());
  }

  function runtimeMutation(invoke) {
    const liveEntries = entriesByQueueId;
    const liveReceipts = idempotencyReceipts;
    const liveRevision = stateRevision;
    const baselineEntries = cloneMap(liveEntries);
    const baselineReceipts = cloneMap(liveReceipts);
    const workingEntries = cloneMap(baselineEntries);
    const workingReceipts = cloneMap(baselineReceipts);
    entriesByQueueId = workingEntries;
    idempotencyReceipts = workingReceipts;
    let result;
    let workingRevision = liveRevision;
    try {
      result = invoke();
      workingRevision = stateRevision;
    } finally {
      entriesByQueueId = liveEntries;
      idempotencyReceipts = liveReceipts;
      stateRevision = liveRevision;
    }
    if (!result || result.ok !== false) {
      const entryDelta = mapDelta(baselineEntries, workingEntries, true);
      const receiptDelta = mapDelta(baselineReceipts, workingReceipts, false);
      const revisionDelta = Math.max(0, workingRevision - liveRevision);
      publishRuntimeEffect(() => {
        // A durable request may await storage while GET/state advances NPC
        // timers, roster signatures, pruning, or revisions on the live maps.
        // Publish only this mutation's delta onto that latest live state;
        // replacing the whole request-private snapshot would resurrect pruned
        // queues and roll revisions backwards.
        entriesByQueueId = applyMapDelta(entriesByQueueId, entryDelta, true);
        idempotencyReceipts = applyMapDelta(idempotencyReceipts, receiptDelta, false);
        bumpRevisionBy(revisionDelta);
        reconcilePublishedRuntimeState(load());
      });
    }
    return result;
  }

  function reconcilePublishedRuntimeState(data) {
    prune(data);
    for (const entry of entriesByQueueIdValues()) {
      const party = data.parties[String(entry.partyId || "")] || null;
      if (!party) {
        continue;
      }
      const memberAccountIds = onlinePartyMemberAccountIds(data, party);
      const humanCount = memberAccountIds.length;
      const roster = rosterSignature(memberAccountIds);
      const npcCount = npcCountForEntry(data, entry, party);
      if (
        entry.lastHumanCount === humanCount
        && entry.lastRosterSignature === roster
        && entry.lastNpcCount === npcCount
      ) {
        continue;
      }
      entry.lastHumanCount = humanCount;
      entry.lastRosterSignature = roster;
      entry.lastNpcCount = npcCount;
      entry.updatedAt = isoNow(now);
      bumpRevision();
      emitMatchUpdate(data, entry);
    }
  }

  function bumpRevisionBy(amount) {
    const count = Math.max(0, Math.trunc(Number(amount || 0)));
    for (let index = 0; index < count; index += 1) {
      bumpRevision();
    }
  }

  function onlinePartyMemberAccountIds(data, party) {
    const onlineAccountIds = new Set(activeOnlinePlayers(data, now)
      .map((account) => String(account && account.accountId || ""))
      .filter(Boolean));
    return partyMemberAccountIds(party).filter((accountId) => onlineAccountIds.has(accountId));
  }

  return {
    getState,
    join,
    cancel,
    cancelAfterHangStop,
    restoreCommittedJoinReplay,
    matchmakingContextForParty,
    runtimeDiagnostics() {
      return {
        queueCount: entriesByQueueId.size,
        receiptCount: idempotencyReceipts.size,
        stateRevision,
        schemaVersion: 1,
      };
    },
  };
}

function sameTarget(leftValue, rightValue) {
  const left = objectOrEmpty(leftValue);
  const right = objectOrEmpty(rightValue);
  return (
    String(left.progressionZoneId || "") === String(right.progressionZoneId || "")
    && String(left.mapId || "") === String(right.mapId || "")
    && String(left.encounterGroupId || "") === String(right.encounterGroupId || "")
  );
}

function partyMemberAccountIds(party) {
  if (!party || !Array.isArray(party.memberAccountIds)) {
    return [];
  }
  return Array.from(new Set(party.memberAccountIds.map((value) => String(value || "")).filter(Boolean)));
}

function rosterSignature(accountIds) {
  return Array.from(new Set((Array.isArray(accountIds) ? accountIds : [])
    .map((value) => String(value || ""))
    .filter(Boolean)))
    .sort((left, right) => left.localeCompare(right))
    .join("|");
}

function cloneMap(source) {
  return new Map(Array.from(source instanceof Map ? source.entries() : [])
    .map(([key, value]) => [key, structuredClone(value)]));
}

function mapDelta(before, after, mergeObjectValues) {
  const deletes = [];
  const upserts = [];
  for (const key of before.keys()) {
    if (!after.has(key)) {
      deletes.push({key, value: structuredClone(before.get(key))});
    }
  }
  for (const [key, nextValue] of after.entries()) {
    const hadValue = before.has(key);
    const previousValue = hadValue ? before.get(key) : undefined;
    if (hadValue && fingerprint(previousValue) === fingerprint(nextValue)) {
      continue;
    }
    upserts.push({
      key,
      isNew: !hadValue,
      value: structuredClone(nextValue),
      patch: mergeObjectValues && hadValue
        ? shallowObjectDelta(previousValue, nextValue)
        : null,
    });
  }
  return {deletes, upserts};
}

function shallowObjectDelta(beforeValue, afterValue) {
  const before = objectOrEmpty(beforeValue);
  const after = objectOrEmpty(afterValue);
  const deletes = [];
  const upserts = {};
  for (const key of Object.keys(before)) {
    if (!Object.hasOwn(after, key)) {
      deletes.push(key);
    }
  }
  for (const [key, value] of Object.entries(after)) {
    if (!Object.hasOwn(before, key) || fingerprint(before[key]) !== fingerprint(value)) {
      upserts[key] = structuredClone(value);
    }
  }
  return {deletes, upserts};
}

function applyMapDelta(currentValue, delta, mergeObjectValues) {
  const current = currentValue instanceof Map ? currentValue : new Map();
  const next = cloneMap(current);
  for (const removal of Array.isArray(delta && delta.deletes) ? delta.deletes : []) {
    const key = removal && Object.hasOwn(removal, "key") ? removal.key : removal;
    if (
      mergeObjectValues
      || !next.has(key)
      || fingerprint(next.get(key)) === fingerprint(removal && removal.value)
    ) {
      next.delete(key);
    }
  }
  for (const upsert of Array.isArray(delta && delta.upserts) ? delta.upserts : []) {
    if (!upsert || !Object.hasOwn(upsert, "key")) {
      continue;
    }
    if (mergeObjectValues && !upsert.isNew) {
      // If a concurrent prune removed an existing queue, an older request must
      // not resurrect it merely because that request changed derived fields.
      if (!next.has(upsert.key)) {
        continue;
      }
      const merged = {...objectOrEmpty(next.get(upsert.key))};
      const patch = objectOrEmpty(upsert.patch);
      for (const key of Array.isArray(patch.deletes) ? patch.deletes : []) {
        delete merged[key];
      }
      for (const [key, value] of Object.entries(objectOrEmpty(patch.upserts))) {
        merged[key] = structuredClone(value);
      }
      next.set(upsert.key, merged);
      continue;
    }
    next.set(upsert.key, structuredClone(upsert.value));
  }
  return next;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringArray(value) {
  return Array.isArray(value) ? value.map((entry) => String(entry || "")).filter(Boolean) : [];
}

function scaledPositive(value, scale, fallback) {
  const numeric = Number(value);
  const base = Number.isFinite(numeric) && numeric > 0 ? numeric : Number(fallback || 1);
  return Math.max(1, Math.trunc(base * Math.max(0.1, Number(scale || 1))));
}

function positiveInteger(value, fallback) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Math.max(0, Math.trunc(Number(fallback || 0)));
}

function normalizeIdempotencyKey(value) {
  return String(value || "").trim().slice(0, 128);
}

function requestedTargetFingerprint(value) {
  const target = objectOrEmpty(value);
  return {
    progressionZoneId: String(target.progressionZoneId || "").trim(),
    mapId: String(target.mapId || "").trim(),
    encounterGroupId: String(target.encounterGroupId || "").trim(),
    label: String(target.label || "").trim(),
  };
}

function fingerprint(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => fingerprint(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${fingerprint(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

module.exports = {
  DEFAULT_NPC_FILL_DELAY_MS,
  createHangMatchmakingDomain,
};
