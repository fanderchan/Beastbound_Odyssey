"use strict";

const {
  buildUpdatedPetPaidResetConfig,
  publicPetPaidResetConfig,
} = require("./pet-paid-reset-policy-catalog");

const GM_PET_PAID_RESET_CONFIG_COMMAND_ID = "gm_pet_paid_reset_config";

function createGmPetPaidResetConfigDomain(ctx) {
  const {
    fail,
    gmCommandAccess,
    load,
    now,
    ok,
    petPaidResetPolicyCatalog,
    recordGmCommandAudit,
    save,
  } = ctx;

  function getConfig(token) {
    const prepared = prepareGm(token);
    if (!prepared.ok) {
      return prepared.result;
    }
    const projected = publicPetPaidResetConfig(
      petPaidResetPolicyCatalog,
      prepared.data.petPaidResetConfig,
    );
    if (!projected.ok) {
      const audit = recordGmCommandAudit(
        prepared.data,
        prepared.access,
        false,
        `读取付费重置价格配置失败：${projected.code}`,
      );
      save(prepared.data);
      return fail(projected.code, projected.message, {auditId: audit.auditId});
    }
    const audit = recordGmCommandAudit(
      prepared.data,
      prepared.access,
      true,
      `读取付费重置价格配置：revision=${projected.config.revision};forms=${projected.resolvedForms.length}`,
    );
    save(prepared.data);
    return ok({
      ...projected,
      auditId: audit.auditId,
      message: "宠物重置价格配置已读取。",
    });
  }

  function updateConfig(token, payload = {}) {
    const prepared = prepareGm(token);
    if (!prepared.ok) {
      return prepared.result;
    }
    const updated = buildUpdatedPetPaidResetConfig(
      prepared.data.petPaidResetConfig,
      payload,
      petPaidResetPolicyCatalog,
      {username: prepared.access.username, nowMs: now()},
    );
    if (!updated.ok) {
      const audit = recordGmCommandAudit(
        prepared.data,
        prepared.access,
        false,
        `更新付费重置价格配置失败：${updated.code}`,
      );
      save(prepared.data);
      return fail(updated.code, updated.message, {auditId: audit.auditId});
    }
    if (updated.changed) {
      prepared.data.petPaidResetConfig = updated.config;
    }
    const projected = publicPetPaidResetConfig(
      petPaidResetPolicyCatalog,
      prepared.data.petPaidResetConfig,
    );
    if (!projected.ok) {
      const audit = recordGmCommandAudit(
        prepared.data,
        prepared.access,
        false,
        `更新后价格配置校验失败：${projected.code}`,
      );
      save(prepared.data);
      return fail(projected.code, projected.message, {auditId: audit.auditId});
    }
    const audit = recordGmCommandAudit(
      prepared.data,
      prepared.access,
      true,
      [
        `更新付费重置价格配置：changed=${updated.changed}`,
        `revision=${projected.config.revision}`,
        `tierOverrides=${Object.keys(projected.config.tierOverrides).length}`,
        `formOverrides=${Object.keys(projected.config.formOverrides).length}`,
      ].join(";"),
      {
        schemaVersion: 1,
        changed: updated.changed,
        configRevision: projected.config.revision,
        tierOverrides: projected.config.tierOverrides,
        formOverrides: projected.config.formOverrides,
      },
    );
    save(prepared.data);
    return ok({
      ...projected,
      changed: updated.changed,
      auditId: audit.auditId,
      message: updated.changed ? "宠物重置价格配置已更新。" : "宠物重置价格配置没有变化。",
    });
  }

  function prepareGm(token) {
    const data = load();
    const access = gmCommandAccess(data, token, GM_PET_PAID_RESET_CONFIG_COMMAND_ID);
    if (!access.ok) {
      const audit = recordGmCommandAudit(data, access, false, access.message);
      if (audit.recorded !== false) {
        save(data);
      }
      return {ok: false, result: fail(access.code, access.message, {auditId: audit.auditId})};
    }
    return {ok: true, data, access};
  }

  return {
    getConfig,
    updateConfig,
  };
}

module.exports = {
  GM_PET_PAID_RESET_CONFIG_COMMAND_ID,
  createGmPetPaidResetConfigDomain,
};
