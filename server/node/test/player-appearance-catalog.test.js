"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  loadPlayerAppearanceCatalog,
} = require("../src/auth/player-appearance-catalog");

test("shared player appearance catalog is cosmetic-only and exposes the four creation choices", () => {
  const catalog = loadPlayerAppearanceCatalog();
  assert.equal(catalog.appearanceAffectsStats, false);
  assert.equal(catalog.defaultAppearanceId, "novice_hunter_v1");
  assert.deepEqual(catalog.appearanceIds, [
    "novice_hunter_v1",
    "obsidian_scout_v1",
    "frost_whisper_v1",
    "ember_spark_v1",
  ]);
  for (const appearanceId of catalog.appearanceIds) {
    assert.equal(catalog.has(appearanceId), true);
  }
  assert.equal(catalog.has("unlisted_character_v1"), false);
});

test("player appearance catalog fails closed on duplicate, nonselectable, or stat-affecting data", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "beastbound-player-appearances-"));
  const filePath = path.join(directory, "player_appearances.json");
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const write = (document) => fs.writeFileSync(filePath, JSON.stringify(document), "utf8");

  write({
    schemaVersion: 1,
    appearanceAffectsStats: true,
    appearances: [{appearanceId: "novice_hunter_v1", selectable: true}],
  });
  assert.throws(() => loadPlayerAppearanceCatalog({filePath}), /contract is invalid/);

  write({
    schemaVersion: 1,
    appearanceAffectsStats: false,
    appearances: [
      {appearanceId: "novice_hunter_v1", selectable: true},
      {appearanceId: "novice_hunter_v1", selectable: true},
    ],
  });
  assert.throws(() => loadPlayerAppearanceCatalog({filePath}), /invalid selectable appearance/);

  write({
    schemaVersion: 1,
    appearanceAffectsStats: false,
    appearances: [{appearanceId: "novice_hunter_v1", selectable: false}],
  });
  assert.throws(() => loadPlayerAppearanceCatalog({filePath}), /invalid selectable appearance/);
});
