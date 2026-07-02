"use strict";

function createPartyDomain(ctx) {
  const {
    PARTY_MAX_MEMBERS,
    accountById,
    createPartyForLeader,
    emitServiceEvent,
    fail,
    isoNow,
    load,
    normalizeUsername,
    now,
    ok,
    partyForAccount,
    partyStatePayload,
    publicIncomingPartyInvites,
    publicParty,
    publicPartyForAccount,
    publicPartyInvite,
    randomId,
    resolveSession,
    save,
  } = ctx;

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

  return {
    getPartyState,
    inviteToParty,
    applyToParty,
    acceptPartyInvite,
    declinePartyInvite,
    leaveParty,
  };
}

module.exports = {createPartyDomain};
