"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  inspectPetTerminalPath,
} = require("../src/auth/pet-terminal-path");

function pet(formId, extra = {}) {
  return {
    instanceId: "pet_terminal_path",
    formId,
    templateId: formId,
    speciesId: formId,
    petCultivation: {
      schemaVersion: 1,
      rebirthCount: 1,
    },
    ...extra,
  };
}

test("fusion lineage ownership remains terminal even when its persisted payload is damaged", () => {
  for (const fusionLineage of [undefined, null, {}, "damaged"]) {
    assert.deepEqual(
      inspectPetTerminalPath(pet("ordinary_form", {fusionLineage}), null, null),
      {terminal: true, branch: "fusion", evidence: "lineage"},
    );
  }
});

test("fusion catalog target forms remain terminal when lineage is missing", () => {
  const catalog = {
    targetFormIds: ["fusion_target_indexed"],
    recipes: [
      {recipeId: "recipe_one", targetFormId: "fusion_target_recipe"},
      null,
      {recipeId: "damaged_recipe"},
    ],
  };
  const before = structuredClone(catalog);

  assert.deepEqual(
    inspectPetTerminalPath(pet("fusion_target_indexed"), null, catalog),
    {terminal: true, branch: "fusion", evidence: "target_form"},
  );
  assert.deepEqual(
    inspectPetTerminalPath(pet("fusion_target_recipe"), null, catalog),
    {terminal: true, branch: "fusion", evidence: "target_form"},
  );
  assert.deepEqual(catalog, before);
});

test("terminal inspection keeps evolution, second rebirth and ordinary compatibility", () => {
  const evolutionCatalog = {
    routes: [{routeId: "evolution_route", targetFormId: "evolution_target"}],
  };
  const fusionCatalog = {
    targetFormIds: new Set(["fusion_target"]),
    recipes: [],
  };

  assert.deepEqual(
    inspectPetTerminalPath(pet("evolution_target"), evolutionCatalog, fusionCatalog),
    {terminal: true, branch: "evolution", evidence: "target_form"},
  );
  assert.deepEqual(
    inspectPetTerminalPath(pet("fusion_target"), evolutionCatalog, fusionCatalog),
    {terminal: true, branch: "fusion", evidence: "target_form"},
  );
  assert.deepEqual(
    inspectPetTerminalPath(pet("ordinary_form", {
      petCultivation: {schemaVersion: 1, rebirthCount: 2},
    }), evolutionCatalog, fusionCatalog),
    {terminal: true, branch: "rebirth", evidence: "rebirth_count"},
  );
  assert.deepEqual(
    inspectPetTerminalPath(pet("ordinary_form"), evolutionCatalog),
    {terminal: false, branch: "", evidence: ""},
  );
  assert.deepEqual(
    inspectPetTerminalPath(null, evolutionCatalog, fusionCatalog),
    {terminal: false, branch: "", evidence: ""},
  );
});
