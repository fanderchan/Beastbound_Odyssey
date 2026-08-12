"use strict";

const {
  canonicalMailArchivePageResult,
  normalizeMailArchivePageOptions,
} = require("./mail-archive-pagination");

function createMailArchiveService(options = {}) {
  const store = options.store;
  const resolveAccountId = options.resolveAccountId;
  const projectMail = options.projectMail;
  const ok = options.ok;
  const fail = options.fail;
  const readFailure = options.readFailure;
  if (
    !store
    || typeof resolveAccountId !== "function"
    || typeof projectMail !== "function"
    || typeof ok !== "function"
    || typeof fail !== "function"
    || typeof readFailure !== "function"
  ) {
    throw new TypeError("mail archive service dependencies are invalid");
  }

  async function list(token, payload = {}) {
    let pageOptions;
    try {
      pageOptions = normalizeMailArchivePageOptions(payload, {requireExplicitLimit: true});
    } catch (error) {
      return fail(
        String(error && error.code || "mail_archive_pagination_invalid"),
        String(error && error.message || "邮件归档分页参数无效，请刷新后重试。"),
      );
    }
    const resolved = resolveAccountId(token);
    if (!resolved || resolved.ok !== true) {
      return fail(
        String(resolved && resolved.code || "session_missing"),
        String(resolved && resolved.message || "登录会话不存在。"),
      );
    }
    if (
      store.mailArchivePageReads !== true
      || typeof store.readMailArchivePage !== "function"
    ) {
      return fail("mail_archive_unavailable", "邮件归档暂未开放，请稍后再试。");
    }
    let page;
    try {
      page = canonicalMailArchivePageResult(
        await store.readMailArchivePage(resolved.accountId, pageOptions),
        resolved.accountId,
        pageOptions,
        {trustStoreOrder: true},
      );
    } catch (cause) {
      if (String(cause && cause.code || "") === "mail_archive_feature_disabled_or_drifted") {
        return fail("mail_archive_unavailable", "邮件归档暂未开放，请稍后再试。");
      }
      throw readFailure(cause);
    }
    return ok({
      messages: page.archiveRows.map((entry) => ({
        ...projectMail(entry.mail),
        archivedAt: entry.archivedAt,
      })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    });
  }

  return Object.freeze({list});
}

module.exports = {createMailArchiveService};
