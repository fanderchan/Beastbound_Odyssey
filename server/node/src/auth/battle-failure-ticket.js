"use strict";

const crypto = require("node:crypto");

const BATTLE_FAILURE_TICKET_FIELD = "battleFailureTicket";
const BATTLE_FAILURE_TICKET_KIND = "battle_owner_failure_ticket";
const BATTLE_FAILURE_TICKET_SCHEMA_VERSION = 1;
const BATTLE_ENCOUNTER_RECOVERY_KIND = "encounter_stone_slot";
const BATTLE_FAILURE_TICKET_ID_PATTERN = /^battle_failure_[a-f0-9]{32}$/;
const BATTLE_FAILURE_MAX_PARTICIPANTS = 10;

function battleFailureTicketAdmission(data, accountIds, options = {}) {
  const participantAccountIds = uniqueStrings(accountIds).slice(0, BATTLE_FAILURE_MAX_PARTICIPANTS);
  if (participantAccountIds.length <= 0) {
    return failure("battle_failure_ticket_participant_missing", "缺少可恢复的参战账号。");
  }
  const nowMs = nowValue(options.now);
  for (const accountId of participantAccountIds) {
    const state = battleFailureTicketStateForAccount(data, accountId);
    if (!state.ok) {
      return state;
    }
    if (state.ticket) {
      return failure(
        "battle_interruption_pending",
        "上一次中断战斗还没有确认，请先完成恢复。",
      );
    }
    if (activeSessionsForAccount(data, accountId, nowMs).length <= 0) {
      return failure(
        "battle_failure_ticket_session_missing",
        "参战成员的登录状态已经变化，请重新组队后再试。",
      );
    }
  }
  return {ok: true, participantAccountIds};
}

function installBattleFailureTickets(data, room, options = {}) {
  const roomId = requiredText(room && room.roomId, 160);
  const mode = requiredText(room && room.mode, 40);
  const startedAt = requiredTimestamp(room && (room.createdAt || room.updatedAt));
  const admission = battleFailureTicketAdmission(
    data,
    room && room.participantAccountIds,
    options,
  );
  if (!admission.ok) {
    return admission;
  }
  if (!roomId || !mode || !startedAt) {
    return failure("battle_failure_ticket_room_invalid", "战斗恢复状态暂时不可用，请重新发起。");
  }
  const encounterRecoveryByAccountId = objectOrEmpty(options.encounterRecoveryByAccountId);
  const nowMs = nowValue(options.now);
  const storeSession = typeof options.storeSession === "function"
    ? options.storeSession
    : defaultStoreSession;
  const plans = [];
  for (const accountId of admission.participantAccountIds) {
    const recoveryRead = normalizeEncounterRecovery(encounterRecoveryByAccountId[accountId]);
    if (!recoveryRead.ok) {
      return recoveryRead;
    }
    const ticket = {
      kind: BATTLE_FAILURE_TICKET_KIND,
      ticketId: battleFailureTicketId(roomId, accountId),
      roomId,
      mode,
      accountId,
      participantAccountIds: admission.participantAccountIds.slice(),
      startedAt,
      encounterRecovery: recoveryRead.value,
      schemaVersion: BATTLE_FAILURE_TICKET_SCHEMA_VERSION,
    };
    plans.push({ticket, sessions: activeSessionsForAccount(data, accountId, nowMs)});
  }
  for (const plan of plans) {
    for (const session of plan.sessions) {
      storeSession(data, session.sessionId, {
        ...session,
        [BATTLE_FAILURE_TICKET_FIELD]: plan.ticket,
      });
    }
  }
  return {
    ok: true,
    changed: plans.some((plan) => plan.sessions.length > 0),
    tickets: plans.map((plan) => plan.ticket),
  };
}

function clearBattleFailureTickets(data, roomIdValue, accountIds, options = {}) {
  const roomId = requiredText(roomIdValue, 160);
  if (!roomId) {
    return failure("battle_failure_ticket_room_invalid", "战斗恢复状态暂时不可用，请稍后重试。");
  }
  const accountIdSet = new Set(uniqueStrings(accountIds));
  const storeSession = typeof options.storeSession === "function"
    ? options.storeSession
    : defaultStoreSession;
  let cleared = 0;
  for (const session of Object.values(objectOrEmpty(data && data.sessions))) {
    const accountId = String(session && session.accountId || "");
    if (!session || !accountIdSet.has(accountId)) {
      continue;
    }
    const read = battleFailureTicketFromSession(session);
    if (!read.ok) {
      return read;
    }
    if (!read.ticket || read.ticket.roomId !== roomId) {
      continue;
    }
    const nextSession = {...session};
    delete nextSession[BATTLE_FAILURE_TICKET_FIELD];
    storeSession(data, session.sessionId, nextSession);
    cleared += 1;
  }
  return {ok: true, changed: cleared > 0, cleared};
}

function battleFailureTicketStateForAccount(data, accountIdValue) {
  const accountId = requiredText(accountIdValue, 160);
  if (!accountId) {
    return failure("battle_failure_ticket_account_invalid", "战斗恢复状态暂时不可用，请稍后重试。");
  }
  const ticketById = new Map();
  const sessionIds = [];
  for (const session of Object.values(objectOrEmpty(data && data.sessions))) {
    if (!session || String(session.accountId || "") !== accountId) {
      continue;
    }
    const read = battleFailureTicketFromSession(session);
    if (!read.ok) {
      return read;
    }
    if (!read.ticket) {
      continue;
    }
    if (read.ticket.accountId !== accountId) {
      return failure("battle_failure_ticket_account_mismatch", "战斗恢复状态异常，请联系GM处理。");
    }
    const signature = JSON.stringify(read.ticket);
    const existing = ticketById.get(read.ticket.ticketId);
    if (existing && existing.signature !== signature) {
      return failure("battle_failure_ticket_conflict", "战斗恢复状态冲突，请联系GM处理。");
    }
    ticketById.set(read.ticket.ticketId, {ticket: read.ticket, signature});
    sessionIds.push(String(session.sessionId || ""));
  }
  if (ticketById.size > 1) {
    return failure("battle_failure_ticket_conflict", "战斗恢复状态冲突，请联系GM处理。");
  }
  const first = ticketById.values().next();
  return {
    ok: true,
    ticket: first.done ? null : first.value.ticket,
    sessionIds: sessionIds.filter(Boolean),
  };
}

function battleFailureTicketFromSession(session) {
  if (
    !session
    || typeof session !== "object"
    || Array.isArray(session)
    || !Object.prototype.hasOwnProperty.call(session, BATTLE_FAILURE_TICKET_FIELD)
  ) {
    return {ok: true, ticket: null};
  }
  const raw = session[BATTLE_FAILURE_TICKET_FIELD];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return failure("battle_failure_ticket_invalid", "战斗恢复状态异常，请联系GM处理。");
  }
  const ticketId = requiredText(raw.ticketId, 160);
  const roomId = requiredText(raw.roomId, 160);
  const mode = requiredText(raw.mode, 40);
  const accountId = requiredText(raw.accountId, 160);
  const participantAccountIds = uniqueStrings(raw.participantAccountIds).slice(0, BATTLE_FAILURE_MAX_PARTICIPANTS);
  const startedAt = requiredTimestamp(raw.startedAt);
  const recoveryRead = normalizeEncounterRecovery(raw.encounterRecovery);
  if (
    String(raw.kind || "") !== BATTLE_FAILURE_TICKET_KIND
    || !BATTLE_FAILURE_TICKET_ID_PATTERN.test(ticketId)
    || !roomId
    || !mode
    || !accountId
    || participantAccountIds.length <= 0
    || !participantAccountIds.includes(accountId)
    || !startedAt
    || !recoveryRead.ok
    || Number(raw.schemaVersion || 0) !== BATTLE_FAILURE_TICKET_SCHEMA_VERSION
  ) {
    return failure("battle_failure_ticket_invalid", "战斗恢复状态异常，请联系GM处理。");
  }
  return {
    ok: true,
    ticket: {
      kind: BATTLE_FAILURE_TICKET_KIND,
      ticketId,
      roomId,
      mode,
      accountId,
      participantAccountIds,
      startedAt,
      encounterRecovery: recoveryRead.value,
      schemaVersion: BATTLE_FAILURE_TICKET_SCHEMA_VERSION,
    },
  };
}

function encounterRecoveryForAuthorization(data, authorization) {
  if (!authorization || String(authorization.mode || "") !== "timed") {
    return null;
  }
  const accountId = requiredText(authorization.accountId, 160);
  const binding = objectOrEmpty(data && data.profileBindings)[accountId] || null;
  const playerId = requiredText(binding && binding.playerId, 160);
  const sourceId = requiredText(authorization.sourceId, 200);
  const previousConsumedSlot = nonNegativeSafeInteger(authorization.previousConsumedSlot);
  const consumedSlot = nonNegativeSafeInteger(authorization.slot);
  if (
    !accountId
    || !playerId
    || !sourceId
    || previousConsumedSlot < 0
    || consumedSlot <= previousConsumedSlot
  ) {
    return null;
  }
  return {
    kind: BATTLE_ENCOUNTER_RECOVERY_KIND,
    playerId,
    sourceId,
    previousConsumedSlot,
    consumedSlot,
    schemaVersion: 1,
  };
}

function recoverBattleEncounterSlot(data, ticketValue, options = {}) {
  const ticketRead = normalizeTicketValue(ticketValue);
  if (!ticketRead.ok) {
    return ticketRead;
  }
  const ticket = ticketRead.ticket;
  const recovery = ticket.encounterRecovery;
  if (!recovery) {
    return {ok: true, refunded: false, reason: "not_applicable"};
  }
  const accountById = typeof options.accountById === "function"
    ? options.accountById
    : defaultAccountById;
  const normalizeHangSession = typeof options.normalizeHangSession === "function"
    ? options.normalizeHangSession
    : null;
  const persistProfileForAccount = typeof options.persistProfileForAccount === "function"
    ? options.persistProfileForAccount
    : null;
  if (!normalizeHangSession || !persistProfileForAccount) {
    return failure("battle_failure_ticket_recovery_unavailable", "战斗补偿暂时不可用，请稍后重试。");
  }
  const account = accountById(data, ticket.accountId);
  const binding = objectOrEmpty(data && data.profileBindings)[ticket.accountId] || null;
  if (
    !account
    || !binding
    || String(binding.playerId || "") !== recovery.playerId
  ) {
    return {ok: true, refunded: false, reason: "character_changed"};
  }
  const profileDoc = objectOrEmpty(data && data.profiles)[recovery.playerId] || null;
  const rawProfile = profileDoc && profileDoc.profile;
  if (!rawProfile || typeof rawProfile !== "object" || Array.isArray(rawProfile)) {
    return failure("battle_failure_ticket_profile_missing", "角色资料暂时不可用，请稍后重试。");
  }
  const hangSession = normalizeHangSession(rawProfile.hangSession);
  if (
    !hangSession
    || hangSession.enabled !== true
    || String(hangSession.mode || "") !== "encounter_stone"
    || String(hangSession.encounterActivationId || "") !== recovery.sourceId
  ) {
    return {ok: true, refunded: false, reason: "activation_changed"};
  }
  if (Number(hangSession.encounterConsumedSlot) !== recovery.consumedSlot) {
    return {ok: true, refunded: false, reason: "slot_advanced"};
  }
  const profile = cloneJson(rawProfile);
  profile.hangSession = {
    ...objectOrEmpty(profile.hangSession),
    ...hangSession,
    encounterConsumedSlot: recovery.previousConsumedSlot,
  };
  const persisted = persistProfileForAccount(data, account, binding, profile, options.now);
  return {
    ok: true,
    refunded: true,
    reason: "refunded",
    profileRevision: Math.max(0, Number(persisted && persisted.binding && persisted.binding.profileRevision || 0)),
  };
}

function publicBattleInterruption(ticketValue) {
  const read = normalizeTicketValue(ticketValue);
  if (!read.ok || !read.ticket) {
    return null;
  }
  const ticket = read.ticket;
  return {
    kind: "battle_owner_interruption",
    ticketId: ticket.ticketId,
    roomId: ticket.roomId,
    mode: ticket.mode,
    startedAt: ticket.startedAt,
    encounterReturnAvailable: Boolean(ticket.encounterRecovery),
    message: "战斗因服务器切换中断，本场不计胜负；确认后可以重新发起。",
    schemaVersion: 1,
  };
}

function sessionHasBattleFailureTicket(session) {
  return Boolean(
    session
    && typeof session === "object"
    && !Array.isArray(session)
    && Object.prototype.hasOwnProperty.call(session, BATTLE_FAILURE_TICKET_FIELD),
  );
}

function normalizeTicketValue(value) {
  return battleFailureTicketFromSession({[BATTLE_FAILURE_TICKET_FIELD]: value});
}

function normalizeEncounterRecovery(value) {
  if (value === undefined || value === null) {
    return {ok: true, value: null};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return failure("battle_failure_ticket_recovery_invalid", "战斗补偿状态异常，请联系GM处理。");
  }
  const playerId = requiredText(value.playerId, 160);
  const sourceId = requiredText(value.sourceId, 200);
  const previousConsumedSlot = nonNegativeSafeInteger(value.previousConsumedSlot);
  const consumedSlot = nonNegativeSafeInteger(value.consumedSlot);
  if (
    String(value.kind || "") !== BATTLE_ENCOUNTER_RECOVERY_KIND
    || !playerId
    || !sourceId
    || previousConsumedSlot < 0
    || consumedSlot <= previousConsumedSlot
    || Number(value.schemaVersion || 0) !== 1
  ) {
    return failure("battle_failure_ticket_recovery_invalid", "战斗补偿状态异常，请联系GM处理。");
  }
  return {
    ok: true,
    value: {
      kind: BATTLE_ENCOUNTER_RECOVERY_KIND,
      playerId,
      sourceId,
      previousConsumedSlot,
      consumedSlot,
      schemaVersion: 1,
    },
  };
}

function activeSessionsForAccount(data, accountId, nowMs) {
  return Object.values(objectOrEmpty(data && data.sessions))
    .filter((session) => (
      session
      && String(session.accountId || "") === accountId
      && !session.revokedAt
      && Date.parse(String(session.expiresAt || "")) > nowMs
      && requiredText(session.sessionId, 200)
    ));
}

function battleFailureTicketId(roomId, accountId) {
  const digest = crypto.createHash("sha256")
    .update(`${roomId}\u0000${accountId}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `battle_failure_${digest}`;
}

function uniqueStrings(value) {
  return Array.from(new Set((Array.isArray(value) ? value : [])
    .map((entry) => requiredText(entry, 160))
    .filter(Boolean)));
}

function requiredText(value, maxLength) {
  const text = String(value || "").trim();
  return text !== "" && text.length <= maxLength ? text : "";
}

function requiredTimestamp(value) {
  const text = String(value || "").trim();
  return text && Number.isFinite(Date.parse(text)) ? text : "";
}

function nonNegativeSafeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : -1;
}

function nowValue(now) {
  const value = typeof now === "function" ? Number(now()) : Number(now);
  return Number.isFinite(value) ? value : Date.now();
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultStoreSession(data, sessionId, session) {
  data.sessions[String(sessionId || "")] = session;
}

function defaultAccountById(data, accountId) {
  return Object.values(objectOrEmpty(data && data.accounts))
    .find((account) => account && String(account.accountId || "") === String(accountId || "")) || null;
}

function failure(code, message) {
  return {ok: false, code, message};
}

module.exports = {
  BATTLE_FAILURE_TICKET_FIELD,
  BATTLE_FAILURE_TICKET_KIND,
  battleFailureTicketAdmission,
  battleFailureTicketFromSession,
  battleFailureTicketStateForAccount,
  clearBattleFailureTickets,
  encounterRecoveryForAuthorization,
  installBattleFailureTickets,
  publicBattleInterruption,
  recoverBattleEncounterSlot,
  sessionHasBattleFailureTicket,
};
