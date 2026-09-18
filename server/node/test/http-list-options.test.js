"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  mailArchiveOptionsFromSearchParams,
  mailInboxOptionsFromSearchParams,
  rewardVaultOptionsFromSearchParams,
} = require("../src/http-list-options");
const {encodeMailInboxCursor} = require("../src/auth/mail-inbox-pagination");
const {encodeMailArchiveCursor} = require("../src/auth/mail-archive-pagination");
const {encodeRewardVaultCursor} = require("../src/auth/reward-vault-pagination");

const adapters = [
  {parse: mailInboxOptionsFromSearchParams, code: "mail_inbox_pagination_invalid", encode: encodeMailInboxCursor, id: "mailId"},
  {parse: mailArchiveOptionsFromSearchParams, code: "mail_archive_pagination_invalid", encode: encodeMailArchiveCursor, id: "mailId"},
  {parse: rewardVaultOptionsFromSearchParams, code: "reward_vault_pagination_invalid", encode: encodeRewardVaultCursor, id: "rewardId"},
];

test("legacy inbox query remains optional and preserves its existing unknown-field behavior", () => {
  for (const query of ["", "unused=1", "unused=1&unused=2"]) {
    assert.deepEqual(mailInboxOptionsFromSearchParams(new URLSearchParams(query)), {ok: true, options: {}});
  }
  assert.deepEqual(mailInboxOptionsFromSearchParams(new URLSearchParams("limit=5&unused=1")), {
    ok: true, options: {limit: 5, cursor: null},
  });
});

test("archive and reward vault reject absent limits and unknown fields", () => {
  for (const {parse, code} of adapters.slice(1)) {
    for (const query of ["", "unused=1", "limit=5&unused=1"]) {
      assert.equal(parse(new URLSearchParams(query)).code, code, query);
    }
  }
});

test("all list routes reject ambiguous URL parameters and noncanonical limits", () => {
  for (const {parse, code} of adapters) {
    for (const query of ["limit=1&limit=2", "limit=1&cursor=a&cursor=b", "cursor=a", "limit=", "limit=0", "limit=51", "limit=01", "limit=1.0", "limit=%201", "limit=5&cursor=invalid"]) {
      const result = parse(new URLSearchParams(query));
      assert.equal(result.ok, false, query);
      assert.equal(result.code, code, query);
      assert.equal(typeof result.message, "string");
      assert.equal("options" in result, false);
    }
  }
});

test("URL cursors round trip only through their own list domain", () => {
  for (const adapter of adapters) {
    const value = {createdAt: "2026-09-17T00:00:00.000Z", [adapter.id]: "entry_1"};
    const cursor = adapter.encode(value);
    assert.deepEqual(adapter.parse(new URLSearchParams({limit: "50", cursor})), {
      ok: true, options: {limit: 50, cursor: value},
    });
    for (const other of adapters.filter((item) => item !== adapter)) {
      assert.equal(other.parse(new URLSearchParams({limit: "50", cursor})).code, other.code);
    }
  }
});
