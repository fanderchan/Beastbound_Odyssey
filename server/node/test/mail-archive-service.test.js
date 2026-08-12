"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createAuthService,
  createMemoryAuthStore,
} = require("../test-support/auth-service-test-context");

function batchReport(mailId) {
  return {
    kind: "beastbound_mail_archive_batch",
    schemaVersion: 1,
    ok: true,
    code: "mail_archive_batch_ok",
    archivedCount: 1,
    archivedMailIds: [mailId],
    retiredMailIds: [mailId],
    cutoffAt: "2026-07-14T00:00:00.000Z",
    archivedAt: "2026-08-13T00:00:00.000Z",
    recovered: false,
    outcomeUnknown: false,
    retryable: false,
  };
}

function archivedServiceFixture() {
  const seedStore = createMemoryAuthStore();
  const seed = createAuthService({store: seedStore});
  const sender = seed.register({
    username: "archivesender",
    password: "test1234",
    displayName: "归档寄件人",
  });
  const recipient = seed.register({
    username: "archiverecipient",
    password: "test1234",
    displayName: "归档收件人",
  });
  const sent = seed.sendMail(sender.session.token, {
    recipientUsername: recipient.account.username,
    title: "归档基线",
    body: "归档提交后不能留在 Node 缓存。",
  });
  assert.equal(sent.ok, true);
  const durableSnapshot = seed.snapshot();
  let storedSnapshot = structuredClone(durableSnapshot);
  const store = {
    mode: "mail-archive-service-test",
    mailArchiveBatches: true,
    checkHealth: () => ({ok: true}),
    load: () => structuredClone(storedSnapshot),
    mailArchiveEnabled: () => true,
    async archiveSettledMailBatch() {
      delete storedSnapshot.mailMessages[sent.mail.mailId];
      return batchReport(sent.mail.mailId);
    },
  };
  return {store, recipient, sent};
}

test("confirmed archive batches retire the same mail from the published Node baseline", async () => {
  const fixture = archivedServiceFixture();
  const service = createAuthService({store: fixture.store});
  assert.equal(Object.hasOwn(service.snapshot().mailMessages, fixture.sent.mail.mailId), true);

  const report = await service.archiveSettledMailBatch({limit: 1});
  assert.equal(report.ok, true);
  assert.deepEqual(report.retiredMailIds, [fixture.sent.mail.mailId]);
  assert.equal(Object.hasOwn(service.snapshot().mailMessages, fixture.sent.mail.mailId), false);
  const inbox = service.listInbox(fixture.recipient.session.token);
  assert.equal(inbox.ok, true);
  assert.deepEqual(inbox.messages, []);
});

test("an already-retired Node baseline accepts the same confirmed retirement idempotently", async () => {
  const fixture = archivedServiceFixture();
  const malformed = fixture.store.load();
  malformed.mailMessages = null;
  fixture.store.load = () => structuredClone(malformed);
  const service = createAuthService({store: fixture.store});

  const report = await service.archiveSettledMailBatch({limit: 1});
  assert.equal(report.ok, true);
  assert.equal(Object.hasOwn(service.snapshot().mailMessages, fixture.sent.mail.mailId), false);
});

test("a malformed archive report cannot retire the published Node baseline", async () => {
  const fixture = archivedServiceFixture();
  fixture.store.archiveSettledMailBatch = async () => ({
    ...batchReport(fixture.sent.mail.mailId),
    archivedCount: 2,
  });
  const service = createAuthService({store: fixture.store});

  await assert.rejects(
    service.archiveSettledMailBatch({limit: 1}),
    (error) => error && error.code === "mail_archive_batch_report_invalid",
  );
  assert.equal(Object.hasOwn(service.snapshot().mailMessages, fixture.sent.mail.mailId), true);
});
