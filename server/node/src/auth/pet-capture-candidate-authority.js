"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {isDeepStrictEqual} = require("node:util");

const {
  PROFILE_RESOLUTION_AUTHORITY_V1,
  PROFILE_RESOLUTION_LEGACY_UNLINKED,
} = require("./pet-growth-catalog");
const {
  settlePetGrowthToLevel,
  validatePetGrowth,
} = require("./pet-growth-runtime");
const {isValidPetPrivateSeed} = require("./pet-private-seed");
const {selectWildCaptureGrowthDraw} = require("./wild-capture-growth-selection");

const SCHEMA_VERSION = 1;
const AUTHORITY = "server_pet_capture_candidate_v1";
const PRIVATE_CANDIDATE_KEY = "captureCandidatesByActorId";
const STATUS_AVAILABLE = "available";
const STATUS_CLAIMED = "claimed";
const MAX_LEVEL = 140;
const STAT_KEYS = Object.freeze(["maxHp", "attack", "defense", "quick"]);
const ELEMENT_KEYS = Object.freeze(["fire", "water", "earth", "wind"]);
const CANDIDATE_KEYS = Object.freeze([
  "schemaVersion",
  "authority",
  "candidateId",
  "actorId",
  "formId",
  "encounterLevel",
  "growthKind",
  "pet",
  "captureSecret",
  "integrityTag",
  "attemptCount",
  "lastAttempt",
  "status",
  "claimedByAccountId",
]);
const LAST_ATTEMPT_KEYS = Object.freeze([
  "attemptNumber",
  "accountId",
  "captureToolId",
]);
const CONFIGURATION_KEYS = new Set([
  "growthCatalog",
  "newPetFactory",
  "templateResolver",
  "expToNextLevel",
  "randomBytes",
  "legacyGrowthDocument",
]);
const MATERIALIZE_KEYS = new Set([
  "actorId",
  "accountId",
  "state",
  "capturedSerial",
  "captureStatusIds",
]);
const DEFAULT_LEGACY_GROWTH_PATH = path.resolve(
  __dirname,
  "../../../../client/godot/data/balance/pet_growth_profiles.json",
);
const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TOOL_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const CANDIDATE_ID_PATTERN = /^capture_candidate_[0-9a-f]{36}$/;
const PET_INSTANCE_ID_PATTERN = /^pet_capture_[0-9a-f]{36}$/;
const SECRET_PATTERN = /^[0-9a-f]{64}$/;
const TAG_PATTERN = /^[0-9a-f]{64}$/;

function isObjectRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasExactKeys(value, keys) {
  return isObjectRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => hasOwn(value, key));
}

function clone(value) {
  return structuredClone(value);
}

function normalizedErrors(errors) {
  return (Array.isArray(errors) ? errors : [errors])
    .map((error) => String(error || "").trim())
    .filter(Boolean);
}

function fail(code, errors) {
  return {
    ok: false,
    code: String(code || "pet_capture_candidate_invalid"),
    errors: normalizedErrors(errors),
    schemaVersion: SCHEMA_VERSION,
  };
}

function ok(fields = {}) {
  return {ok: true, ...fields, schemaVersion: SCHEMA_VERSION};
}

function strictId(value) {
  return typeof value === "string" && value === value.trim() && STABLE_ID_PATTERN.test(value)
    ? value
    : "";
}

function strictToolId(value) {
  return typeof value === "string" && value === value.trim() && TOOL_ID_PATTERN.test(value)
    ? value
    : "";
}

function uniqueStringArray(value) {
  const result = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const text = typeof entry === "string" ? entry.trim() : "";
    if (text !== "" && entry === text && !result.includes(text)) {
      result.push(text);
    }
  }
  return result;
}

function roundHalfAwayFromZero(value) {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

function stableJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("candidate facts must contain only finite numbers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isObjectRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(",")}}`;
  }
  throw new TypeError("candidate facts must be JSON-compatible");
}

function immutableCandidateFacts(candidate) {
  return {
    schemaVersion: candidate.schemaVersion,
    authority: candidate.authority,
    candidateId: candidate.candidateId,
    actorId: candidate.actorId,
    formId: candidate.formId,
    encounterLevel: candidate.encounterLevel,
    growthKind: candidate.growthKind,
    pet: candidate.pet,
  };
}

function integrityTag(candidate) {
  return crypto.createHmac("sha256", Buffer.from(candidate.captureSecret, "hex"))
    .update("beastbound-odyssey/capture-candidate-integrity/v1", "utf8")
    .update(Buffer.from([0]))
    .update(stableJson(immutableCandidateFacts(candidate)), "utf8")
    .digest("hex");
}

function safeTagEquals(actual, expected) {
  if (!TAG_PATTERN.test(String(actual || "")) || !TAG_PATTERN.test(String(expected || ""))) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function captureRollForCandidate(candidate, attempt) {
  const message = [
    "beastbound-odyssey/capture-roll/v1",
    candidate.candidateId,
    candidate.actorId,
    attempt.accountId,
    attempt.captureToolId,
    String(attempt.attemptNumber),
  ].join("\0");
  const digest = crypto.createHmac("sha256", Buffer.from(candidate.captureSecret, "hex"))
    .update(message, "utf8")
    .digest();
  return digest.readUIntBE(0, 6) / 0x1000000000000;
}

function defaultLegacyGrowthDocument() {
  const parsed = JSON.parse(fs.readFileSync(DEFAULT_LEGACY_GROWTH_PATH, "utf8"));
  if (!isObjectRecord(parsed)) {
    throw new TypeError("legacy pet growth document root must be an object");
  }
  return parsed;
}

function validateLegacyGrowthDocument(document) {
  const errors = [];
  if (!isObjectRecord(document) || document.schemaVersion !== 1) {
    return ["legacyGrowthDocument must be the shared schema-v1 object"];
  }
  const variance = document.individualVariance;
  if (!isObjectRecord(variance)) {
    errors.push("legacyGrowthDocument.individualVariance must be an object");
  } else {
    for (const [field, integer] of [["initialBonus", true], ["growthBonus", false]]) {
      const ranges = variance[field];
      if (!isObjectRecord(ranges)) {
        errors.push(`legacyGrowthDocument.individualVariance.${field} must be an object`);
        continue;
      }
      for (const key of STAT_KEYS) {
        const range = ranges[key];
        if (
          !Array.isArray(range)
          || range.length !== 2
          || !range.every((entry) => typeof entry === "number" && Number.isFinite(entry))
          || range[0] > range[1]
          || (integer && !range.every(Number.isInteger))
        ) {
          errors.push(`legacyGrowthDocument ${field}.${key} range is invalid`);
        }
      }
    }
  }
  const profileIds = new Set();
  for (const [index, profile] of (Array.isArray(document.profiles) ? document.profiles : []).entries()) {
    const profileId = strictId(profile && profile.id);
    if (!isObjectRecord(profile) || profileId === "" || profileIds.has(profileId)) {
      errors.push(`legacyGrowthDocument.profiles[${index}] identity is invalid`);
      continue;
    }
    profileIds.add(profileId);
    if (!isObjectRecord(profile.perLevel)) {
      errors.push(`legacy growth profile ${profileId} perLevel is invalid`);
      continue;
    }
    for (const key of STAT_KEYS) {
      if (typeof profile.perLevel[key] !== "number" || !Number.isFinite(profile.perLevel[key]) || profile.perLevel[key] <= 0) {
        errors.push(`legacy growth profile ${profileId}.${key} must be positive`);
      }
    }
  }
  if (!profileIds.has("balanced")) {
    errors.push("legacyGrowthDocument requires balanced profile");
  }
  const quality = document.quality;
  if (
    !isObjectRecord(quality)
    || !Number.isInteger(quality.lowThreshold)
    || !Number.isInteger(quality.highThreshold)
    || quality.lowThreshold < 0
    || quality.highThreshold > 10000
    || quality.lowThreshold >= quality.highThreshold
    || !isObjectRecord(quality.labels)
  ) {
    errors.push("legacyGrowthDocument.quality is invalid");
  }
  return errors;
}

function validateConfiguration(options) {
  const errors = [];
  if (!isObjectRecord(options)) {
    return ["factory options must be an object"];
  }
  if (Object.keys(options).some((key) => !CONFIGURATION_KEYS.has(key))) {
    errors.push("factory options contain unknown fields");
  }
  if (
    !isObjectRecord(options.growthCatalog)
    || !Object.isFrozen(options.growthCatalog)
    || typeof options.growthCatalog.resolveNewPetProfile !== "function"
    || typeof options.growthCatalog.profileForFormId !== "function"
    || !isObjectRecord(options.growthCatalog.wildCaptureGrowthPolicy)
    || !Object.isFrozen(options.growthCatalog.wildCaptureGrowthPolicy)
  ) {
    errors.push("growthCatalog must be an injected strict frozen catalog with wild-capture growth policy");
  }
  if (
    !isObjectRecord(options.newPetFactory)
    || !Object.isFrozen(options.newPetFactory)
    || typeof options.newPetFactory.finalizeLevelOne !== "function"
  ) {
    errors.push("newPetFactory must be an injected strict frozen factory");
  }
  if (typeof options.templateResolver !== "function") {
    errors.push("templateResolver must be injected");
  }
  if (typeof options.expToNextLevel !== "function") {
    errors.push("expToNextLevel must be injected");
  }
  if (hasOwn(options, "randomBytes") && typeof options.randomBytes !== "function") {
    errors.push("randomBytes must be a function when injected");
  }
  return errors;
}

function stableHash(text) {
  let hash = 2166136261n;
  for (const character of String(text)) {
    hash = ((hash ^ BigInt(character.codePointAt(0))) * 16777619n) % 2147483647n;
  }
  return Number(hash < 0n ? -hash : hash);
}

function legacyRollInt(seed, key, range) {
  const span = Math.max(1, range[1] - range[0] + 1);
  return range[0] + (stableHash(`${seed}:${key}`) % span);
}

function legacyRollFloat(seed, key, range) {
  const unit = (stableHash(`${seed}:${key}`) % 10001) / 10000;
  return range[0] + ((range[1] - range[0]) * unit);
}

function legacyGrowthTierLabel(tierId) {
  const normalized = String(tierId || "").trim().toLowerCase();
  if (normalized === "" || normalized === "balanced") {
    return "均衡";
  }
  const labels = [];
  if (normalized.includes("attack")) {
    labels.push("攻击");
  }
  if (["agility", "quick", "speed"].some((part) => normalized.includes(part))) {
    labels.push("敏捷");
  }
  if (normalized.includes("defense")) {
    labels.push("防御");
  }
  if (["hp", "health", "stamina", "survival"].some((part) => normalized.includes(part))) {
    labels.push("生命");
  }
  return labels.length > 0 ? labels.join(" / ") : "未记录";
}

function templateBaseStats(template) {
  const source = isObjectRecord(template && template.baseStats) ? template.baseStats : {};
  const result = {
    maxHp: source.maxHp,
    attack: source.attack,
    defense: source.defense,
    quick: hasOwn(source, "agility") ? source.agility : source.quick,
  };
  if (!STAT_KEYS.every((key) => Number.isInteger(result[key]) && result[key] >= 1)) {
    throw new TypeError("pet template requires four positive integer base stats");
  }
  return result;
}

function templateElements(template) {
  const source = isObjectRecord(template && template.elements) ? template.elements : {};
  const result = Object.fromEntries(ELEMENT_KEYS.map((key) => [key, source[key]]));
  if (
    !ELEMENT_KEYS.every((key) => Number.isInteger(result[key]) && result[key] >= 0 && result[key] <= 10)
    || ELEMENT_KEYS.reduce((sum, key) => sum + result[key], 0) !== 10
  ) {
    throw new TypeError("pet template elements must contain an exact ten-point distribution");
  }
  return result;
}

function legacyGrowthSnapshot(template, seed, level, legacyDocument) {
  if (!isValidPetPrivateSeed(seed)) {
    throw new TypeError("legacy capture candidate private seed is invalid");
  }
  const tierId = strictId(template.growthProfileId) || "balanced";
  const profile = legacyDocument.profiles.find((entry) => entry && entry.id === tierId);
  if (!profile) {
    throw new TypeError(`legacy growth profile ${tierId} is missing`);
  }
  const initialRanges = legacyDocument.individualVariance.initialBonus;
  const growthRanges = legacyDocument.individualVariance.growthBonus;
  const initialBonus = {
    maxHp: legacyRollInt(seed, "initial_maxHp", initialRanges.maxHp),
    attack: legacyRollInt(seed, "initial_attack", initialRanges.attack),
    defense: legacyRollInt(seed, "initial_defense", initialRanges.defense),
    quick: legacyRollInt(seed, "initial_quick", initialRanges.quick),
  };
  const growthBonus = {
    maxHp: legacyRollFloat(seed, "growth_maxHp", growthRanges.maxHp),
    attack: legacyRollFloat(seed, "growth_attack", growthRanges.attack),
    defense: legacyRollFloat(seed, "growth_defense", growthRanges.defense),
    quick: legacyRollFloat(seed, "growth_quick", growthRanges.quick),
  };
  const qualityRoll = stableHash(`${seed}:quality`) % 10001;
  const individualVariance = {
    schemaVersion: SCHEMA_VERSION,
    qualityRoll,
    initialBonus,
    growthBonus,
  };
  const baseStats = templateBaseStats(template);
  const initialStats = Object.fromEntries(STAT_KEYS.map((key) => [
    key,
    Math.max(1, roundHalfAwayFromZero(baseStats[key] + initialBonus[key])),
  ]));
  const levelBonus = Math.max(0, level - 1);
  const growthRates = Object.fromEntries(STAT_KEYS.map((key) => [key, profile.perLevel[key]]));
  const statGains = Object.fromEntries(STAT_KEYS.map((key) => [
    key,
    roundHalfAwayFromZero(Math.max(0, growthRates[key] + growthBonus[key]) * levelBonus),
  ]));
  const finalStats = Object.fromEntries(STAT_KEYS.map((key) => [
    key,
    Math.max(1, roundHalfAwayFromZero(initialStats[key] + statGains[key])),
  ]));
  let qualityScore = qualityRoll;
  qualityScore += initialBonus.maxHp * 120;
  qualityScore += initialBonus.attack * 400;
  qualityScore += initialBonus.defense * 350;
  qualityScore += initialBonus.quick * 300;
  qualityScore += roundHalfAwayFromZero(growthBonus.maxHp * 600);
  qualityScore += roundHalfAwayFromZero(growthBonus.attack * 2200);
  qualityScore += roundHalfAwayFromZero(growthBonus.defense * 2000);
  qualityScore += roundHalfAwayFromZero(growthBonus.quick * 1800);
  qualityScore = Math.max(0, Math.min(10000, qualityScore));
  const quality = legacyDocument.quality;
  const qualityLabel = qualityScore >= quality.highThreshold
    ? String(quality.labels.high || "偏高")
    : (qualityScore <= quality.lowThreshold
      ? String(quality.labels.low || "偏低")
      : String(quality.labels.normal || "普通"));
  return {
    growthTierId: tierId,
    growthTierLabel: legacyGrowthTierLabel(tierId),
    individualVariance,
    individualQualityScore: qualityScore,
    individualQualityLabel: qualityLabel,
    initialStats,
    growthRecord: {
      schemaVersion: SCHEMA_VERSION,
      level,
      growthTierId: tierId,
      baseStats,
      growthRates,
      individualVariance,
      initialStats,
      statGains,
      finalStats,
    },
    finalStats,
  };
}

function applyLegacyGrowth(pet, template, level, legacyDocument) {
  const snapshot = legacyGrowthSnapshot(template, pet.individualSeed, level, legacyDocument);
  const next = clone(pet);
  next.growthTierId = snapshot.growthTierId;
  next.growthTierLabel = snapshot.growthTierLabel;
  next.individualVariance = clone(snapshot.individualVariance);
  next.individualQualityScore = snapshot.individualQualityScore;
  next.individualQualityLabel = snapshot.individualQualityLabel;
  next.initialStats = clone(snapshot.initialStats);
  next.growthSpeciesLevel1Stats = clone(snapshot.initialStats);
  next.growthRecord = clone(snapshot.growthRecord);
  next.level = level;
  for (const key of STAT_KEYS) {
    next[key] = snapshot.finalStats[key];
  }
  next.hp = next.maxHp;
  return next;
}

function normalizedTemplate(template, formId) {
  if (!isObjectRecord(template) || strictId(template.formId) !== formId) {
    throw new TypeError(`pet template ${formId} is missing or mismatched`);
  }
  if (String(template.formName || "").trim() === "") {
    throw new TypeError(`pet template ${formId} requires formName`);
  }
  if (strictId(template.lineId) === "" || strictId(template.subtypeId) === "") {
    throw new TypeError(`pet template ${formId} taxonomy is incomplete`);
  }
  if (!isObjectRecord(template.capture) || template.capture.catchable === false) {
    throw new TypeError(`pet template ${formId} is not catchable`);
  }
  templateBaseStats(template);
  templateElements(template);
  return clone(template);
}

function normalizedSkillSlots(activeSkillIds, value) {
  const slots = Array.from({length: 7}, () => "");
  const active = new Set(activeSkillIds);
  const used = new Set();
  for (let index = 0; index < Math.min(7, Array.isArray(value) ? value.length : 0); index += 1) {
    const skillId = typeof value[index] === "string" ? value[index].trim() : "";
    if (skillId !== "" && active.has(skillId) && !used.has(skillId)) {
      slots[index] = skillId;
      used.add(skillId);
    }
  }
  for (const skillId of activeSkillIds) {
    if (used.has(skillId)) {
      continue;
    }
    const emptyIndex = slots.indexOf("");
    if (emptyIndex >= 0) {
      slots[emptyIndex] = skillId;
      used.add(skillId);
    }
  }
  return slots;
}

function freshLevelOnePet(candidateId, template, expToNextLevel) {
  const formId = strictId(template.formId);
  const stats = templateBaseStats(template);
  const activeSkillIds = uniqueStringArray(template.activeSkillIds);
  const nextExp = expToNextLevel(1);
  if (!Number.isInteger(nextExp) || nextExp < 1) {
    throw new TypeError("expToNextLevel must return a positive integer");
  }
  const pet = {
    instanceId: candidateId,
    petId: candidateId,
    templateId: formId,
    formId,
    speciesId: formId,
    lineId: strictId(template.lineId),
    subtypeId: strictId(template.subtypeId),
    name: String(template.formName).trim(),
    state: "standby",
    level: 1,
    exp: 0,
    nextExp,
    hp: stats.maxHp,
    ...stats,
    elements: templateElements(template),
    activeSkillIds,
    petSkillSlots: normalizedSkillSlots(activeSkillIds, template.petSkillSlots),
    passiveSkillIds: uniqueStringArray(template.passiveSkillIds),
    isNew: true,
    schemaVersion: SCHEMA_VERSION,
  };
  const growthSpeciesProfileId = strictId(template.growthSpeciesProfileId);
  if (growthSpeciesProfileId !== "") {
    pet.growthSpeciesProfileId = growthSpeciesProfileId;
  }
  return pet;
}

function candidateActors(room) {
  const actors = room && room.battle && Array.isArray(room.battle.actors)
    ? room.battle.actors
    : [];
  return actors.filter((actor) => (
    isObjectRecord(actor)
    && String(actor.side || "") === "enemy"
    && String(actor.kind || "") === "wild_pet"
    && Boolean(actor.catchable)
  ));
}

function actorById(room, actorId) {
  return room && room.battle && Array.isArray(room.battle.actors)
    ? room.battle.actors.find((actor) => actor && actor.actorId === actorId) || null
    : null;
}

function validateRoomBase(room, options = {}) {
  const errors = [];
  if (!isObjectRecord(room)) {
    return ["room must be an object"];
  }
  if (strictId(room.roomId) === "") {
    errors.push("room.roomId must be a stable id");
  }
  if (!isObjectRecord(room.battle) || !Array.isArray(room.battle.actors)) {
    errors.push("room.battle.actors must be an array");
  }
  const participants = Array.isArray(room.participantAccountIds) ? room.participantAccountIds : [];
  if (
    (!Boolean(options.allowEmptyParticipants) && participants.length < 1)
    || participants.some((accountId) => strictId(accountId) === "")
    || new Set(participants).size !== participants.length
  ) {
    errors.push("room.participantAccountIds must contain unique stable ids");
  }
  const candidateActorIds = candidateActors(room).map((actor) => strictId(actor.actorId));
  if (candidateActorIds.some((actorId) => actorId === "") || new Set(candidateActorIds).size !== candidateActorIds.length) {
    errors.push("catchable wild actors require unique stable actor ids");
  }
  for (const actor of candidateActors(room)) {
    if (strictId(actor.formId || actor.speciesId) === "") {
      errors.push(`catchable actor ${String(actor.actorId || "<unknown>")} requires formId`);
    }
    if (!Number.isInteger(actor.level) || actor.level < 1 || actor.level > MAX_LEVEL) {
      errors.push(`catchable actor ${String(actor.actorId || "<unknown>")} level is invalid`);
    }
  }
  return errors;
}

function createPetCaptureCandidateAuthority(options = {}) {
  const configurationErrors = validateConfiguration(options);
  if (configurationErrors.length > 0) {
    throw new TypeError(`pet capture candidate authority configuration invalid: ${configurationErrors.join("; ")}`);
  }
  const growthCatalog = options.growthCatalog;
  const newPetFactory = options.newPetFactory;
  const templateResolver = options.templateResolver;
  const expToNextLevel = options.expToNextLevel;
  const randomBytes = options.randomBytes || crypto.randomBytes;
  let legacyDocument;
  try {
    legacyDocument = clone(hasOwn(options, "legacyGrowthDocument")
      ? options.legacyGrowthDocument
      : defaultLegacyGrowthDocument());
  } catch (error) {
    throw new TypeError(`pet capture candidate authority configuration invalid: ${error.message}`);
  }
  const legacyErrors = validateLegacyGrowthDocument(legacyDocument);
  if (legacyErrors.length > 0) {
    throw new TypeError(`pet capture candidate authority configuration invalid: ${legacyErrors.join("; ")}`);
  }

  function randomHex(byteLength) {
    const generated = randomBytes(byteLength);
    if (!Buffer.isBuffer(generated) && !(generated instanceof Uint8Array)) {
      throw new TypeError("capture candidate CSPRNG must return bytes");
    }
    const bytes = Buffer.from(generated);
    if (bytes.length !== byteLength) {
      throw new TypeError(`capture candidate CSPRNG must return exactly ${byteLength} bytes`);
    }
    return bytes.toString("hex");
  }

  function uniqueCandidateId(used) {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const candidateId = `capture_candidate_${randomHex(18)}`;
      if (!used.has(candidateId)) {
        used.add(candidateId);
        return candidateId;
      }
    }
    throw new TypeError("capture candidate CSPRNG produced duplicate identities");
  }

  function uniqueCaptureSecret(used) {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const secret = randomHex(32);
      if (!used.has(secret)) {
        used.add(secret);
        return secret;
      }
    }
    throw new TypeError("capture candidate CSPRNG produced duplicate secrets");
  }

  function uniquePetInstanceId(used) {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const instanceId = `pet_capture_${randomHex(18)}`;
      if (!used.has(instanceId)) {
        used.add(instanceId);
        return instanceId;
      }
    }
    throw new TypeError("capture candidate CSPRNG produced duplicate pet identities");
  }

  function resolveTemplate(formId) {
    return normalizedTemplate(templateResolver(formId), formId);
  }

  function settleCandidatePet(candidateId, template, encounterLevel) {
    const freshPet = freshLevelOnePet(candidateId, template, expToNextLevel);
    const profile = growthCatalog.profileForFormId(template.formId);
    let finalized;
    let pet;
    if (profile) {
      const selected = selectWildCaptureGrowthDraw({
        profile,
        encounterLevel,
        policy: growthCatalog.wildCaptureGrowthPolicy,
        draw() {
          const drawFinalized = newPetFactory.finalizeLevelOne(freshPet, {
            purpose: "capture_candidate_growth",
          });
          if (
            !isObjectRecord(drawFinalized)
            || !isObjectRecord(drawFinalized.pet)
            || drawFinalized.growthKind !== PROFILE_RESOLUTION_AUTHORITY_V1
            || drawFinalized.profileId !== profile.profileId
          ) {
            throw new TypeError("strict growth profile resolution changed during capture preparation");
          }
          const privateState = drawFinalized.pet.petGrowth && drawFinalized.pet.petGrowth.private;
          if (
            !isObjectRecord(privateState)
            || typeof privateState.privateSeed !== "string"
            || !isObjectRecord(privateState.privateRoll)
          ) {
            throw new TypeError("newPetFactory returned incomplete authority growth state");
          }
          return {
            privateSeed: privateState.privateSeed,
            privateRoll: privateState.privateRoll,
            value: drawFinalized,
          };
        },
      });
      finalized = selected.value;
      pet = settlePetGrowthToLevel(finalized.pet, profile, encounterLevel).pet;
    } else {
      finalized = newPetFactory.finalizeLevelOne(freshPet, {
        purpose: "capture_candidate_growth",
      });
      if (!isObjectRecord(finalized) || !isObjectRecord(finalized.pet)) {
        throw new TypeError("newPetFactory returned an invalid pet");
      }
    }
    if (!profile && finalized.growthKind === PROFILE_RESOLUTION_LEGACY_UNLINKED) {
      pet = applyLegacyGrowth(finalized.pet, template, encounterLevel, legacyDocument);
    } else if (!profile) {
      throw new TypeError("newPetFactory returned an unsupported capture growth route");
    }
    const nextExp = expToNextLevel(encounterLevel);
    if (!Number.isInteger(nextExp) || nextExp < 1) {
      throw new TypeError("expToNextLevel must return a positive integer");
    }
    pet.level = encounterLevel;
    pet.exp = 0;
    pet.nextExp = nextExp;
    pet.hp = pet.maxHp;
    return {pet, growthKind: finalized.growthKind};
  }

  function synchronizeActorWithCandidate(actor, candidate) {
    const pet = candidate.pet;
    actor.formId = pet.formId;
    actor.speciesId = pet.speciesId;
    actor.lineId = pet.lineId;
    actor.level = pet.level;
    actor.hp = pet.maxHp;
    actor.maxHp = pet.maxHp;
    actor.attack = pet.attack;
    actor.defense = pet.defense;
    actor.speed = pet.quick;
    actor.elements = clone(pet.elements);
    actor.activeSkillIds = clone(pet.activeSkillIds);
    actor.petSkillSlots = clone(pet.petSkillSlots);
    actor.passiveSkillIds = clone(pet.passiveSkillIds);
  }

  function buildCandidate(actor, usedCandidateIds, usedPetInstanceIds, usedSecrets) {
    const actorId = strictId(actor.actorId);
    const formId = strictId(actor.formId || actor.speciesId);
    const template = resolveTemplate(formId);
    const candidateId = uniqueCandidateId(usedCandidateIds);
    const petInstanceId = uniquePetInstanceId(usedPetInstanceIds);
    const captureSecret = uniqueCaptureSecret(usedSecrets);
    const settled = settleCandidatePet(petInstanceId, template, actor.level);
    const candidate = {
      schemaVersion: SCHEMA_VERSION,
      authority: AUTHORITY,
      candidateId,
      actorId,
      formId,
      encounterLevel: actor.level,
      growthKind: settled.growthKind,
      pet: settled.pet,
      captureSecret,
      integrityTag: "",
      attemptCount: 0,
      lastAttempt: null,
      status: STATUS_AVAILABLE,
      claimedByAccountId: "",
    };
    candidate.integrityTag = integrityTag(candidate);
    return candidate;
  }

  function validatePetFacts(candidate, template) {
    const pet = candidate.pet;
    const errors = [];
    if (!isObjectRecord(pet)) {
      return ["candidate.pet must be an object"];
    }
    if (
      !PET_INSTANCE_ID_PATTERN.test(String(pet.instanceId || ""))
      || pet.petId !== pet.instanceId
      || pet.instanceId === candidate.candidateId
      || pet.formId !== candidate.formId
      || pet.templateId !== candidate.formId
      || pet.speciesId !== candidate.formId
    ) {
      errors.push("candidate pet identity does not match its frozen encounter identity");
    }
    if (pet.level !== candidate.encounterLevel || pet.exp !== 0) {
      errors.push("candidate pet level or exp changed after encounter preparation");
    }
    let expectedNextExp = 0;
    try {
      expectedNextExp = expToNextLevel(candidate.encounterLevel);
    } catch (_error) {
      errors.push("candidate next-exp rule could not be evaluated");
    }
    if (!Number.isInteger(expectedNextExp) || expectedNextExp < 1 || pet.nextExp !== expectedNextExp) {
      errors.push("candidate pet nextExp does not match the server rule");
    }
    if (!STAT_KEYS.every((key) => Number.isInteger(pet[key]) && pet[key] >= 1) || pet.hp !== pet.maxHp) {
      errors.push("candidate pet stats are invalid or not fully healed");
    }
    const activeSkillIds = uniqueStringArray(template.activeSkillIds);
    if (
      pet.lineId !== strictId(template.lineId)
      || pet.subtypeId !== strictId(template.subtypeId)
      || pet.name !== String(template.formName).trim()
      || !isDeepStrictEqual(pet.elements, templateElements(template))
      || !isDeepStrictEqual(pet.activeSkillIds, activeSkillIds)
      || !isDeepStrictEqual(pet.petSkillSlots, normalizedSkillSlots(activeSkillIds, template.petSkillSlots))
      || !isDeepStrictEqual(pet.passiveSkillIds, uniqueStringArray(template.passiveSkillIds))
    ) {
      errors.push("candidate pet taxonomy, element, or skill facts changed");
    }
    if (candidate.growthKind === PROFILE_RESOLUTION_AUTHORITY_V1) {
      const profile = growthCatalog.profileForFormId(candidate.formId);
      const validation = profile ? validatePetGrowth(pet, profile) : null;
      if (!validation || !validation.ok) {
        errors.push("candidate authority-v1 growth facts are invalid");
      }
    } else if (candidate.growthKind === PROFILE_RESOLUTION_LEGACY_UNLINKED) {
      try {
        const snapshot = legacyGrowthSnapshot(template, pet.individualSeed, candidate.encounterLevel, legacyDocument);
        const fields = [
          "growthTierId",
          "growthTierLabel",
          "individualVariance",
          "individualQualityScore",
          "individualQualityLabel",
          "initialStats",
          "growthRecord",
        ];
        if (
          hasOwn(pet, "petGrowth")
          || !isDeepStrictEqual(pet.growthSpeciesLevel1Stats, snapshot.initialStats)
          || fields.some((field) => !isDeepStrictEqual(pet[field], snapshot[field]))
          || STAT_KEYS.some((key) => pet[key] !== snapshot.finalStats[key])
        ) {
          errors.push("candidate legacy growth facts do not match the shared deterministic model");
        }
      } catch (_error) {
        errors.push("candidate legacy growth facts could not be recomputed");
      }
    } else {
      errors.push("candidate growth route is unsupported");
    }
    return errors;
  }

  function validateCandidate(candidate, actor) {
    const errors = [];
    if (!hasExactKeys(candidate, CANDIDATE_KEYS)) {
      return ["capture candidate has a non-canonical shape"];
    }
    if (
      candidate.schemaVersion !== SCHEMA_VERSION
      || candidate.authority !== AUTHORITY
      || !CANDIDATE_ID_PATTERN.test(candidate.candidateId)
      || candidate.actorId !== strictId(actor && actor.actorId)
      || candidate.formId !== strictId(actor && (actor.formId || actor.speciesId))
      || candidate.encounterLevel !== actor.level
      || !Number.isInteger(candidate.encounterLevel)
      || candidate.encounterLevel < 1
      || candidate.encounterLevel > MAX_LEVEL
    ) {
      errors.push("capture candidate encounter binding is invalid");
    }
    if (!SECRET_PATTERN.test(candidate.captureSecret) || !TAG_PATTERN.test(candidate.integrityTag)) {
      errors.push("capture candidate private secret or integrity tag is invalid");
    } else {
      try {
        if (!safeTagEquals(candidate.integrityTag, integrityTag(candidate))) {
          errors.push("capture candidate immutable facts failed integrity validation");
        }
      } catch (_error) {
        errors.push("capture candidate immutable facts are not canonical");
      }
    }
    if (!Number.isInteger(candidate.attemptCount) || candidate.attemptCount < 0) {
      errors.push("capture candidate attemptCount is invalid");
    }
    if (candidate.attemptCount === 0) {
      if (candidate.lastAttempt !== null) {
        errors.push("capture candidate has an attempt record without an attempt");
      }
    } else if (
      !hasExactKeys(candidate.lastAttempt, LAST_ATTEMPT_KEYS)
      || candidate.lastAttempt.attemptNumber !== candidate.attemptCount
      || strictId(candidate.lastAttempt.accountId) === ""
      || strictToolId(candidate.lastAttempt.captureToolId) === ""
    ) {
      errors.push("capture candidate lastAttempt is invalid");
    }
    if (candidate.status === STATUS_AVAILABLE) {
      if (candidate.claimedByAccountId !== "") {
        errors.push("available capture candidate cannot have an owner");
      }
    } else if (candidate.status === STATUS_CLAIMED) {
      if (
        strictId(candidate.claimedByAccountId) === ""
        || !candidate.lastAttempt
        || candidate.lastAttempt.accountId !== candidate.claimedByAccountId
      ) {
        errors.push("claimed capture candidate requires the last valid attempt owner");
      }
    } else {
      errors.push("capture candidate status is invalid");
    }
    try {
      errors.push(...validatePetFacts(candidate, resolveTemplate(candidate.formId)));
    } catch (_error) {
      errors.push("capture candidate template facts could not be resolved");
    }
    const pet = candidate && candidate.pet;
    if (
      isObjectRecord(pet)
      && (
        actor.formId !== pet.formId
        || actor.speciesId !== pet.speciesId
        || actor.lineId !== pet.lineId
        || actor.level !== pet.level
        || actor.maxHp !== pet.maxHp
        || actor.attack !== pet.attack
        || actor.defense !== pet.defense
        || actor.speed !== pet.quick
        || !isDeepStrictEqual(actor.elements, pet.elements)
        || !isDeepStrictEqual(actor.activeSkillIds, pet.activeSkillIds)
        || !isDeepStrictEqual(actor.petSkillSlots, pet.petSkillSlots)
        || !isDeepStrictEqual(actor.passiveSkillIds, pet.passiveSkillIds)
      )
    ) {
      errors.push("battle actor intrinsic pet facts do not match its frozen capture candidate");
    }
    return errors;
  }

  function validatePreparedRoom(room) {
    const roomErrors = validateRoomBase(room, {allowEmptyParticipants: true});
    if (roomErrors.length > 0) {
      return fail("pet_capture_candidate_room_invalid", roomErrors);
    }
    if (!hasOwn(room.battle, PRIVATE_CANDIDATE_KEY)) {
      return fail("pet_capture_candidate_room_unprepared", ["battle capture candidates are missing"]);
    }
    const candidates = room.battle[PRIVATE_CANDIDATE_KEY];
    if (!isObjectRecord(candidates)) {
      return fail("pet_capture_candidate_state_invalid", ["battle capture candidate map must be an object"]);
    }
    const actors = candidateActors(room);
    const expectedActorIds = actors.map((actor) => actor.actorId).sort();
    const actualActorIds = Object.keys(candidates).sort();
    if (!isDeepStrictEqual(actualActorIds, expectedActorIds)) {
      return fail("pet_capture_candidate_state_invalid", ["battle capture candidate map does not exactly match catchable actors"]);
    }
    const errors = [];
    const candidateIds = new Set();
    const captureSecrets = new Set();
    const petIds = new Set();
    for (const actor of actors) {
      const candidate = candidates[actor.actorId];
      const candidateErrors = validateCandidate(candidate, actor);
      errors.push(...candidateErrors.map((error) => `${actor.actorId}: ${error}`));
      if (candidate && candidateIds.has(candidate.candidateId)) {
        errors.push(`${actor.actorId}: duplicate candidateId`);
      }
      if (candidate && captureSecrets.has(candidate.captureSecret)) {
        errors.push(`${actor.actorId}: duplicate captureSecret`);
      }
      if (candidate && candidate.pet && petIds.has(candidate.pet.instanceId)) {
        errors.push(`${actor.actorId}: duplicate pet instanceId`);
      }
      if (candidate) {
        candidateIds.add(candidate.candidateId);
        captureSecrets.add(candidate.captureSecret);
        if (candidate.pet) {
          petIds.add(candidate.pet.instanceId);
        }
      }
    }
    return errors.length > 0
      ? fail("pet_capture_candidate_state_invalid", errors)
      : ok({candidateCount: actors.length});
  }

  function prepareRoom(room) {
    const baseErrors = validateRoomBase(room);
    if (baseErrors.length > 0) {
      return fail("pet_capture_candidate_room_invalid", baseErrors);
    }
    let next;
    try {
      next = clone(room);
    } catch (_error) {
      return fail("pet_capture_candidate_room_invalid", ["room must be cloneable"]);
    }
    if (hasOwn(next.battle, PRIVATE_CANDIDATE_KEY)) {
      const existingValidation = validatePreparedRoom(next);
      return existingValidation.ok
        ? ok({room: next, candidateCount: existingValidation.candidateCount, reused: true})
        : existingValidation;
    }
    try {
      const usedCandidateIds = new Set();
      const usedPetInstanceIds = new Set();
      const usedSecrets = new Set();
      const candidates = {};
      for (const actor of candidateActors(next)) {
        const candidate = buildCandidate(
          actor,
          usedCandidateIds,
          usedPetInstanceIds,
          usedSecrets,
        );
        candidates[actor.actorId] = candidate;
        synchronizeActorWithCandidate(actor, candidate);
      }
      next.battle[PRIVATE_CANDIDATE_KEY] = candidates;
    } catch (_error) {
      return fail("pet_capture_candidate_creation_failed", ["private capture candidates could not be created"]);
    }
    const validation = validatePreparedRoom(next);
    return validation.ok
      ? ok({room: next, candidateCount: validation.candidateCount, reused: false})
      : validation;
  }

  function normalizedAttemptInput(input) {
    if (!isObjectRecord(input) || !hasExactKeys(input, ["actorId", "accountId", "captureToolId"])) {
      return fail("pet_capture_candidate_attempt_invalid", ["attempt input must contain only actorId, accountId, and captureToolId"]);
    }
    const actorId = strictId(input.actorId);
    const accountId = strictId(input.accountId);
    const captureToolId = strictToolId(input.captureToolId);
    if (actorId === "" || accountId === "" || captureToolId === "") {
      return fail("pet_capture_candidate_attempt_invalid", ["attempt identifiers are invalid"]);
    }
    return ok({input: {actorId, accountId, captureToolId}});
  }

  function validateAttempt(room, input) {
    const prepared = validatePreparedRoom(room);
    if (!prepared.ok) {
      return prepared;
    }
    const normalized = normalizedAttemptInput(input);
    if (!normalized.ok) {
      return normalized;
    }
    const attempt = normalized.input;
    if (!room.participantAccountIds.includes(attempt.accountId)) {
      return fail("pet_capture_candidate_attempt_invalid", ["attempt account is not a battle participant"]);
    }
    const actor = actorById(room, attempt.actorId);
    const candidate = room.battle[PRIVATE_CANDIDATE_KEY][attempt.actorId];
    if (!actor || !candidate) {
      return fail("pet_capture_candidate_not_found", ["capture target has no frozen candidate"]);
    }
    if (
      String(actor.kind || "") !== "wild_pet"
      || String(actor.side || "") !== "enemy"
      || !Boolean(actor.catchable)
      || Boolean(actor.captured)
      || Boolean(actor.defeated)
      || Number(actor.hp || 0) <= 0
    ) {
      return fail("pet_capture_candidate_attempt_invalid", ["capture target is no longer eligible"]);
    }
    if (candidate.status !== STATUS_AVAILABLE) {
      return fail("pet_capture_candidate_already_claimed", ["capture candidate already has an owner"]);
    }
    return ok({candidateId: candidate.candidateId, attemptNumber: candidate.attemptCount + 1});
  }

  function captureRoll(room, input) {
    const validation = validateAttempt(room, input);
    if (!validation.ok) {
      return validation;
    }
    let next;
    try {
      next = clone(room);
    } catch (_error) {
      return fail("pet_capture_candidate_room_invalid", ["room must be cloneable"]);
    }
    const candidate = next.battle[PRIVATE_CANDIDATE_KEY][input.actorId];
    const attempt = {
      attemptNumber: validation.attemptNumber,
      accountId: input.accountId,
      captureToolId: input.captureToolId,
    };
    const roll = captureRollForCandidate(candidate, attempt);
    candidate.attemptCount = attempt.attemptNumber;
    candidate.lastAttempt = attempt;
    return ok({
      room: next,
      roll,
      attemptNumber: attempt.attemptNumber,
      candidateId: candidate.candidateId,
    });
  }

  function normalizedClaimInput(input) {
    if (!isObjectRecord(input) || !hasExactKeys(input, ["actorId", "accountId"])) {
      return fail("pet_capture_candidate_claim_invalid", ["claim input must contain only actorId and accountId"]);
    }
    const actorId = strictId(input.actorId);
    const accountId = strictId(input.accountId);
    if (actorId === "" || accountId === "") {
      return fail("pet_capture_candidate_claim_invalid", ["claim identifiers are invalid"]);
    }
    return ok({input: {actorId, accountId}});
  }

  function claim(room, input) {
    const prepared = validatePreparedRoom(room);
    if (!prepared.ok) {
      return prepared;
    }
    const normalized = normalizedClaimInput(input);
    if (!normalized.ok) {
      return normalized;
    }
    const claimInput = normalized.input;
    if (!room.participantAccountIds.includes(claimInput.accountId)) {
      return fail("pet_capture_candidate_claim_invalid", ["claim account is not a battle participant"]);
    }
    const candidate = room.battle[PRIVATE_CANDIDATE_KEY][claimInput.actorId];
    if (!candidate) {
      return fail("pet_capture_candidate_not_found", ["capture target has no frozen candidate"]);
    }
    if (candidate.status === STATUS_CLAIMED) {
      if (candidate.claimedByAccountId !== claimInput.accountId) {
        return fail("pet_capture_candidate_claim_conflict", ["capture candidate belongs to another account"]);
      }
      return ok({room: clone(room), ownerAccountId: claimInput.accountId, changed: false});
    }
    if (
      candidate.attemptCount < 1
      || !candidate.lastAttempt
      || candidate.lastAttempt.accountId !== claimInput.accountId
    ) {
      return fail("pet_capture_candidate_claim_invalid", ["claim must follow this account's latest valid capture roll"]);
    }
    const actor = actorById(room, claimInput.actorId);
    if (!actor || Boolean(actor.captured) || Boolean(actor.defeated) || Number(actor.hp || 0) <= 0) {
      return fail("pet_capture_candidate_claim_invalid", ["capture target is no longer eligible"]);
    }
    const next = clone(room);
    const nextCandidate = next.battle[PRIVATE_CANDIDATE_KEY][claimInput.actorId];
    nextCandidate.status = STATUS_CLAIMED;
    nextCandidate.claimedByAccountId = claimInput.accountId;
    return ok({room: next, ownerAccountId: claimInput.accountId, changed: true});
  }

  function normalizedMaterializeInput(input) {
    if (!isObjectRecord(input) || Object.keys(input).some((key) => !MATERIALIZE_KEYS.has(key))) {
      return fail("pet_capture_candidate_materialize_invalid", ["materialize input contains unknown fields"]);
    }
    for (const key of ["actorId", "accountId", "state", "capturedSerial"]) {
      if (!hasOwn(input, key)) {
        return fail("pet_capture_candidate_materialize_invalid", [`materialize input requires ${key}`]);
      }
    }
    const actorId = strictId(input.actorId);
    const accountId = strictId(input.accountId);
    const state = input.state === "standby" || input.state === "storage" ? input.state : "";
    if (
      actorId === ""
      || accountId === ""
      || state === ""
      || !Number.isInteger(input.capturedSerial)
      || input.capturedSerial < 1
    ) {
      return fail("pet_capture_candidate_materialize_invalid", ["materialize identity, state, or serial is invalid"]);
    }
    const captureStatusIds = uniqueStringArray(input.captureStatusIds);
    if (
      hasOwn(input, "captureStatusIds")
      && (
        !Array.isArray(input.captureStatusIds)
        || !isDeepStrictEqual(captureStatusIds, input.captureStatusIds)
        || captureStatusIds.some((statusId) => strictId(statusId) === "")
      )
    ) {
      return fail("pet_capture_candidate_materialize_invalid", ["captureStatusIds must contain unique stable strings"]);
    }
    return ok({
      input: {
        actorId,
        accountId,
        state,
        capturedSerial: input.capturedSerial,
        captureStatusIds,
      },
    });
  }

  function materialize(room, input) {
    const prepared = validatePreparedRoom(room);
    if (!prepared.ok) {
      return prepared;
    }
    const normalized = normalizedMaterializeInput(input);
    if (!normalized.ok) {
      return normalized;
    }
    const materializeInput = normalized.input;
    const candidate = room.battle[PRIVATE_CANDIDATE_KEY][materializeInput.actorId];
    if (!candidate) {
      return fail("pet_capture_candidate_not_found", ["capture target has no frozen candidate"]);
    }
    if (
      candidate.status !== STATUS_CLAIMED
      || candidate.claimedByAccountId !== materializeInput.accountId
      || !candidate.lastAttempt
      || candidate.lastAttempt.accountId !== materializeInput.accountId
    ) {
      return fail("pet_capture_candidate_materialize_invalid", ["capture candidate is not claimed by this account"]);
    }
    const pet = clone(candidate.pet);
    pet.state = materializeInput.state;
    pet.capturedSerial = materializeInput.capturedSerial;
    pet.capturedBattleRoomId = room.roomId;
    pet.capturedBattleActorId = materializeInput.actorId;
    pet.capturedByAccountId = materializeInput.accountId;
    pet.captureToolId = candidate.lastAttempt.captureToolId;
    pet.captureStatusIds = materializeInput.captureStatusIds;
    pet.captureAttemptNumber = candidate.lastAttempt.attemptNumber;
    // Only the server-side frozen candidate authority may stamp this source.
    // Old pets intentionally remain source-unknown and therefore fail closed
    // for any future automatic processing policy.
    pet.source = "wild_capture";
    pet.isNew = true;
    if (hasOwn(pet, "captureSecret") || hasOwn(pet, "integrityTag")) {
      return fail("pet_capture_candidate_materialize_invalid", ["private candidate authority state cannot transfer to a pet"]);
    }
    return ok({pet});
  }

  return Object.freeze({
    prepareRoom,
    validateAttempt,
    captureRoll,
    claim,
    materialize,
  });
}

module.exports = {
  AUTHORITY,
  DEFAULT_LEGACY_GROWTH_PATH,
  PRIVATE_CANDIDATE_KEY,
  SCHEMA_VERSION,
  createPetCaptureCandidateAuthority,
};
