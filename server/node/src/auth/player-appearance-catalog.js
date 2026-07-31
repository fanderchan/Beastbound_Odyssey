"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_CATALOG_PATH = path.resolve(
  __dirname,
  "../../../..",
  "client/godot/data/player_appearances.json",
);
const DEFAULT_APPEARANCE_ID = "novice_hunter_v1";
const APPEARANCE_ID_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;

function loadPlayerAppearanceCatalog({filePath = DEFAULT_CATALOG_PATH} = {}) {
  let document;
  try {
    document = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`player appearance catalog load failed: ${error.message}`);
  }
  if (
    !isRecord(document)
    || document.schemaVersion !== 1
    || document.appearanceAffectsStats !== false
    || !Array.isArray(document.appearances)
    || document.appearances.length < 1
  ) {
    throw new Error("player appearance catalog contract is invalid");
  }
  const ids = [];
  const idSet = new Set();
  for (const entry of document.appearances) {
    const appearanceId = String(entry && entry.appearanceId || "").trim();
    if (
      !isRecord(entry)
      || !APPEARANCE_ID_PATTERN.test(appearanceId)
      || entry.selectable !== true
      || idSet.has(appearanceId)
    ) {
      throw new Error("player appearance catalog contains an invalid selectable appearance");
    }
    idSet.add(appearanceId);
    ids.push(appearanceId);
  }
  if (!idSet.has(DEFAULT_APPEARANCE_ID)) {
    throw new Error(`player appearance catalog must contain ${DEFAULT_APPEARANCE_ID}`);
  }
  const appearanceIds = Object.freeze(ids);
  return Object.freeze({
    appearanceAffectsStats: false,
    appearanceIds,
    defaultAppearanceId: DEFAULT_APPEARANCE_ID,
    has(appearanceId) {
      return idSet.has(String(appearanceId || "").trim());
    },
    schemaVersion: 1,
  });
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  DEFAULT_APPEARANCE_ID,
  DEFAULT_CATALOG_PATH,
  loadPlayerAppearanceCatalog,
};
