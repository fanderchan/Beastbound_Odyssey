"use strict";

const {safeEncounterIntent} = require("./pet-encounter-authority");

const DEFAULT_FINAL_PROOFS_KEY = "rebirthTrialProofs";

function createManualEncounterAccess(options = {}) {
  const catalog = requiredObject(options.catalog, "catalog");
  const rebirthTrials = requiredObject(options.rebirthTrials, "rebirthTrials");
  const qualificationClaimsKey = requiredFieldName(
    options.qualificationClaimsKey,
    "qualificationClaimsKey",
  );
  const finalProofsKey = requiredFieldName(
    options.finalProofsKey || DEFAULT_FINAL_PROOFS_KEY,
    "finalProofsKey",
  );
  const finalProofId = requiredIdentifier(options.finalProofId, "finalProofId");
  const mmTrialInteractionId = requiredIdentifier(
    options.mmTrialInteractionId,
    "mmTrialInteractionId",
  );
  const profileLevel = requiredFunction(options.profileLevel, "profileLevel");
  const profileRebirthCycle = requiredFunction(
    options.profileRebirthCycle,
    "profileRebirthCycle",
  );
  const backpackItemCount = requiredFunction(
    options.backpackItemCount,
    "backpackItemCount",
  );
  const storageItemCount = requiredFunction(
    options.storageItemCount,
    "storageItemCount",
  );
  const canReceiveItem = requiredFunction(options.canReceiveItem, "canReceiveItem");
  const canReceivePet = requiredFunction(options.canReceivePet, "canReceivePet");
  const mmTrialAccess = requiredFunction(options.mmTrialAccess, "mmTrialAccess");

  const manualInteractions = discoverManualEncounterInteractions(catalog);
  const rulesBySource = new Map();
  const elementCaves = requiredArray(rebirthTrials.elementCaves, "rebirthTrials.elementCaves");
  const ringRequirements = [];
  for (const cave of elementCaves) {
    const mapId = requiredIdentifier(cave.guardianFloorMapId, "element cave guardianFloorMapId");
    const interactionId = requiredIdentifier(cave.guardianInteractionId, "element cave guardianInteractionId");
    const groupId = requiredIdentifier(
      objectOrEmpty(cave.guardianGroup).id,
      "element cave guardianGroup.id",
    );
    const rewardItemId = requiredIdentifier(cave.ringItemId, "element cave ringItemId");
    const rewardName = requiredText(cave.ringName || rewardItemId, "element cave ringName");
    const minAttemptLevel = requiredPositiveInteger(
      cave.minAttemptLevel,
      "element cave minAttemptLevel",
    );
    const source = requireManualInteraction(
      manualInteractions,
      mapId,
      interactionId,
      groupId,
    );
    const rule = Object.freeze({
      kind: "ring_guardian",
      mapId,
      interactionId,
      groupId,
      claimId: groupId,
      minAttemptLevel,
      rewardItemId,
      rewardName,
      sourceName: source.name,
    });
    addRule(rulesBySource, rule);
    ringRequirements.push(Object.freeze({itemId: rewardItemId, name: rewardName}));
  }
  if (ringRequirements.length < 1) {
    throw new Error("manual encounter access requires at least one element guardian");
  }

  const finalCave = requiredObject(rebirthTrials.finalCave, "rebirthTrials.finalCave");
  const finalGroupId = requiredIdentifier(
    objectOrEmpty(finalCave.rebirthBossGroup).id,
    "finalCave.rebirthBossGroup.id",
  );
  if (finalGroupId !== finalProofId) {
    throw new Error(`final proof ${finalProofId} does not match final guardian group ${finalGroupId}`);
  }
  const finalRule = Object.freeze({
    kind: "final_guardian",
    mapId: requiredIdentifier(finalCave.bossFloorMapId, "finalCave.bossFloorMapId"),
    interactionId: requiredIdentifier(finalCave.bossInteractionId, "finalCave.bossInteractionId"),
    groupId: finalGroupId,
    claimId: finalGroupId,
    minAttemptLevel: requiredPositiveInteger(
      finalCave.minAttemptLevel,
      "finalCave.minAttemptLevel",
    ),
    requiredRings: Object.freeze(ringRequirements.slice()),
    sourceName: "",
  });
  const finalSource = requireManualInteraction(
    manualInteractions,
    finalRule.mapId,
    finalRule.interactionId,
    finalRule.groupId,
  );
  addRule(rulesBySource, Object.freeze({...finalRule, sourceName: finalSource.name}));

  const mmSourceMatches = [...manualInteractions.values()].filter(
    (source) => source.interactionId === mmTrialInteractionId,
  );
  if (mmSourceMatches.length !== 1) {
    throw new Error(
      `MM trial interaction ${mmTrialInteractionId} must resolve to exactly one manual encounter`,
    );
  }
  const mmSource = mmSourceMatches[0];
  addRule(rulesBySource, Object.freeze({
    kind: "mm_trial",
    mapId: mmSource.mapId,
    interactionId: mmSource.interactionId,
    groupId: mmSource.groupId,
    claimId: "",
    minAttemptLevel: 0,
    sourceName: mmSource.name,
  }));

  const missingRuleSources = [...manualInteractions.keys()].filter(
    (sourceKey) => !rulesBySource.has(sourceKey),
  );
  if (missingRuleSources.length > 0) {
    throw new Error(
      `unregistered manual encounter interaction(s): ${missingRuleSources.sort().join(", ")}`,
    );
  }
  if (rulesBySource.size !== manualInteractions.size) {
    throw new Error("manual encounter rule catalog does not exactly cover manual interactions");
  }

  const publicRules = Object.freeze(
    [...rulesBySource.values()].map((rule) => publicRule(rule)),
  );

  function authorize(input = {}) {
    try {
      const mapId = String(input.mapId || "").trim();
      const map = ownValue(objectOrEmpty(catalog.mapsById), mapId);
      if (!map) {
        return failure(false, "manual_encounter_map_invalid", "当前地图没有可用的挑战配置。");
      }
      const intent = safeEncounterIntent(input.request);
      if (!intent.interactionId) {
        const zone = ownValue(objectOrEmpty(map.zonesById), intent.zoneId);
        if (zone && Boolean(zone.manualOnly)) {
          return failure(
            true,
            "manual_encounter_interaction_required",
            "这个挑战必须通过对应守卫发起。",
          );
        }
        return notManual();
      }
      const interaction = ownValue(objectOrEmpty(map.interactionsById), intent.interactionId);
      if (!interaction) {
        return failure(
          false,
          "manual_encounter_interaction_invalid",
          "这个挑战目标不存在或暂不可用。",
        );
      }
      const rule = rulesBySource.get(sourceKey(mapId, intent.interactionId));
      if (!rule) {
        return notManual();
      }
      const participants = normalizedParticipants(input.participants);
      if (!participants.ok) {
        return failure(true, participants.code, participants.message);
      }
      for (let index = 0; index < participants.values.length; index += 1) {
        const participant = participants.values[index];
        const checked = authorizeParticipant(rule, participant, index);
        if (!checked.ok) {
          return checked;
        }
      }
      const publicParticipants = participants.values.map((participant, index) => ({
        accountId: String(participant.accountId || ""),
        displayName: safeParticipantName(participant.displayName, index),
      }));
      const claims = rule.claimId
        ? participants.values.map((participant) => ({
          accountId: String(participant.accountId || ""),
          profileKey: qualificationClaimsKey,
          claimId: rule.claimId,
          rebirthCycle: currentRebirthCycle(participant.profile),
          schemaVersion: 1,
        }))
        : [];
      return {
        ok: true,
        manual: true,
        notManual: false,
        rule: publicRule(rule),
        participants: publicParticipants,
        claims,
        schemaVersion: 1,
      };
    } catch (_error) {
      return failure(
        true,
        "manual_encounter_access_unavailable",
        "挑战资格暂时无法确认，请稍后重试。",
      );
    }
  }

  function authorizeParticipant(rule, participant, participantIndex) {
    const name = safeParticipantName(participant.displayName, participantIndex);
    const profile = participant.profile;
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      return participantFailure(
        name,
        "manual_encounter_profile_missing",
        "角色档案暂不可用。",
      );
    }
    if (rule.kind === "ring_guardian") {
      return authorizeRingGuardian(rule, profile, name);
    }
    if (rule.kind === "final_guardian") {
      return authorizeFinalGuardian(rule, profile, name);
    }
    if (rule.kind === "mm_trial") {
      return authorizeMmTrial(profile, name);
    }
    return participantFailure(
      name,
      "manual_encounter_rule_invalid",
      "挑战规则暂不可用。",
    );
  }

  function authorizeRingGuardian(rule, profile, name) {
    const level = currentLevel(profile);
    if (level < rule.minAttemptLevel) {
      return participantFailure(
        name,
        "manual_guardian_level_required",
        `需要人物达到 Lv${rule.minAttemptLevel} 才能挑战。`,
      );
    }
    const cycle = currentRebirthCycle(profile);
    if (hasQualificationClaim(profile, rule.claimId, cycle)) {
      return participantFailure(
        name,
        "manual_guardian_reward_claimed",
        `本次转生周期已经领取过${rule.rewardName}。`,
      );
    }
    if (safeCount(backpackItemCount(profile, rule.rewardItemId)) > 0) {
      return participantFailure(
        name,
        "manual_guardian_reward_owned",
        `背包中已经持有${rule.rewardName}。`,
      );
    }
    if (safeCount(storageItemCount(profile, rule.rewardItemId)) > 0) {
      return participantFailure(
        name,
        "manual_guardian_reward_stored",
        `仓库中已经持有${rule.rewardName}。`,
      );
    }
    if (!callbackAllows(canReceiveItem(profile, rule.rewardItemId, 1))) {
      return participantFailure(
        name,
        "manual_guardian_reward_capacity_full",
        `没有空间接收${rule.rewardName}，请先整理背包。`,
      );
    }
    return {ok: true};
  }

  function authorizeFinalGuardian(rule, profile, name) {
    const level = currentLevel(profile);
    if (level < rule.minAttemptLevel) {
      return participantFailure(
        name,
        "manual_final_guardian_level_required",
        `需要人物达到 Lv${rule.minAttemptLevel} 才能挑战玄影守卫。`,
      );
    }
    const cycle = currentRebirthCycle(profile);
    if (hasQualificationClaim(profile, rule.claimId, cycle)) {
      return participantFailure(
        name,
        "manual_final_guardian_claimed",
        "本次转生周期已经领取过玄影守护证明。",
      );
    }
    const proofs = objectOrEmpty(profile[finalProofsKey]);
    if (safeCount(ownValue(proofs, finalProofId)) > 0) {
      return participantFailure(
        name,
        "manual_final_guardian_proof_owned",
        "已经持有玄影守护证明。",
      );
    }
    const missingRings = rule.requiredRings.filter(
      (ring) => safeCount(backpackItemCount(profile, ring.itemId)) <= 0,
    );
    if (missingRings.length > 0) {
      return participantFailure(
        name,
        "manual_final_guardian_rings_required",
        `背包缺少${missingRings.map((ring) => ring.name).join("、")}。`,
      );
    }
    return {ok: true};
  }

  function authorizeMmTrial(profile, name) {
    const access = mmTrialAccess(profile);
    if (!callbackAllows(access)) {
      const message = safeMessage(
        access && typeof access === "object" ? access.message : "",
        "暂不符合1转MM试炼条件。",
      );
      return participantFailure(name, safeCode(access, "manual_mm_trial_unavailable"), message);
    }
    if (!callbackAllows(canReceivePet(profile))) {
      return participantFailure(
        name,
        "manual_mm_trial_pet_capacity_full",
        "队伍和兽栏都满了，无法接收1转小MM。",
      );
    }
    return {ok: true};
  }

  function currentLevel(profile) {
    return Math.max(0, Math.trunc(Number(profileLevel(profile) || 0)));
  }

  function currentRebirthCycle(profile) {
    return Math.max(0, Math.trunc(Number(profileRebirthCycle(profile) || 0)));
  }

  function hasQualificationClaim(profile, claimId, cycle) {
    const claims = objectOrEmpty(profile && profile[qualificationClaimsKey]);
    const claim = ownValue(claims, claimId);
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) {
      return false;
    }
    if (claim.claimed === false) {
      return false;
    }
    const claimedCycle = Number(claim.rebirthCycle ?? claim.cycle);
    return Number.isInteger(claimedCycle) && claimedCycle >= 0 && claimedCycle === cycle;
  }

  return Object.freeze({authorize, rules: publicRules});
}

function discoverManualEncounterInteractions(catalog) {
  const result = new Map();
  for (const [mapId, map] of Object.entries(objectOrEmpty(catalog.mapsById))) {
    for (const [interactionId, interaction] of Object.entries(objectOrEmpty(map.interactionsById))) {
      const linkedZoneId = String(interaction.encounterZoneId || "").trim();
      const linkedZone = linkedZoneId
        ? ownValue(objectOrEmpty(map.zonesById), linkedZoneId)
        : null;
      const providesEncounter = Boolean(
        linkedZoneId
        || String(interaction.encounterGroupId || "").trim()
        || String(interaction.actionType || "").trim() === "guardian_battle"
        || Array.isArray(interaction.fixedWildPets)
        || Array.isArray(interaction.wildPetPool),
      );
      if (!providesEncounter) {
        continue;
      }
      const manual = Boolean(
        interaction.manualOnly
        || linkedZoneId
        || linkedZone && linkedZone.manualOnly
        || String(interaction.actionType || "").trim() === "guardian_battle",
      );
      if (!manual) {
        continue;
      }
      const groupId = requiredIdentifier(
        interaction.encounterGroupId || linkedZone && linkedZone.encounterGroupId,
        `manual encounter group for ${mapId}/${interactionId}`,
      );
      const source = Object.freeze({
        mapId: requiredIdentifier(mapId, "manual encounter mapId"),
        interactionId: requiredIdentifier(interactionId, "manual encounter interactionId"),
        groupId,
        name: safeMessage(interaction.name, "挑战目标"),
      });
      result.set(sourceKey(source.mapId, source.interactionId), source);
    }
  }
  if (result.size < 1) {
    throw new Error("manual encounter catalog contains no manual interactions");
  }
  return result;
}

function requireManualInteraction(manualInteractions, mapId, interactionId, groupId) {
  const source = manualInteractions.get(sourceKey(mapId, interactionId));
  if (!source) {
    throw new Error(`missing manual encounter interaction ${mapId}/${interactionId}`);
  }
  if (source.groupId !== groupId) {
    throw new Error(
      `manual encounter ${mapId}/${interactionId} group ${source.groupId} does not match ${groupId}`,
    );
  }
  return source;
}

function addRule(rulesBySource, rule) {
  const key = sourceKey(rule.mapId, rule.interactionId);
  if (rulesBySource.has(key)) {
    throw new Error(`duplicate manual encounter rule ${rule.mapId}/${rule.interactionId}`);
  }
  rulesBySource.set(key, rule);
}

function publicRule(rule) {
  return Object.freeze({
    kind: rule.kind,
    mapId: rule.mapId,
    interactionId: rule.interactionId,
    groupId: rule.groupId,
    claimId: rule.claimId,
    minAttemptLevel: rule.minAttemptLevel,
    rewardItemId: String(rule.rewardItemId || ""),
    schemaVersion: 1,
  });
}

function normalizedParticipants(value) {
  if (!Array.isArray(value) || value.length < 1) {
    return {
      ok: false,
      code: "manual_encounter_participants_missing",
      message: "无法确认挑战队伍，请重新组队后再试。",
    };
  }
  const seenAccountIds = new Set();
  const values = [];
  for (let index = 0; index < value.length; index += 1) {
    const participant = value[index];
    if (!participant || typeof participant !== "object" || Array.isArray(participant)) {
      return {
        ok: false,
        code: "manual_encounter_participant_invalid",
        message: `队员${index + 1}的挑战资料暂不可用。`,
      };
    }
    const accountId = String(participant.accountId || "").trim();
    if (!accountId || seenAccountIds.has(accountId)) {
      return {
        ok: false,
        code: "manual_encounter_participant_invalid",
        message: `${safeParticipantName(participant.displayName, index)}的队伍身份无效。`,
      };
    }
    seenAccountIds.add(accountId);
    values.push(participant);
  }
  return {ok: true, values};
}

function notManual() {
  return {ok: true, manual: false, notManual: true, schemaVersion: 1};
}

function participantFailure(name, code, reason) {
  return failure(true, code, `${name}：${safeMessage(reason, "暂不符合挑战条件。")}`);
}

function failure(manual, code, message) {
  return {
    ok: false,
    manual: Boolean(manual),
    notManual: false,
    code: safeCode({code}, "manual_encounter_access_denied"),
    message: safeMessage(message, "暂时无法开始挑战。"),
    schemaVersion: 1,
  };
}

function callbackAllows(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value.ok === true;
  }
  return value === true;
}

function safeCount(value) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function safeParticipantName(value, index) {
  const name = safeMessage(value, `队员${index + 1}`);
  return name.length > 24 ? name.slice(0, 24) : name;
}

function safeMessage(value, fallback) {
  const text = String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return fallback;
  }
  return text.length > 160 ? text.slice(0, 160) : text;
}

function safeCode(value, fallback) {
  const code = String(value && value.code || "").trim();
  return /^[a-z][a-z0-9_]{0,95}$/.test(code) ? code : fallback;
}

function sourceKey(mapId, interactionId) {
  return `${mapId}/${interactionId}`;
}

function requiredArray(value, label) {
  if (!Array.isArray(value) || value.length < 1) {
    throw new Error(`${label} must be a non-empty array`);
  }
  return value;
}

function requiredObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requiredFunction(value, label) {
  if (typeof value !== "function") {
    throw new Error(`${label} must be a function`);
  }
  return value;
}

function requiredText(value, label) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`missing ${label}`);
  }
  return text;
}

function requiredIdentifier(value, label) {
  const text = requiredText(value, label);
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(text)) {
    throw new Error(`invalid ${label}: ${text}`);
  }
  return text;
}

function requiredFieldName(value, label) {
  const text = requiredText(value, label);
  if (!/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(text)) {
    throw new Error(`invalid ${label}: ${text}`);
  }
  return text;
}

function requiredPositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return number;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function ownValue(record, key) {
  if (!record || typeof record !== "object" || !Object.hasOwn(record, key)) {
    return null;
  }
  return record[key] ?? null;
}

module.exports = {createManualEncounterAccess};
