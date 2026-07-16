"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  initializeMailLifecycle,
  readMailLifecycleState,
  settleMailLifecycle,
} = require("../src/auth/mail-lifecycle-state");

const CREATED_AT = "2026-07-16T02:00:00.000Z";
const SETTLED_AT = "2026-07-16T03:00:00.000Z";

function mail(overrides = {}) {
  return {
    mailId: "mail_lifecycle_1",
    recipientAccountId: "account_lifecycle_1",
    createdAt: CREATED_AT,
    readAt: null,
    ...overrides,
  };
}

function attachmentState(overrides = {}) {
  return {
    ok: true,
    items: [],
    equipmentEnvelopes: [],
    currency: {},
    ...overrides,
  };
}

test("new text mail settles at creation without changing unread state", () => {
  const source = mail();
  const initialized = initializeMailLifecycle(source, attachmentState());

  assert.equal(initialized.ok, true);
  assert.equal(initialized.mail.settledAt, CREATED_AT);
  assert.equal(initialized.mail.readAt, null);
  assert.equal(initialized.state.settled, true);
  assert.equal(Object.hasOwn(source, "settledAt"), false);
});

test("asset mail remains unsettled and a partial claim cannot acquire settlement", () => {
  const source = mail({items: [{itemId: "item_meat_small", count: 2}]});
  const initialized = initializeMailLifecycle(source, attachmentState({
    items: [{itemId: "item_meat_small", count: 2}],
  }));

  assert.equal(initialized.ok, true);
  assert.equal(Object.hasOwn(initialized.mail, "settledAt"), false);
  assert.equal(initialized.state.hasAssets, true);
  assert.equal(initialized.state.settled, false);
});

test("final asset claim records one server settlement time and marks the receipt read", () => {
  const source = mail({items: [], currency: {}, equipmentEnvelopes: []});
  const settled = settleMailLifecycle(source, attachmentState(), SETTLED_AT);

  assert.equal(settled.ok, true);
  assert.equal(settled.changed, true);
  assert.equal(settled.mail.settledAt, SETTLED_AT);
  assert.equal(settled.mail.readAt, SETTLED_AT);
  assert.equal(settled.state.settled, true);
  assert.equal(Object.hasOwn(source, "settledAt"), false);

  const replay = settleMailLifecycle(settled.mail, attachmentState(), "2026-07-16T04:00:00.000Z");
  assert.equal(replay.ok, true);
  assert.equal(replay.changed, false);
  assert.equal(replay.mail.settledAt, SETTLED_AT);
});

test("existing read time is preserved when the last attachment settles", () => {
  const readAt = "2026-07-16T02:30:00.000Z";
  const settled = settleMailLifecycle(mail({readAt}), attachmentState(), SETTLED_AT);

  assert.equal(settled.ok, true);
  assert.equal(settled.mail.readAt, readAt);
  assert.equal(settled.mail.settledAt, SETTLED_AT);
});

test("asset-bearing, malformed, or backwards settlement records fail closed", () => {
  const scenarios = [
    {
      expected: "mail_lifecycle_asset_conflict",
      mail: mail({settledAt: SETTLED_AT}),
      state: attachmentState({items: [{itemId: "item_meat_small", count: 1}]}),
    },
    {
      expected: "mail_lifecycle_invalid",
      mail: mail({settledAt: "not-a-time"}),
      state: attachmentState(),
    },
    {
      expected: "mail_lifecycle_invalid",
      mail: mail({settledAt: "2026-07-15T23:59:59.000Z"}),
      state: attachmentState(),
    },
    {
      expected: "mail_lifecycle_read_at_invalid",
      mail: mail({
        items: [{itemId: "item_meat_small", count: 1}],
        readAt: "2026-07-16 02:30:00",
      }),
      state: attachmentState({items: [{itemId: "item_meat_small", count: 1}]}),
    },
    {
      expected: "mail_lifecycle_assets_unverified",
      mail: mail(),
      state: {ok: false},
    },
  ];

  for (const scenario of scenarios) {
    const result = readMailLifecycleState(scenario.mail, scenario.state);
    assert.equal(result.ok, false);
    assert.equal(result.code, scenario.expected);
  }
});
