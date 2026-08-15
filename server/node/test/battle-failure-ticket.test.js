"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  battleFailureTicketAdmission,
  battleFailureTicketStateForAccount,
  clearBattleFailureTickets,
  encounterRecoveryForAuthorization,
  installBattleFailureTickets,
  publicBattleInterruption,
  recoverBattleEncounterSlot,
  sessionHasBattleFailureTicket,
} = require("../src/auth/battle-failure-ticket");

const NOW_MS = Date.parse("2026-08-15T04:00:00.000Z");

function fixtureData() {
  return {
    accounts: {
      alice: {accountId: "account_alice", username: "alice"},
      bob: {accountId: "account_bob", username: "bob"},
    },
    sessions: {
      session_alice_current: {
        sessionId: "session_alice_current",
        accountId: "account_alice",
        expiresAt: "2026-08-22T04:00:00.000Z",
        revokedAt: null,
      },
      session_alice_second: {
        sessionId: "session_alice_second",
        accountId: "account_alice",
        expiresAt: "2026-08-22T04:00:00.000Z",
        revokedAt: null,
      },
      session_bob_current: {
        sessionId: "session_bob_current",
        accountId: "account_bob",
        expiresAt: "2026-08-22T04:00:00.000Z",
        revokedAt: null,
      },
    },
    profileBindings: {
      account_alice: {accountId: "account_alice", playerId: "player_alice", profileRevision: 4},
    },
    profiles: {
      player_alice: {
        playerId: "player_alice",
        accountId: "account_alice",
        profile: {
          hangSession: {
            enabled: true,
            mode: "encounter_stone",
            encounterActivationId: "encounter_activation_alpha",
            encounterConsumedSlot: 3,
          },
        },
      },
    },
  };
}

function room() {
  return {
    roomId: "battle_room_failure_contract",
    mode: "duel",
    participantAccountIds: ["account_alice", "account_bob"],
    createdAt: "2026-08-15T04:00:00.000Z",
  };
}

test("battle failure tickets are duplicated across active sessions and project no participant identities", () => {
  const data = fixtureData();
  const installed = installBattleFailureTickets(data, room(), {now: () => NOW_MS});
  assert.equal(installed.ok, true);
  assert.equal(installed.tickets.length, 2);
  assert.equal(sessionHasBattleFailureTicket(data.sessions.session_alice_current), true);
  assert.equal(sessionHasBattleFailureTicket(data.sessions.session_alice_second), true);
  assert.equal(sessionHasBattleFailureTicket(data.sessions.session_bob_current), true);

  const alice = battleFailureTicketStateForAccount(data, "account_alice");
  assert.equal(alice.ok, true);
  assert.equal(alice.sessionIds.length, 2);
  assert.equal(alice.ticket.roomId, room().roomId);
  const interruption = publicBattleInterruption(alice.ticket);
  assert.equal(interruption.kind, "battle_owner_interruption");
  assert.equal(interruption.roomId, room().roomId);
  assert.equal(Object.hasOwn(interruption, "participantAccountIds"), false);
  assert.equal(Object.hasOwn(interruption, "accountId"), false);

  const blocked = battleFailureTicketAdmission(data, ["account_alice"], {now: () => NOW_MS});
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "battle_interruption_pending");
});

test("ticket cleanup clears only the completed room, including revoked session copies", () => {
  const data = fixtureData();
  assert.equal(installBattleFailureTickets(data, room(), {now: () => NOW_MS}).ok, true);
  data.sessions.session_alice_second = {
    ...data.sessions.session_alice_second,
    revokedAt: "2026-08-15T04:00:01.000Z",
  };

  const cleared = clearBattleFailureTickets(
    data,
    room().roomId,
    ["account_alice"],
  );
  assert.equal(cleared.ok, true);
  assert.equal(cleared.cleared, 2);
  assert.equal(sessionHasBattleFailureTicket(data.sessions.session_alice_current), false);
  assert.equal(sessionHasBattleFailureTicket(data.sessions.session_alice_second), false);
  assert.equal(sessionHasBattleFailureTicket(data.sessions.session_bob_current), true);
});

test("encounter recovery refunds only an exact character, activation, and consumed slot", () => {
  const authorization = {
    mode: "timed",
    accountId: "account_alice",
    sourceId: "encounter_activation_alpha",
    previousConsumedSlot: 2,
    slot: 3,
  };
  const data = fixtureData();
  const recovery = encounterRecoveryForAuthorization(data, authorization);
  assert.deepEqual(recovery, {
    kind: "encounter_stone_slot",
    playerId: "player_alice",
    sourceId: "encounter_activation_alpha",
    previousConsumedSlot: 2,
    consumedSlot: 3,
    schemaVersion: 1,
  });
  const installed = installBattleFailureTickets(data, room(), {
    now: () => NOW_MS,
    encounterRecoveryByAccountId: {account_alice: recovery},
  });
  assert.equal(installed.ok, true);
  const ticket = battleFailureTicketStateForAccount(data, "account_alice").ticket;
  const exact = recoverBattleEncounterSlot(data, ticket, {
    now: () => NOW_MS,
    accountById: (state, accountId) => Object.values(state.accounts).find((account) => account.accountId === accountId),
    normalizeHangSession: (value) => ({...value}),
    persistProfileForAccount: (state, account, binding, profile) => {
      state.profiles[binding.playerId] = {...state.profiles[binding.playerId], profile};
      binding.profileRevision += 1;
      return {binding};
    },
  });
  assert.equal(exact.ok, true);
  assert.equal(exact.refunded, true);
  assert.equal(data.profiles.player_alice.profile.hangSession.encounterConsumedSlot, 2);

  data.profiles.player_alice.profile.hangSession.encounterConsumedSlot = 4;
  const advanced = recoverBattleEncounterSlot(data, ticket, {
    accountById: (state, accountId) => Object.values(state.accounts).find((account) => account.accountId === accountId),
    normalizeHangSession: (value) => ({...value}),
    persistProfileForAccount: () => assert.fail("advanced progress must not be overwritten"),
  });
  assert.equal(advanced.ok, true);
  assert.equal(advanced.refunded, false);
  assert.equal(advanced.reason, "slot_advanced");
  assert.equal(data.profiles.player_alice.profile.hangSession.encounterConsumedSlot, 4);
});

test("missing current sessions and conflicting ticket copies fail closed", () => {
  const data = fixtureData();
  data.sessions.session_bob_current.revokedAt = "2026-08-15T03:59:59.000Z";
  const missing = battleFailureTicketAdmission(data, ["account_bob"], {now: () => NOW_MS});
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "battle_failure_ticket_session_missing");

  data.sessions.session_bob_current.revokedAt = null;
  assert.equal(installBattleFailureTickets(data, room(), {now: () => NOW_MS}).ok, true);
  data.sessions.session_alice_second.battleFailureTicket = {
    ...data.sessions.session_alice_second.battleFailureTicket,
    roomId: "battle_room_conflicting_copy",
  };
  const conflict = battleFailureTicketStateForAccount(data, "account_alice");
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "battle_failure_ticket_conflict");
});
