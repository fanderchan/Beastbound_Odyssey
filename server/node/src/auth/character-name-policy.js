"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_POLICY_PATH = path.resolve(
  __dirname,
  "../../../..",
  "client/godot/data/character_name_policy.json",
);
const CHARACTER_NAME_POLICY_SCHEMA_VERSION = 1;
const CHARACTER_NAME_POLICY_ID = "beastbound-character-name-safety-v1";
const EVASION_SEPARATOR_PATTERN = /[\p{Z}\p{P}\p{S}\p{C}\p{M}]/gu;
const CONSECUTIVE_DIGIT_PATTERN = /\d+/gu;

function loadCharacterNamePolicy({filePath = DEFAULT_POLICY_PATH} = {}) {
  let document;
  try {
    document = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`character name policy load failed: ${error.message}`);
  }
  return normalizeCharacterNamePolicy(document);
}

function normalizeCharacterNamePolicy(value) {
  if (!isRecord(value)) {
    throw new Error("character name policy must be an object");
  }
  const expectedKeys = [
    "blockedTerms",
    "latinTokenTerms",
    "maximumConsecutiveDigits",
    "playerMessage",
    "policyId",
    "randomName",
    "schemaVersion",
  ].sort();
  if (!sameStrings(Object.keys(value).sort(), expectedKeys)) {
    throw new Error("character name policy fields are invalid");
  }
  if (value.schemaVersion !== CHARACTER_NAME_POLICY_SCHEMA_VERSION) {
    throw new Error("character name policy schema version is unsupported");
  }
  if (String(value.policyId || "") !== CHARACTER_NAME_POLICY_ID) {
    throw new Error("character name policy id is invalid");
  }
  const playerMessage = String(value.playerMessage || "").trim();
  if (playerMessage === "" || playerMessage.length > 80) {
    throw new Error("character name policy player message is invalid");
  }
  const maximumConsecutiveDigits = Number(value.maximumConsecutiveDigits);
  if (
    !Number.isSafeInteger(maximumConsecutiveDigits)
    || maximumConsecutiveDigits < 1
    || maximumConsecutiveDigits > 12
  ) {
    throw new Error("character name policy consecutive digit limit is invalid");
  }
  if (!isRecord(value.randomName)) {
    throw new Error("character name policy random-name catalog is invalid");
  }
  const randomName = Object.freeze({
    prefixes: Object.freeze(strictUniqueStrings(value.randomName.prefixes, "randomName.prefixes")),
    suffixes: Object.freeze(strictUniqueStrings(value.randomName.suffixes, "randomName.suffixes")),
  });
  if (!isRecord(value.blockedTerms) || Object.keys(value.blockedTerms).length < 1) {
    throw new Error("character name policy blocked-term catalog is invalid");
  }
  const blockedTerms = {};
  const blockedScanKeys = [];
  const seenBlockedKeys = new Set();
  for (const category of Object.keys(value.blockedTerms).sort()) {
    if (!/^[a-z][A-Za-z0-9]{2,63}$/.test(category)) {
      throw new Error("character name policy blocked-term category is invalid");
    }
    const terms = strictUniqueStrings(value.blockedTerms[category], `blockedTerms.${category}`);
    blockedTerms[category] = Object.freeze(terms);
    for (const term of terms) {
      const scanKey = normalizeCharacterNameForSafety(term);
      if (scanKey === "" || seenBlockedKeys.has(scanKey)) {
        throw new Error("character name policy contains an invalid or duplicate blocked term");
      }
      seenBlockedKeys.add(scanKey);
      blockedScanKeys.push(Object.freeze({category, matchMode: "contains", scanKey}));
    }
  }
  const latinTokenTerms = Object.freeze(strictUniqueStrings(
    value.latinTokenTerms,
    "latinTokenTerms",
  ));
  for (const term of latinTokenTerms) {
    const scanKey = normalizeCharacterNameForSafety(term);
    if (!/^[a-z]{2,16}$/.test(scanKey) || seenBlockedKeys.has(scanKey)) {
      throw new Error("character name policy contains an invalid or duplicate blocked term");
    }
    seenBlockedKeys.add(scanKey);
    blockedScanKeys.push(Object.freeze({
      category: "latinTokenTerms",
      matchMode: "latinToken",
      scanKey,
    }));
  }
  for (const prefix of randomName.prefixes) {
    for (const suffix of randomName.suffixes) {
      const candidateScanKey = normalizeCharacterNameForSafety(`${prefix}${suffix}`);
      if (blockedScanKeys.some((entry) => blockedEntryMatches(candidateScanKey, entry))) {
        throw new Error("character name policy random-name catalog can generate a blocked term");
      }
    }
  }
  return Object.freeze({
    blockedScanKeys: Object.freeze(blockedScanKeys),
    blockedTerms: Object.freeze(blockedTerms),
    latinTokenTerms,
    maximumConsecutiveDigits,
    playerMessage,
    policyId: CHARACTER_NAME_POLICY_ID,
    randomName,
    schemaVersion: CHARACTER_NAME_POLICY_SCHEMA_VERSION,
  });
}

function inspectCharacterNameSafety(value, policy) {
  const scanKey = normalizeCharacterNameForSafety(value);
  if (scanKey === "") {
    return Object.freeze({ok: false, reason: "empty_after_normalization"});
  }
  const digitRuns = scanKey.match(CONSECUTIVE_DIGIT_PATTERN) || [];
  if (digitRuns.some((run) => run.length > policy.maximumConsecutiveDigits)) {
    return Object.freeze({ok: false, reason: "too_many_consecutive_digits"});
  }
  const blocked = policy.blockedScanKeys.find((entry) => blockedEntryMatches(scanKey, entry));
  if (blocked) {
    return Object.freeze({ok: false, reason: "blocked_term", category: blocked.category});
  }
  return Object.freeze({ok: true});
}

function blockedEntryMatches(scanKey, entry) {
  if (entry.matchMode === "latinToken") {
    let index = scanKey.indexOf(entry.scanKey);
    while (index >= 0) {
      const left = index > 0 ? scanKey[index - 1] : "";
      const rightIndex = index + entry.scanKey.length;
      const right = rightIndex < scanKey.length ? scanKey[rightIndex] : "";
      if (!isAsciiLowercaseLetter(left) || !isAsciiLowercaseLetter(right)) {
        return true;
      }
      index = scanKey.indexOf(entry.scanKey, index + 1);
    }
    return false;
  }
  return scanKey.includes(entry.scanKey);
}

function isAsciiLowercaseLetter(value) {
  return value >= "a" && value <= "z";
}

function normalizeCharacterNameForSafety(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(EVASION_SEPARATOR_PATTERN, "");
}

function strictUniqueStrings(value, fieldName) {
  if (!Array.isArray(value) || value.length < 1) {
    throw new Error(`character name policy ${fieldName} must be a non-empty array`);
  }
  const output = [];
  const seen = new Set();
  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim() === "" || entry !== entry.trim()) {
      throw new Error(`character name policy ${fieldName} contains an invalid entry`);
    }
    const key = entry.normalize("NFKC").toLocaleLowerCase("zh-CN");
    if (seen.has(key)) {
      throw new Error(`character name policy ${fieldName} contains duplicate entries`);
    }
    seen.add(key);
    output.push(entry);
  }
  return output;
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  CHARACTER_NAME_POLICY_ID,
  CHARACTER_NAME_POLICY_SCHEMA_VERSION,
  DEFAULT_POLICY_PATH,
  inspectCharacterNameSafety,
  loadCharacterNamePolicy,
  normalizeCharacterNameForSafety,
  normalizeCharacterNamePolicy,
};
