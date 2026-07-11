"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PetGrowthCatalogError,
  createPetGrowthCatalog,
  loadPetGrowthCatalog,
} = require("../src/auth/pet-growth-catalog");

function profile(overrides = {}) {
  return {
    profileId: "fixture_growth_v1",
    displayName: "测试成长档",
    formId: "fixture_form",
    formName: "测试宠物",
    outputBase: {maxHp: 60, attack: 14, defense: 8, quick: 6},
    outputGrowth: {maxHp: 8.3, attack: 2.3, defense: 1.1, quick: 1.3},
    individualRules: {
      initialOutputSpread: {
        maxHp: [-5, 5],
        attack: [-2, 2],
        defense: [-1, 1],
        quick: [-2, 2],
      },
      growthOutputSpread: {
        maxHp: [-1, 1],
        attack: [-0.3, 0.3],
        defense: [-0.2, 0.2],
        quick: [-0.2, 0.2],
      },
      distribution: "weighted_center",
      rareExtremeRate: 0.02,
    },
    ...overrides,
  };
}

function form(overrides = {}) {
  return {
    formId: "fixture_form",
    formName: "测试宠物",
    growthSpeciesProfileId: "fixture_growth_v1",
    baseStats: {maxHp: 60, attack: 14, defense: 8, agility: 6},
    ...overrides,
  };
}

function documents(profileOverrides = {}, formOverrides = {}) {
  return {
    profileDocument: {schemaVersion: 1, profiles: [profile(profileOverrides)]},
    templateDocument: {schemaVersion: 1, forms: [form(formOverrides)]},
  };
}

test("default pet growth catalog strictly links all current species profiles and forms", () => {
  const catalog = loadPetGrowthCatalog();

  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.profileCount, 23);
  assert.equal(catalog.formCount, 31);
  assert.equal(catalog.profiledFormCount, 23);
  assert.deepEqual(catalog.orphanProfileIds, []);
  assert.equal(catalog.profileIdForFormId("blue_man_dragon_water10"), "blue_man_dragon_v1");
  assert.equal(catalog.profileIdForFormId("wuli_normal_orange_fire10"), "wuli_normal_orange_fire10_v1");
  assert.equal(catalog.profileIdForFormId("mossback_marsh_earth7_water3"), "mossback_marsh_earth7_water3_v1");
  assert.equal(catalog.profileForFormId("rebirth_starter_four_spirit_cub"), null);
  assert.equal(catalog.resolvePetProfile({formId: "wuli_normal_orange_fire10"}).kind, "legacy_existing");
  assert.equal(catalog.resolveNewPetProfile({formId: "wuli_normal_orange_fire10"}).kind, "authority_v1");
  assert.equal(catalog.resolvePetProfile({formId: "mossback_marsh_earth7_water3"}).kind, "legacy_existing");
  assert.equal(catalog.resolveNewPetProfile({formId: "mossback_marsh_earth7_water3"}).kind, "authority_v1");
  assert.equal(catalog.profileForFormId("blue_man_dragon_water10").formId, "blue_man_dragon_water10");
  assert.deepEqual(catalog.profileForFormId("blue_man_dragon_water10").outputBase, {
    maxHp: 60,
    attack: 14,
    defense: 8,
    quick: 6,
  });

  const immutable = catalog.profileById("blue_man_dragon_v1");
  assert.equal(Object.isFrozen(immutable), true);
  assert.equal(Object.isFrozen(immutable.outputBase), true);
  assert.throws(() => {
    immutable.outputBase.attack = 999;
  }, TypeError);
});

test("catalog accepts injected strict documents and keeps legacy forms unprofiled", () => {
  const fixture = documents();
  fixture.templateDocument.forms.push(form({formId: "legacy_form", growthSpeciesProfileId: undefined}));
  const catalog = createPetGrowthCatalog(fixture);

  assert.equal(catalog.profileCount, 1);
  assert.equal(catalog.formCount, 2);
  assert.equal(catalog.profiledFormCount, 1);
  assert.equal(catalog.profileForFormId("legacy_form"), null);
  assert.equal(catalog.templateByFormId("legacy_form").formId, "legacy_form");
  assert.equal(catalog.resolvePetProfile({formId: "legacy_form"}).kind, "legacy_unlinked");
  assert.equal(catalog.resolvePetProfile({formId: "fixture_form"}).kind, "legacy_existing");
  assert.equal(catalog.resolveNewPetProfile({formId: "fixture_form"}).kind, "authority_v1");
});

test("catalog keeps historical profile versions while templates select only new-pet active versions", () => {
  const fixture = documents();
  fixture.profileDocument.profiles.push(profile({
    profileId: "fixture_growth_v2",
    outputBase: {maxHp: 65, attack: 15, defense: 9, quick: 7},
  }));
  fixture.templateDocument.forms[0] = form({
    growthSpeciesProfileId: "fixture_growth_v2",
    baseStats: {maxHp: 65, attack: 15, defense: 9, agility: 7},
  });
  const catalog = createPetGrowthCatalog(fixture);

  assert.deepEqual(catalog.profileIdsForFormId("fixture_form"), [
    "fixture_growth_v1",
    "fixture_growth_v2",
  ]);
  assert.equal(catalog.resolveNewPetProfile({formId: "fixture_form"}).profileId, "fixture_growth_v2");
  assert.equal(catalog.resolvePetProfile({formId: "fixture_form"}).kind, "legacy_existing");
  assert.equal(catalog.resolvePetProfile({
    formId: "fixture_form",
    growthSpeciesProfileId: "fixture_growth_v1",
    growthModelVersion: "pet_growth_authority_v1",
    petGrowth: {
      modelVersion: "pet_growth_authority_v1",
      profileId: "fixture_growth_v1",
    },
  }).profileId, "fixture_growth_v1");
});

test("catalog rejects duplicate, missing, unversioned, and mismatched contracts", () => {
  const invalidFixtures = [];

  const duplicateProfile = documents();
  duplicateProfile.profileDocument.profiles.push(profile());
  invalidFixtures.push([duplicateProfile, /duplicate pet growth profile id/]);

  const missingProfile = documents({}, {growthSpeciesProfileId: "missing_growth_v1"});
  invalidFixtures.push([missingProfile, /references missing profile/]);

  const unversioned = documents({profileId: "fixture_growth"}, {growthSpeciesProfileId: "fixture_growth"});
  invalidFixtures.push([unversioned, /versioned id/]);

  const paddedProfileId = documents(
    {profileId: " fixture_growth_v1"},
    {growthSpeciesProfileId: "fixture_growth_v1"},
  );
  invalidFixtures.push([paddedProfileId, /versioned id/]);

  const paddedFormId = documents({}, {formId: " fixture_form"});
  invalidFixtures.push([paddedFormId, /stable non-empty id/]);

  const mismatchedBase = documents({}, {baseStats: {maxHp: 60, attack: 999, defense: 8, agility: 6}});
  invalidFixtures.push([mismatchedBase, /baseStats.attack must match/]);

  const duplicateForm = documents();
  duplicateForm.templateDocument.forms.push(form());
  invalidFixtures.push([duplicateForm, /duplicate pet form id/]);

  const templateSchema = documents();
  templateSchema.templateDocument.schemaVersion = 2;
  invalidFixtures.push([templateSchema, /template document schemaVersion must be 1/]);

  const missingReverseLink = documents({formId: "missing_form"});
  invalidFixtures.push([missingReverseLink, /references missing form missing_form/]);

  const mismatchedName = documents({}, {formName: "另一只宠物"});
  invalidFixtures.push([mismatchedName, /formName must match/]);

  for (const [fixture, expected] of invalidFixtures) {
    assert.throws(
      () => createPetGrowthCatalog(fixture),
      (error) => error instanceof PetGrowthCatalogError && expected.test(error.message),
    );
  }
});

test("catalog rejects hidden normalization of ranges, distributions, and numeric strings", () => {
  const reversedRange = documents();
  reversedRange.profileDocument.profiles[0].individualRules.growthOutputSpread.attack = [0.3, -0.3];
  assert.throws(() => createPetGrowthCatalog(reversedRange), /minimum must not exceed maximum/);

  const badDistribution = documents();
  badDistribution.profileDocument.profiles[0].individualRules.distribution = "lucky";
  assert.throws(() => createPetGrowthCatalog(badDistribution), /distribution is unsupported/);

  const numericString = documents();
  numericString.profileDocument.profiles[0].outputGrowth.attack = "2.3";
  assert.throws(() => createPetGrowthCatalog(numericString), /must be a finite number/);

  const broadExtremeRate = documents();
  broadExtremeRate.profileDocument.profiles[0].individualRules.rareExtremeRate = 0.5;
  assert.throws(() => createPetGrowthCatalog(broadExtremeRate), /between 0 and 0.25/);

  const missingExtremeRate = documents();
  delete missingExtremeRate.profileDocument.profiles[0].individualRules.rareExtremeRate;
  assert.throws(() => createPetGrowthCatalog(missingExtremeRate), /rareExtremeRate is required/);

  const orphanNoiseRule = documents();
  orphanNoiseRule.profileDocument.profiles[0].individualRules.levelNoiseDistribution = "uniform";
  assert.throws(() => createPetGrowthCatalog(orphanNoiseRule), /require levelOutputNoiseSpread/);

  const unknownRule = documents();
  unknownRule.profileDocument.profiles[0].individualRules.growthBonuz = {};
  assert.throws(() => createPetGrowthCatalog(unknownRule), /is unknown/);

  const nonPositiveGrowth = documents();
  nonPositiveGrowth.profileDocument.profiles[0].outputGrowth.attack = 0.1;
  nonPositiveGrowth.profileDocument.profiles[0].individualRules.growthOutputSpread.attack = [-0.1, 0.3];
  assert.throws(() => createPetGrowthCatalog(nonPositiveGrowth), /minimum per-level growth must remain positive/);
});

test("catalog resolution fails closed for unknown and conflicting instance identities", () => {
  const catalog = createPetGrowthCatalog(documents());

  assert.throws(
    () => catalog.requireProfileById("missing_growth_v1"),
    (error) => error instanceof PetGrowthCatalogError && error.code === "pet_growth_catalog_invalid",
  );
  assert.throws(() => catalog.requireProfileById(" fixture_growth_v1"), /missing pet growth profile/);
  assert.throws(
    () => catalog.resolvePetProfile({formId: "fixture_form", templateId: "other_form"}),
    /does not match templateId/,
  );
  assert.throws(
    () => catalog.resolveNewPetProfile({formId: "fixture_form", growthSpeciesProfileId: "other_growth_v1"}),
    /does not match template link/,
  );
  assert.throws(() => catalog.resolvePetProfile({formId: " fixture_form"}), /surrounding whitespace/);
  assert.throws(() => catalog.resolvePetProfile({formId: "missing_form"}), /missing pet template/);
  assert.throws(
    () => catalog.resolvePetProfile({
      formId: "fixture_form",
      growthModelVersion: "invalid_pet_growth_authority_v1",
      growthAuthority: {
        source: "server",
        modelVersion: "invalid_pet_growth_authority_v1",
      },
    }),
    /cannot resolve as legacy growth/,
  );
  for (const pet of [
    {formId: "fixture_form", growthModelVersion: "pet_growth_authority_v2"},
    {
      formId: "fixture_form",
      petGrowth: {modelVersion: "pet_growth_authority_v2"},
    },
    {
      formId: "fixture_form",
      growthAuthority: {source: "server", modelVersion: "pet_growth_authority_v2"},
    },
  ]) {
    assert.throws(() => catalog.resolvePetProfile(pet), /unknown pet growth model/);
  }
  assert.throws(
    () => catalog.resolvePetProfile({
      formId: "fixture_form",
      petGrowth: {schemaVersion: 1, private: {}},
    }),
    /requires a model version/,
  );
  assert.throws(
    () => catalog.resolvePetProfile({
      formId: "fixture_form",
      growthModelVersion: "pet_growth_authority_v1",
      petGrowth: {modelVersion: "legacy_species_linear_v0"},
    }),
    /model fields conflict/,
  );
  assert.throws(
    () => catalog.resolvePetProfile({formId: "fixture_form", petGrowth: "bad"}),
    /petGrowth must be an object/,
  );
  assert.throws(
    () => catalog.resolvePetProfile({formId: "fixture_form", petGrowth: {}}),
    /petGrowth must not be empty/,
  );
  assert.equal(catalog.resolvePetProfile({
    formId: "fixture_form",
    growthModelVersion: "legacy_species_linear_v0",
    growthAuthority: {
      source: "server",
      modelVersion: "legacy_species_linear_v0",
    },
  }).kind, "legacy_existing");

  const defaultCatalog = loadPetGrowthCatalog();
  assert.throws(
    () => defaultCatalog.resolvePetProfile({
      formId: "pet_rebirth_mm_stage1",
      growthSpeciesProfileId: "blue_man_dragon_v1",
      growthModelVersion: "pet_growth_authority_v1",
      petGrowth: {
        modelVersion: "pet_growth_authority_v1",
        profileId: "blue_man_dragon_v1",
      },
    }),
    /belongs to form blue_man_dragon_water10/,
  );
});
