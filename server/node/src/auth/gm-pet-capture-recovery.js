"use strict";

const {
  PARTY_LIMIT,
  STORAGE_LIMIT,
  readShelter,
  recoverPetCapture,
} = require("./pet-capture-shelter");

const GM_PET_CAPTURE_RECOVERY_COMMAND_ID = "gm_pet_capture_recovery";
const ACTION_SEARCH = "search";
const ACTION_RECOVER = "recover";
const MAX_SEARCH_RESULTS = 50;
const RECOVERY_ID_PATTERN = /^pet_capture_[a-f0-9]{32}$/;
const PET_INSTANCE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;

function createGmPetCaptureRecoveryDomain(ctx) {
  const {
    activeBattleRoomForAccount,
    clone,
    fail,
    gmCommandAccess,
    load,
    normalizeUsername,
    ok,
    persistProfileForAccount,
    profilePetInstances,
    recordGmCommandAudit,
    recordProfilePetCodexForm,
    save,
  } = ctx;

  function run(token, payload = {}) {
    const data = load();
    const access = gmCommandAccess(data, token, GM_PET_CAPTURE_RECOVERY_COMMAND_ID);
    if (!access.ok) {
      return auditedFailure(data, access, access.code, access.message);
    }
    const input = normalizePayload(payload, normalizeUsername);
    if (!input.ok) {
      return auditedFailure(data, access, input.code, input.message);
    }
    const target = data.accounts[input.targetUsername] || null;
    if (!target) {
      return auditedFailure(data, access, "gm_pet_recovery_target_missing", "没有找到目标账号。", {
        action: input.action,
        targetUsername: input.targetUsername,
      });
    }
    const resolvedProfile = targetProfile(data, target);
    if (!resolvedProfile.ok) {
      return auditedFailure(data, access, resolvedProfile.code, resolvedProfile.message, {
        action: input.action,
        targetAccountId: target.accountId,
        targetUsername: target.username,
      });
    }
    const shelterRead = readShelter(resolvedProfile.profile);
    if (!shelterRead.ok) {
      return auditedFailure(data, access, "gm_pet_recovery_state_invalid", "目标账号的捕捉恢复资料异常，未执行操作。", {
        action: input.action,
        targetAccountId: target.accountId,
        targetUsername: target.username,
      });
    }
    return input.action === ACTION_RECOVER
      ? recover(data, access, target, resolvedProfile, shelterRead.shelter, input)
      : search(data, access, target, resolvedProfile, shelterRead.shelter, input);
  }

  function search(data, access, target, resolvedProfile, shelter, input) {
    const records = safeRecoveryRecords(resolvedProfile.profile, shelter)
      .filter((record) => selectorMatches(record, input));
    const returned = records.slice(0, MAX_SEARCH_RESULTS);
    const result = resultEnvelope({
      action: ACTION_SEARCH,
      target,
      binding: resolvedProfile.binding,
      profile: resolvedProfile.profile,
      shelter,
      records: returned,
      matchedCount: records.length,
      activeBattle: Boolean(activeBattleRoomForAccount(data, target.accountId)),
    });
    const message = records.length > 0
      ? `找到 ${records.length} 条捕捉恢复记录。`
      : "没有找到匹配的捕捉恢复记录。";
    const audit = recordGmCommandAudit(data, access, true, message, {
      action: ACTION_SEARCH,
      targetAccountId: target.accountId,
      targetUsername: target.username,
      recoveryId: input.recoveryId,
      petInstanceId: input.petInstanceId,
      pendingCount: result.counts.pending,
      completedCount: result.counts.completed,
      matchedCount: records.length,
      returnedCount: returned.length,
      truncated: records.length > returned.length,
    });
    save(data);
    return ok({result, auditId: audit.auditId, message});
  }

  function recover(data, access, target, resolvedProfile, shelter, input) {
    const recoveryIdResult = selectedRecoveryId(shelter, input);
    if (!recoveryIdResult.ok) {
      return auditedFailure(data, access, recoveryIdResult.code, recoveryIdResult.message, {
        action: ACTION_RECOVER,
        targetAccountId: target.accountId,
        targetUsername: target.username,
        recoveryId: input.recoveryId,
        petInstanceId: input.petInstanceId,
      });
    }
    if (activeBattleRoomForAccount(data, target.accountId)) {
      return auditedFailure(data, access, "gm_pet_recovery_target_in_battle", "目标玩家正在战斗，不能人工恢复宠物。", {
        action: ACTION_RECOVER,
        targetAccountId: target.accountId,
        targetUsername: target.username,
        recoveryId: recoveryIdResult.recoveryId,
        petInstanceId: recoveryIdResult.petInstanceId,
      });
    }

    const profile = clone(resolvedProfile.profile);
    const recovered = recoverPetCapture(profile, {
      recoveryId: recoveryIdResult.recoveryId,
      completedAt: new Date(ctx.now()).toISOString(),
    });
    if (!recovered.ok) {
      const messages = {
        pet_capture_shelter_capacity_full: "目标账号的随身宠和兽栏都已满，未恢复宠物。",
        pet_capture_shelter_pending_missing: "待恢复记录已经不存在，请重新查询。",
        pet_capture_shelter_identity_conflict: "目标账号存在宠物身份冲突，未执行恢复。",
        pet_capture_shelter_invalid: "目标账号的捕捉恢复资料异常，未执行恢复。",
      };
      return auditedFailure(
        data,
        access,
        String(recovered.code || "gm_pet_recovery_failed"),
        messages[recovered.code] || "捕捉宠物恢复失败，目标档案未改变。",
        {
          action: ACTION_RECOVER,
          targetAccountId: target.accountId,
          targetUsername: target.username,
          recoveryId: recoveryIdResult.recoveryId,
          petInstanceId: recoveryIdResult.petInstanceId,
        },
      );
    }

    const pet = recovered.pet || profilePetInstances(profile).find((entry) => (
      String(entry && (entry.instanceId || entry.petId) || "") === String(recovered.petInstanceId || "")
    )) || null;
    if (pet) {
      recordProfilePetCodexForm(profile, String(pet.formId || pet.templateId || ""), true);
    }
    const nextShelterRead = readShelter(profile);
    if (!nextShelterRead.ok) {
      return auditedFailure(data, access, "gm_pet_recovery_state_invalid", "恢复后的资料校验失败，目标档案未发布。", {
        action: ACTION_RECOVER,
        targetAccountId: target.accountId,
        targetUsername: target.username,
        recoveryId: recoveryIdResult.recoveryId,
        petInstanceId: recoveryIdResult.petInstanceId,
      });
    }
    let persisted = {binding: resolvedProfile.binding};
    if (recovered.changed) {
      persisted = persistProfileForAccount(data, target, resolvedProfile.binding, profile, ctx.now);
    }
    const records = safeRecoveryRecords(profile, nextShelterRead.shelter)
      .filter((record) => record.recoveryId === recoveryIdResult.recoveryId);
    const result = resultEnvelope({
      action: ACTION_RECOVER,
      target,
      binding: persisted.binding,
      profile,
      shelter: nextShelterRead.shelter,
      records,
      matchedCount: records.length,
      activeBattle: false,
      recovery: {
        changed: Boolean(recovered.changed),
        replayed: Boolean(recovered.replayed),
        disposition: String(recovered.disposition || ""),
      },
    });
    const message = recovered.changed && recovered.replayed
      ? "已确认宠物原本就在档案中，本次只完成恢复记录，未生成第二只。"
      : recovered.replayed
        ? "这条捕捉恢复已经完成，本次未重复生成宠物。"
        : `宠物已恢复到${recovered.disposition === "storage" ? "兽栏" : "随身栏"}。`;
    const audit = recordGmCommandAudit(data, access, true, message, {
      action: ACTION_RECOVER,
      targetAccountId: target.accountId,
      targetUsername: target.username,
      recoveryId: recoveryIdResult.recoveryId,
      petInstanceId: String(recovered.petInstanceId || recoveryIdResult.petInstanceId || ""),
      disposition: String(recovered.disposition || ""),
      replayed: Boolean(recovered.replayed),
      changed: Boolean(recovered.changed),
      profileRevisionBefore: safeRevision(resolvedProfile.binding.profileRevision),
      profileRevisionAfter: safeRevision(persisted.binding && persisted.binding.profileRevision),
    });
    save(data);
    return ok({result, auditId: audit.auditId, message});
  }

  function auditedFailure(data, access, code, message, details = {}) {
    const audit = recordGmCommandAudit(data, access, false, message, details);
    if (audit.recorded !== false) {
      save(data);
    }
    return fail(code, message, {auditId: audit.auditId});
  }

  return Object.freeze({run});
}

function normalizePayload(value, normalizeUsername) {
  if (!isRecord(value)) {
    return invalidPayload();
  }
  const expectedKeys = ["action", "petInstanceId", "recoveryId", "targetUsername"];
  const keys = Object.keys(value).sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    return invalidPayload();
  }
  if (
    typeof value.action !== "string"
    || typeof value.targetUsername !== "string"
    || typeof value.recoveryId !== "string"
    || typeof value.petInstanceId !== "string"
  ) {
    return invalidPayload();
  }
  const action = value.action.trim();
  const targetUsername = normalizeUsername(value.targetUsername);
  const recoveryId = value.recoveryId.trim();
  const petInstanceId = value.petInstanceId.trim();
  if (
    ![ACTION_SEARCH, ACTION_RECOVER].includes(action)
    || action !== value.action
    || targetUsername === ""
    || recoveryId !== value.recoveryId
    || petInstanceId !== value.petInstanceId
    || (recoveryId !== "" && !RECOVERY_ID_PATTERN.test(recoveryId))
    || (petInstanceId !== "" && !PET_INSTANCE_ID_PATTERN.test(petInstanceId))
    || (recoveryId !== "" && petInstanceId !== "")
    || (action === ACTION_RECOVER && recoveryId === "" && petInstanceId === "")
  ) {
    return invalidPayload();
  }
  return {ok: true, action, targetUsername, recoveryId, petInstanceId};
}

function invalidPayload() {
  return {
    ok: false,
    code: "gm_pet_recovery_payload_invalid",
    message: "捕捉恢复参数不正确，请填写目标用户名以及一个有效的恢复ID或宠物ID。",
  };
}

function targetProfile(data, target) {
  const binding = data.profileBindings && data.profileBindings[target.accountId];
  const playerId = String(binding && binding.playerId || "");
  const profileDoc = playerId !== "" && data.profiles ? data.profiles[playerId] || null : null;
  if (!binding || !profileDoc || !isRecord(profileDoc.profile)) {
    return {ok: false, code: "profile_missing", message: "目标账号还没有角色档案。"};
  }
  const revision = safeRevision(binding.profileRevision);
  if (
    revision === null
    || safeRevision(profileDoc.profileRevision) !== revision
    || String(binding.accountId || "") !== target.accountId
    || String(profileDoc.accountId || "") !== target.accountId
    || String(profileDoc.playerId || "") !== playerId
  ) {
    return {ok: false, code: "profile_binding_conflict", message: "目标账号的角色档案绑定异常，未执行操作。"};
  }
  return {ok: true, binding, profileDoc, profile: profileDoc.profile};
}

function selectedRecoveryId(shelter, input) {
  if (input.recoveryId !== "") {
    const record = shelter.pending[input.recoveryId] || shelter.completed[input.recoveryId] || null;
    return record
      ? {ok: true, recoveryId: input.recoveryId, petInstanceId: String(record.petInstanceId || "")}
      : {ok: false, code: "gm_pet_recovery_record_missing", message: "没有找到这条恢复记录，请重新查询。"};
  }
  const matches = [...Object.values(shelter.pending), ...Object.values(shelter.completed)]
    .filter((record) => String(record && record.petInstanceId || "") === input.petInstanceId);
  const recoveryIds = [...new Set(matches.map((record) => String(record.recoveryId || "")))].filter(Boolean);
  if (recoveryIds.length === 0) {
    return {ok: false, code: "gm_pet_recovery_record_missing", message: "没有找到这只宠物的恢复记录。"};
  }
  if (recoveryIds.length !== 1) {
    return {ok: false, code: "gm_pet_recovery_selector_ambiguous", message: "宠物ID匹配多条恢复记录，请改用恢复ID。"};
  }
  return {ok: true, recoveryId: recoveryIds[0], petInstanceId: input.petInstanceId};
}

function safeRecoveryRecords(profile, shelter) {
  const instances = Array.isArray(profile && profile.petInstances)
    ? profile.petInstances
    : (Array.isArray(profile && profile.pets) ? profile.pets : []);
  const liveById = new Map(instances.map((pet) => [String(pet && (pet.instanceId || pet.petId) || ""), pet]));
  const pending = Object.values(shelter.pending).map((record) => {
    const pet = isRecord(record.pet) ? record.pet : {};
    return safeRecord(record, pet, "pending");
  });
  const completed = Object.values(shelter.completed).map((record) => (
    safeRecord(record, liveById.get(String(record.petInstanceId || "")) || {}, "completed")
  ));
  return pending.sort((left, right) => (
    String(left.createdAt || "").localeCompare(String(right.createdAt || ""))
    || left.recoveryId.localeCompare(right.recoveryId)
  )).concat(completed.sort((left, right) => (
    String(right.completedAt || "").localeCompare(String(left.completedAt || ""))
    || left.recoveryId.localeCompare(right.recoveryId)
  )));
}

function safeRecord(record, pet, status) {
  return {
    status,
    recoveryId: String(record.recoveryId || ""),
    petInstanceId: String(record.petInstanceId || ""),
    formId: String(record.formId || pet.formId || pet.templateId || ""),
    name: String(pet.name || ""),
    level: safePositiveInteger(pet.level, 0),
    state: String(pet.state || ""),
    capturedSerial: safeRevision(pet.capturedSerial) || 0,
    createdAt: String(record.createdAt || ""),
    completedAt: String(record.completedAt || ""),
    disposition: String(record.disposition || ""),
    schemaVersion: 1,
  };
}

function selectorMatches(record, input) {
  return (input.recoveryId === "" || record.recoveryId === input.recoveryId)
    && (input.petInstanceId === "" || record.petInstanceId === input.petInstanceId);
}

function resultEnvelope(options) {
  const instances = Array.isArray(options.profile && options.profile.petInstances)
    ? options.profile.petInstances
    : (Array.isArray(options.profile && options.profile.pets) ? options.profile.pets : []);
  const partyCount = instances.filter((pet) => pet && String(pet.state || "standby") !== "storage").length;
  const storageCount = instances.filter((pet) => pet && String(pet.state || "standby") === "storage").length;
  const result = {
    commandId: GM_PET_CAPTURE_RECOVERY_COMMAND_ID,
    action: options.action,
    target: {
      username: String(options.target.username || ""),
      displayName: String(options.target.displayName || options.target.username || ""),
      profileRevision: safeRevision(options.binding && options.binding.profileRevision) || 0,
      activeBattle: Boolean(options.activeBattle),
      schemaVersion: 1,
    },
    capacity: {
      partyCount,
      partyLimit: PARTY_LIMIT,
      storageCount,
      storageLimit: STORAGE_LIMIT,
      available: Math.max(0, PARTY_LIMIT + STORAGE_LIMIT - partyCount - storageCount),
      schemaVersion: 1,
    },
    counts: {
      pending: Object.keys(options.shelter.pending).length,
      completed: Object.keys(options.shelter.completed).length,
      matched: options.matchedCount,
      returned: options.records.length,
      truncated: options.matchedCount > options.records.length,
      schemaVersion: 1,
    },
    records: options.records,
    schemaVersion: 1,
  };
  if (options.recovery) {
    result.recovery = {
      changed: Boolean(options.recovery.changed),
      replayed: Boolean(options.recovery.replayed),
      disposition: String(options.recovery.disposition || ""),
      schemaVersion: 1,
    };
  }
  return result;
}

function safeRevision(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function safePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

module.exports = Object.freeze({
  ACTION_RECOVER,
  ACTION_SEARCH,
  GM_PET_CAPTURE_RECOVERY_COMMAND_ID,
  MAX_SEARCH_RESULTS,
  createGmPetCaptureRecoveryDomain,
});
