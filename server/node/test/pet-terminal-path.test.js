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
    terminalTargetFormIds: ["fusion_target_terminal_policy"],
    targetFormIds: ["fusion_target_indexed"],
    recipes: [
      {recipeId: "recipe_one", targetFormId: "fusion_target_recipe"},
      null,
      {recipeId: "damaged_recipe"},
    ],
  };
  const before = structuredClone(catalog);

  assert.deepEqual(
    inspectPetTerminalPath(pet("fusion_target_terminal_policy"), null, catalog),
    {terminal: true, branch: "fusion", evidence: "target_form"},
  );
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

test("terminal fusion policy forms fail closed even before recipes are registered", () => {
  const catalog = {
    terminalTargetFormIds: [
      "fusion_terminal_alpha",
      "fusion_terminal_beta",
      "fusion_terminal_alpha",
      "",
    ],
    targetFormIds: [],
    recipes: [],
  };
  const before = structuredClone(catalog);
  for (const formId of ["fusion_terminal_alpha", "fusion_terminal_beta"]) {
    for (const alias of ["formId", "templateId", "speciesId"]) {
      const target = pet("ordinary_form");
      target.formId = "";
      target.templateId = "";
      target.speciesId = "";
      target[alias] = formId;
      assert.deepEqual(
        inspectPetTerminalPath(target, null, catalog),
        {terminal: true, branch: "fusion", evidence: "target_form"},
        `${formId}:${alias}`,
      );
    }
  }
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
