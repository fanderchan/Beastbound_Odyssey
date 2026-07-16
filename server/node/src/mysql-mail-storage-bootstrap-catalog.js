"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  equipmentWearRulesFromDocument,
  loadBattleEquipmentCatalog,
} = require("./auth/battle-equipment-rules");
const {loadBagItemCatalog} = require("./auth/equipment-profile-migration");
const {readMailAttachmentState} = require("./auth/mail-attachment-state");
const {loadPlayerLevelRuntime} = require("./auth/player-level-runtime");

const DEFAULT_PLAYER_GROWTH_PATH = path.resolve(
  __dirname,
  "../../..",
  "client/godot/data/balance/player_growth.json",
);

function requireItemCatalog(value, label) {
  if (!value || !(value.itemById instanceof Map) || value.itemById.size === 0) {
    throw new Error(`${label} must contain an itemById Map`);
  }
  return value;
}

function requireLevelRuntime(value) {
  if (
    !value
    || typeof value.expToNextLevel !== "function"
    || !Number.isSafeInteger(value.maxPlayerLevel)
    || value.maxPlayerLevel < 1
  ) {
    throw new Error("player level runtime must declare expToNextLevel and maxPlayerLevel");
  }
  return value;
}

function readPlayerGrowthDocument(filePath) {
  let document;
  try {
    document = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const loadError = new Error(`failed to load authoritative player growth rules: ${filePath}`);
    loadError.cause = error;
    throw loadError;
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("player growth rules must be an object");
  }
  return document;
}

function createMailStorageBootstrapAttachmentCertifier(options = {}) {
  const equipmentCatalog = requireItemCatalog(
    options.equipmentCatalog || loadBattleEquipmentCatalog(options.equipmentCatalogPath),
    "battle equipment catalog",
  );
  const bagItemCatalog = requireItemCatalog(
    options.bagItemCatalog || loadBagItemCatalog(options.bagItemCatalogPath),
    "bag item catalog",
  );
  const levelRuntime = requireLevelRuntime(
    options.playerLevelRuntime || loadPlayerLevelRuntime(options.playerLevelRuntimeOptions),
  );
  const wearRules = options.equipmentWearRules || equipmentWearRulesFromDocument(
    options.playerGrowthDocument || readPlayerGrowthDocument(
      options.playerGrowthPath || DEFAULT_PLAYER_GROWTH_PATH,
    ),
  );
  const equipmentTransferOptions = Object.freeze({
    ...wearRules,
    expToNextLevel: levelRuntime.expToNextLevel,
    maxPlayerLevel: levelRuntime.maxPlayerLevel,
  });

  function itemById(itemIdValue) {
    const itemId = String(itemIdValue || "").trim();
    return itemId === "" ? null : bagItemCatalog.itemById.get(itemId) || null;
  }

  function isEquipmentItemId(itemIdValue) {
    const itemId = String(itemIdValue || "").trim();
    if (itemId === "") {
      return false;
    }
    if (equipmentCatalog.itemById.has(itemId)) {
      return true;
    }
    const bagItem = bagItemCatalog.itemById.get(itemId) || null;
    return Boolean(
      bagItem
      && Array.isArray(bagItem.useContexts)
      && bagItem.useContexts.includes("equipment")
    );
  }

  return (mail) => readMailAttachmentState(mail, equipmentCatalog, {
    itemById,
    isEquipmentItemId,
    equipmentTransferOptions,
  });
}

module.exports = {
  createMailStorageBootstrapAttachmentCertifier,
};
