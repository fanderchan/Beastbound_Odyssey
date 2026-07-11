"use strict";

const GM_GRANT_PET_COMMAND_ID = "gm_grant_pet";
const GM_LEVEL_PET_COMMAND_ID = "gm_level_pet";

function createGmPetsDomain(ctx) {
  const {
    BATTLE_PET_MAX_PER_PARTICIPANT,
    BATTLE_PET_STATE_STANDBY,
    BATTLE_PET_STATE_STORAGE,
    BATTLE_PET_STORAGE_LIMIT,
    MAX_PET_LEVEL,
    clone,
    createDefaultServerPet,
    ensureProfileForAccount,
    expToNextLevel,
    fail,
    gmCommandAccess,
    load,
    newPetFactory,
    ok,
    petExpSettlement,
    petGrowthCatalog,
    persistProfileForAccount,
    profilePartyVisiblePetCount,
    profilePetIndexById,
    profilePetInstances,
    profilePetName,
    profileStoragePetCount,
    profileSummaryForAccount,
    publicAccount,
    randomId,
    recordGmCommandAudit,
    recordProfilePetCodexForm,
    save,
    nextProfilePetInstanceSerial,
  } = ctx;

  function auditedFailure(data, access, code, message) {
    const audit = recordGmCommandAudit(data, access, false, message);
    save(data);
    return fail(code, message, {auditId: audit.auditId});
  }

  function grantGmPet(token, payload = {}) {
    const data = load();
    const access = gmCommandAccess(data, token, GM_GRANT_PET_COMMAND_ID);
    if (!access.ok) {
      return auditedFailure(data, access, access.code, access.message);
    }
    const grantInput = normalizeGrantPayload(payload);
    if (!grantInput.ok) {
      return auditedFailure(data, access, grantInput.code, grantInput.message);
    }

    let profileId = "";
    let formId = "";
    if (grantInput.growthSpeciesProfileId !== "") {
      const growthProfile = petGrowthCatalog.profileById(grantInput.growthSpeciesProfileId);
      if (!growthProfile) {
        return auditedFailure(data, access, "gm_pet_growth_profile_missing", "成长档不存在，未创建宠物。");
      }
      profileId = growthProfile.profileId;
      formId = growthProfile.formId;
    } else {
      formId = grantInput.formId;
      profileId = petGrowthCatalog.profileIdForFormId(formId);
    }
    const template = petGrowthCatalog.templateByFormId(formId);
    if (!template) {
      return auditedFailure(data, access, "gm_pet_form_missing", "宠物形态不存在，未创建宠物。");
    }

    const ensured = ensureProfileForAccount(data, access.resolved.account, ctx.now);
    const sourceProfile = ensured.profileDoc && ensured.profileDoc.profile;
    if (!isObjectRecord(sourceProfile)) {
      return auditedFailure(data, access, "profile_missing", "请先创建角色档案。");
    }
    const profile = clone(sourceProfile);
    const partyCount = profilePartyVisiblePetCount(profile);
    const storageCount = profileStoragePetCount(profile);
    if (partyCount >= BATTLE_PET_MAX_PER_PARTICIPANT && storageCount >= BATTLE_PET_STORAGE_LIMIT) {
      return auditedFailure(data, access, "pet_capacity_full", "队伍和兽栏都满了，无法领取测试宠物。");
    }
    const state = partyCount < BATTLE_PET_MAX_PER_PARTICIPANT
      ? BATTLE_PET_STATE_STANDBY
      : BATTLE_PET_STATE_STORAGE;
    const instances = profilePetInstances(profile);
    const serial = nextProfilePetInstanceSerial(profile, instances);
    const instanceId = uniqueGmPetInstanceId(instances, formId, serial, randomId);
    if (instanceId === "") {
      return auditedFailure(data, access, "gm_pet_identity_unavailable", "测试宠物编号生成失败，请重试。");
    }
    const name = strictCatalogText(template.formName) || "测试宠物";
    let pet = createDefaultServerPet(instanceId, name, formId, state, 1);
    pet.capturedSerial = serial;
    pet.isNew = true;
    pet.source = "gm_command";
    try {
      pet = newPetFactory.finalizeLevelOne(pet, {purpose: "gm_pet_grant"}).pet;
    } catch (_error) {
      return auditedFailure(data, access, "gm_pet_creation_failed", "测试宠物创建失败，档案未改变。");
    }
    if (!isObjectRecord(pet) || pet.level !== 1 || String(pet.formId || "") !== formId) {
      return auditedFailure(data, access, "gm_pet_creation_failed", "测试宠物创建失败，档案未改变。");
    }

    instances.push(pet);
    profile.nextPetInstanceSerial = serial + 1;
    recordProfilePetCodexForm(profile, formId, true);
    const persisted = persistProfileForAccount(data, access.resolved.account, ensured.binding, profile, ctx.now);
    const message = `获得 Lv1 ${profilePetName(pet)}，已加入${state === BATTLE_PET_STATE_STORAGE ? "兽栏" : "队伍"}。`;
    const audit = recordGmCommandAudit(data, access, true, message);
    save(data);
    return ok({
      account: publicAccount(access.resolved.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(access.resolved.account, data),
      profile,
      result: {
        commandId: GM_GRANT_PET_COMMAND_ID,
        instanceId,
        formId,
        growthSpeciesProfileId: profileId,
        name: profilePetName(pet),
        state,
        level: 1,
        capturedSerial: serial,
        schemaVersion: 1,
      },
      auditId: audit.auditId,
      message,
    });
  }

  function levelUpGmPet(token, payload = {}) {
    const data = load();
    const access = gmCommandAccess(data, token, GM_LEVEL_PET_COMMAND_ID);
    if (!access.ok) {
      return auditedFailure(data, access, access.code, access.message);
    }
    const levelInput = normalizeLevelPayload(payload);
    if (!levelInput.ok) {
      return auditedFailure(data, access, levelInput.code, levelInput.message);
    }

    const ensured = ensureProfileForAccount(data, access.resolved.account, ctx.now);
    const sourceProfile = ensured.profileDoc && ensured.profileDoc.profile;
    if (!isObjectRecord(sourceProfile)) {
      return auditedFailure(data, access, "profile_missing", "请先创建角色档案。");
    }
    const profile = clone(sourceProfile);
    const instances = profilePetInstances(profile);
    const petIndex = profilePetIndexById(profile, levelInput.instanceId);
    if (petIndex < 0) {
      return auditedFailure(data, access, "pet_missing", "没有找到这只宠物。");
    }
    const pet = instances[petIndex];
    const beforeLevel = Number(pet && pet.level);
    if (!Number.isInteger(beforeLevel) || beforeLevel < 1 || beforeLevel > MAX_PET_LEVEL) {
      return auditedFailure(data, access, "pet_growth_state_invalid", "宠物成长数据异常，本次升级未结算。");
    }
    if (beforeLevel >= MAX_PET_LEVEL) {
      return auditedFailure(data, access, "pet_max_level", `${profilePetName(pet)} 已满级。`);
    }
    const currentExp = Number(pet && pet.exp);
    const canonicalNextExp = expToNextLevel(beforeLevel);
    if (!Number.isInteger(currentExp) || currentExp < 0 || currentExp >= canonicalNextExp) {
      return auditedFailure(data, access, "pet_growth_state_invalid", "宠物成长数据异常，本次升级未结算。");
    }

    let settlement;
    try {
      settlement = petExpSettlement.settle(
        pet,
        canonicalNextExp - currentExp,
        MAX_PET_LEVEL,
        {name: profilePetName(pet)},
      );
    } catch (_error) {
      return auditedFailure(data, access, "pet_growth_state_invalid", "宠物成长数据异常，本次升级未结算。");
    }
    if (
      !settlement
      || settlement.changed !== true
      || !isObjectRecord(settlement.pet)
      || settlement.pet.level !== beforeLevel + 1
    ) {
      return auditedFailure(data, access, "pet_growth_state_invalid", "宠物成长数据异常，本次升级未结算。");
    }
    instances[petIndex] = settlement.pet;
    const persisted = persistProfileForAccount(data, access.resolved.account, ensured.binding, profile, ctx.now);
    const message = `${profilePetName(settlement.pet)} 升到 Lv${settlement.pet.level}。`;
    const audit = recordGmCommandAudit(data, access, true, message);
    save(data);
    return ok({
      account: publicAccount(access.resolved.account),
      profileBinding: persisted.binding,
      profileSummary: profileSummaryForAccount(access.resolved.account, data),
      profile,
      result: {
        commandId: GM_LEVEL_PET_COMMAND_ID,
        instanceId: String(settlement.pet.instanceId || settlement.pet.petId || ""),
        formId: String(settlement.pet.formId || settlement.pet.templateId || ""),
        name: profilePetName(settlement.pet),
        beforeLevel,
        level: settlement.pet.level,
        levelsGained: 1,
        schemaVersion: 1,
      },
      auditId: audit.auditId,
      message,
    });
  }

  return Object.freeze({grantGmPet, levelUpGmPet});
}

function normalizeGrantPayload(value) {
  if (!isPlainRecord(value)) {
    return invalidGrantPayload();
  }
  const keys = Object.keys(value);
  if (keys.length !== 1 || !["growthSpeciesProfileId", "formId"].includes(keys[0])) {
    return invalidGrantPayload();
  }
  const id = strictRequestId(value[keys[0]]);
  if (id === "") {
    return invalidGrantPayload();
  }
  return {
    ok: true,
    growthSpeciesProfileId: keys[0] === "growthSpeciesProfileId" ? id : "",
    formId: keys[0] === "formId" ? id : "",
  };
}

function normalizeLevelPayload(value) {
  if (!isPlainRecord(value) || Object.keys(value).length !== 1 || !hasOwn(value, "instanceId")) {
    return invalidLevelPayload();
  }
  const instanceId = strictRequestId(value.instanceId);
  if (instanceId === "") {
    return invalidLevelPayload();
  }
  return {ok: true, instanceId};
}

function invalidGrantPayload() {
  return {
    ok: false,
    code: "gm_pet_grant_payload_invalid",
    message: "领取参数不正确，请且只选择一个成长档或宠物形态。",
  };
}

function invalidLevelPayload() {
  return {
    ok: false,
    code: "gm_pet_level_payload_invalid",
    message: "升级参数不正确，请只提交宠物编号。",
  };
}

function isObjectRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPlainRecord(value) {
  if (!isObjectRecord(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function strictRequestId(value) {
  if (typeof value !== "string" || value === "" || value !== value.trim() || value.length > 128) {
    return "";
  }
  return value;
}

function strictCatalogText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeIdPart(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "pet";
}

function uniqueGmPetInstanceId(instances, formId, serial, randomId) {
  const existingIds = new Set((Array.isArray(instances) ? instances : []).flatMap((pet) => [
    String(pet && pet.instanceId || ""),
    String(pet && pet.petId || ""),
  ]).filter(Boolean));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let entropy;
    try {
      entropy = safeIdPart(randomId());
    } catch (_error) {
      return "";
    }
    const candidate = `pet_gm_${safeIdPart(formId)}_${Math.max(1, Math.trunc(Number(serial || 1)))}_${entropy}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }
  return "";
}

module.exports = {
  GM_GRANT_PET_COMMAND_ID,
  GM_LEVEL_PET_COMMAND_ID,
  createGmPetsDomain,
};
