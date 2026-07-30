"use strict";

const {
  assert,
  battleProfile,
  createAuthService,
  createMemoryAuthStore,
  internalProfileForAccount,
  test,
} = require("../test-support/auth-service-test-context");
const {
  PET_FUSION_SKILL_FORGET_ACKNOWLEDGEMENT,
  inspectPetFusionSkillPolicy,
  validatePetSkillForget,
  validatePetSkillSlotMutation,
} = require("../src/auth/pet-fusion-skill-policy");
const {
  loadPetFusionRecipeCatalog,
} = require("../src/auth/pet-fusion-recipe-catalog");

const INHERITED_ACTIVE_ID = "pet_gene_emberhorn_red_heavy_charge";

test("fusion skill policy classifies inherited actives and fails closed on damaged lineage", () => {
  const pet = fusionPet();
  const inspection = inspectPetFusionSkillPolicy(pet);
  assert.equal(inspection.ok, true);
  assert.equal(inspection.isFusion, true);
  assert.deepEqual(inspection.inheritedActiveSkillIds, [INHERITED_ACTIVE_ID]);

  assert.deepEqual(
    inspectPetFusionSkillPolicy({
      formId: "bui_normal_red_fire10",
      templateId: "bui_normal_red_fire10",
    }),
    {ok: true, isFusion: false, inheritedActiveSkillIds: []},
  );
  assert.deepEqual(
    inspectPetFusionSkillPolicy({
      formId: "future_fusion_target",
      templateId: "future_fusion_target",
    }, {
      fusionTargetFormIds: ["future_fusion_target"],
    }),
    {ok: false, isFusion: true, inheritedActiveSkillIds: []},
  );

  const damaged = fusionPet();
  damaged.fusionLineage.activeInheritance.pop();
  assert.deepEqual(
    inspectPetFusionSkillPolicy(damaged),
    {ok: false, isFusion: true, inheritedActiveSkillIds: []},
  );
  assert.equal(validatePetSkillSlotMutation({
    pet: damaged,
    previousSkillId: INHERITED_ACTIVE_ID,
    nextSkillId: "",
  }).code, "pet_fusion_lineage_invalid");
  assert.equal(validatePetSkillForget({
    pet: damaged,
    skillId: INHERITED_ACTIVE_ID,
    acknowledgement: PET_FUSION_SKILL_FORGET_ACKNOWLEDGEMENT,
  }).code, "pet_fusion_lineage_invalid");
  assert.equal(validatePetSkillSlotMutation({
    pet: damaged,
    previousSkillId: "",
    nextSkillId: "pet_focus_bite",
  }).code, "pet_fusion_lineage_invalid");
});

test("every pet form alias identifies terminal fusion targets despite alias conflicts", () => {
  const fusionTargetFormId = "future_fusion_target";
  for (const alias of ["formId", "templateId", "speciesId"]) {
    assert.deepEqual(
      inspectPetFusionSkillPolicy({
        [alias]: fusionTargetFormId,
      }, {
        fusionTargetFormIds: [fusionTargetFormId],
      }),
      {ok: false, isFusion: true, inheritedActiveSkillIds: []},
    );
  }
  assert.deepEqual(
    inspectPetFusionSkillPolicy({
      formId: "damaged_ordinary_alias",
      templateId: fusionTargetFormId,
      speciesId: "another_damaged_alias",
    }, {
      fusionTargetFormIds: [fusionTargetFormId],
    }),
    {ok: false, isFusion: true, inheritedActiveSkillIds: []},
  );
});

test("fusion lineage rejects base skills masquerading as inherited genes", () => {
  for (const baseSkillId of ["pet_attack", "pet_defend"]) {
    const damaged = fusionPet();
    damaged.fusionLineage.activeInheritance[0].skillId = baseSkillId;
    assert.deepEqual(
      inspectPetFusionSkillPolicy(damaged),
      {ok: false, isFusion: true, inheritedActiveSkillIds: []},
    );
    assert.equal(validatePetSkillSlotMutation({
      pet: damaged,
      previousSkillId: INHERITED_ACTIVE_ID,
      nextSkillId: "",
    }).code, "pet_fusion_lineage_invalid");
  }
});

test("fusion skill policy keeps base skills permanent and inherited forget acknowledgement exact", () => {
  const pet = fusionPet();
  for (const skillId of ["pet_attack", "pet_defend"]) {
    assert.equal(validatePetSkillSlotMutation({
      pet,
      previousSkillId: skillId,
      nextSkillId: "",
    }).code, "pet_skill_base");
    assert.equal(validatePetSkillForget({
      pet,
      skillId,
    }).code, "pet_skill_base");
  }

  assert.equal(validatePetSkillSlotMutation({
    pet,
    previousSkillId: INHERITED_ACTIVE_ID,
    nextSkillId: "pet_focus_bite",
  }).code, "pet_fusion_skill_slot_occupied");
  assert.equal(validatePetSkillSlotMutation({
    pet,
    previousSkillId: "",
    nextSkillId: "pet_focus_bite",
  }).ok, true);
  const forgottenPet = fusionPet();
  forgottenPet.forgottenSkillIds = [INHERITED_ACTIVE_ID];
  assert.equal(validatePetSkillSlotMutation({
    pet: forgottenPet,
    previousSkillId: "",
    nextSkillId: INHERITED_ACTIVE_ID,
  }).code, "pet_fusion_inherited_skill_retrain_forbidden");
  assert.equal(validatePetSkillForget({
    pet,
    skillId: INHERITED_ACTIVE_ID,
  }).code, "pet_fusion_skill_forget_confirmation_required");
  assert.equal(validatePetSkillForget({
    pet,
    skillId: INHERITED_ACTIVE_ID,
    acknowledgement: "double_confirm_irreversible",
  }).code, "pet_fusion_skill_forget_confirmation_required");
  assert.deepEqual(validatePetSkillForget({
    pet,
    skillId: INHERITED_ACTIVE_ID,
    acknowledgement: PET_FUSION_SKILL_FORGET_ACKNOWLEDGEMENT,
  }), {
    ok: true,
    inheritedActive: true,
  });
  assert.deepEqual(validatePetSkillForget({
    pet,
    skillId: "pet_focus_bite",
  }), {
    ok: true,
    inheritedActive: false,
  });
});

test("profile actions protect fusion skills while allowing empty-slot ordinary training", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const registered = service.register({
    username: "fusionskillpolicy",
    password: "test1234",
    displayName: "融合技能策略",
  });
  const token = registered.session.token;
  const accountId = registered.account.accountId;
  const profile = battleProfile(
    "融合技能策略",
    {level: 1, hp: 120, maxHp: 120},
    null,
  );
  profile.stoneCoins = 200;
  profile.activePetInstanceId = "pet_fusion_skill_1";
  profile.petInstances = [fusionPet()];
  const saved = service.saveProfile(token, {expectedRevision: 0, profile});
  assert.equal(saved.ok, true);

  const initialProfile = structuredClone(
    internalProfileForAccount(service, accountId),
  );
  const initialRevision = profileRevision(service, accountId);
  for (const [payload, code] of [
    [
      {
        instanceId: "pet_fusion_skill_1",
        slot: 1,
        skillId: "",
        trainerId: "firebud_pet_skill_trainer",
      },
      "pet_skill_base",
    ],
    [
      {
        instanceId: "pet_fusion_skill_1",
        slot: 2,
        skillId: "pet_focus_bite",
        trainerId: "firebud_pet_skill_trainer",
      },
      "pet_skill_base",
    ],
    [
      {
        instanceId: "pet_fusion_skill_1",
        slot: 3,
        skillId: "",
        trainerId: "firebud_pet_skill_trainer",
      },
      "pet_fusion_skill_slot_occupied",
    ],
    [
      {
        instanceId: "pet_fusion_skill_1",
        slot: 3,
        skillId: "pet_focus_bite",
        trainerId: "firebud_pet_skill_trainer",
      },
      "pet_fusion_skill_slot_occupied",
    ],
  ]) {
    const result = service.profileAction(token, {
      action: "pet_skill_set_slot",
      payload,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.equal(profileRevision(service, accountId), initialRevision);
    assert.deepEqual(
      internalProfileForAccount(service, accountId),
      initialProfile,
    );
  }

  for (const acknowledgement of [undefined, "double_confirm_irreversible"]) {
    const result = service.profileAction(token, {
      action: "pet_skill_forget",
      payload: {
        instanceId: "pet_fusion_skill_1",
        skillId: INHERITED_ACTIVE_ID,
        ...(acknowledgement ? {acknowledgement} : {}),
      },
    });
    assert.equal(result.ok, false);
    assert.equal(
      result.code,
      "pet_fusion_skill_forget_confirmation_required",
    );
    assert.equal(profileRevision(service, accountId), initialRevision);
    assert.deepEqual(
      internalProfileForAccount(service, accountId),
      initialProfile,
    );
  }

  const forgotten = service.profileAction(token, {
    action: "pet_skill_forget",
    payload: {
      instanceId: "pet_fusion_skill_1",
      skillId: INHERITED_ACTIVE_ID,
      acknowledgement: PET_FUSION_SKILL_FORGET_ACKNOWLEDGEMENT,
    },
  });
  assert.equal(forgotten.ok, true);
  const afterForget = internalProfileForAccount(service, accountId);
  const petAfterForget = afterForget.petInstances[0];
  assert.deepEqual(petAfterForget.activeSkillIds, [
    "pet_attack",
    "pet_defend",
  ]);
  assert.equal(petAfterForget.petSkillSlots[2], "");
  assert.equal(
    petAfterForget.forgottenSkillIds.includes(INHERITED_ACTIVE_ID),
    true,
  );
  assert.deepEqual(
    petAfterForget.fusionLineage,
    initialProfile.petInstances[0].fusionLineage,
  );
  assert.deepEqual(
    petAfterForget.passiveSkillIds,
    initialProfile.petInstances[0].passiveSkillIds,
  );

  const repeatedForgetRevision = profileRevision(service, accountId);
  const repeatedForget = service.profileAction(token, {
    action: "pet_skill_forget",
    payload: {
      instanceId: "pet_fusion_skill_1",
      skillId: INHERITED_ACTIVE_ID,
      acknowledgement: PET_FUSION_SKILL_FORGET_ACKNOWLEDGEMENT,
    },
  });
  assert.equal(repeatedForget.ok, false);
  assert.equal(repeatedForget.code, "pet_skill_not_learned");
  assert.equal(profileRevision(service, accountId), repeatedForgetRevision);

  const retrainInherited = service.profileAction(token, {
    action: "pet_skill_set_slot",
    payload: {
      instanceId: "pet_fusion_skill_1",
      slot: 3,
      skillId: INHERITED_ACTIVE_ID,
      trainerId: "firebud_pet_skill_trainer",
    },
  });
  assert.equal(retrainInherited.ok, false);
  assert.equal(retrainInherited.code, "pet_skill_not_offered");
  assert.equal(profileRevision(service, accountId), repeatedForgetRevision);

  const learned = service.profileAction(token, {
    action: "pet_skill_set_slot",
    payload: {
      instanceId: "pet_fusion_skill_1",
      slot: 3,
      skillId: "pet_focus_bite",
      trainerId: "firebud_pet_skill_trainer",
    },
  });
  assert.equal(learned.ok, true);
  const afterLearn = internalProfileForAccount(service, accountId);
  assert.equal(afterLearn.stoneCoins, 172);
  assert.equal(afterLearn.petInstances[0].petSkillSlots[2], "pet_focus_bite");
  assert.equal(
    afterLearn.petInstances[0].activeSkillIds.includes(INHERITED_ACTIVE_ID),
    false,
  );
  assert.deepEqual(
    afterLearn.petInstances[0].passiveSkillIds,
    initialProfile.petInstances[0].passiveSkillIds,
  );

  const occupiedRevision = profileRevision(service, accountId);
  const occupiedProfile = structuredClone(
    internalProfileForAccount(service, accountId),
  );
  const replaceOrdinary = service.profileAction(token, {
    action: "pet_skill_set_slot",
    payload: {
      instanceId: "pet_fusion_skill_1",
      slot: 3,
      skillId: "pet_sleep_powder",
      trainerId: "firebud_pet_skill_trainer",
    },
  });
  assert.equal(replaceOrdinary.ok, false);
  assert.equal(replaceOrdinary.code, "pet_fusion_skill_slot_occupied");
  assert.equal(profileRevision(service, accountId), occupiedRevision);
  assert.deepEqual(
    internalProfileForAccount(service, accountId),
    occupiedProfile,
  );
});

test("damaged fusion lineage blocks every skill mutation including empty-slot training", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const registered = service.register({
    username: "fusionlineagedamage",
    password: "test1234",
    displayName: "损坏融合技能",
  });
  const token = registered.session.token;
  const accountId = registered.account.accountId;
  const profile = battleProfile(
    "损坏融合技能",
    {level: 1, hp: 120, maxHp: 120},
    null,
  );
  const pet = fusionPet();
  pet.fusionLineage.activeInheritance = [];
  pet.activeSkillIds.push("pet_focus_bite");
  pet.petSkillSlots[3] = "pet_focus_bite";
  profile.stoneCoins = 200;
  profile.activePetInstanceId = pet.instanceId;
  profile.petInstances = [pet];
  assert.equal(
    service.saveProfile(token, {expectedRevision: 0, profile}).ok,
    true,
  );

  const revision = profileRevision(service, accountId);
  for (const [action, payload] of [
    [
      "pet_skill_forget",
      {instanceId: pet.instanceId, skillId: "pet_focus_bite"},
    ],
    [
      "pet_skill_set_slot",
      {
        instanceId: pet.instanceId,
        slot: 4,
        skillId: "",
        trainerId: "firebud_pet_skill_trainer",
      },
    ],
  ]) {
    const result = service.profileAction(token, {action, payload});
    assert.equal(result.ok, false);
    assert.equal(result.code, "pet_fusion_lineage_invalid");
    assert.equal(profileRevision(service, accountId), revision);
  }

  const learned = service.profileAction(token, {
    action: "pet_skill_set_slot",
    payload: {
      instanceId: pet.instanceId,
      slot: 5,
      skillId: "pet_sleep_powder",
      trainerId: "firebud_pet_skill_trainer",
    },
  });
  assert.equal(learned.ok, false);
  assert.equal(learned.code, "pet_fusion_lineage_invalid");
  assert.equal(profileRevision(service, accountId), revision);
  assert.equal(
    internalProfileForAccount(service, accountId)
      .petInstances[0].petSkillSlots[4],
    "",
  );
});

test("registered terminal fusion target without lineage still fails closed", () => {
  const recipeCatalog = loadPetFusionRecipeCatalog();
  const targetFormId = "emberhorn_fusion_solar_crown_fire7_wind3";
  assert.equal(recipeCatalog.targetFormIds.includes(targetFormId), true);
  assert.equal(recipeCatalog.terminalTargetFormIds.includes(targetFormId), true);
  const service = createAuthService({petFusionRecipeCatalog: recipeCatalog});
  const registered = service.register({
    username: "fusiontargetgap",
    password: "test1234",
    displayName: "缺失融合血脉",
  });
  const token = registered.session.token;
  const accountId = registered.account.accountId;
  const profile = battleProfile(
    "缺失融合血脉",
    {level: 1, hp: 120, maxHp: 120},
    null,
  );
  const pet = fusionPet();
  pet.formId = targetFormId;
  pet.templateId = pet.formId;
  delete pet.fusionLineage;
  profile.activePetInstanceId = pet.instanceId;
  profile.petInstances = [pet];
  assert.equal(
    service.saveProfile(token, {expectedRevision: 0, profile}).ok,
    true,
  );

  const initialRevision = profileRevision(service, accountId);
  const initialProfile = structuredClone(
    internalProfileForAccount(service, accountId),
  );
  for (const [action, payload] of [
    [
      "pet_skill_forget",
      {
        instanceId: pet.instanceId,
        skillId: INHERITED_ACTIVE_ID,
        acknowledgement: PET_FUSION_SKILL_FORGET_ACKNOWLEDGEMENT,
      },
    ],
    [
      "pet_skill_set_slot",
      {
        instanceId: pet.instanceId,
        slot: 3,
        skillId: "",
        trainerId: "firebud_pet_skill_trainer",
      },
    ],
  ]) {
    const result = service.profileAction(token, {action, payload});
    assert.equal(result.ok, false);
    assert.equal(result.code, "pet_fusion_lineage_invalid");
    assert.equal(profileRevision(service, accountId), initialRevision);
    assert.deepEqual(
      internalProfileForAccount(service, accountId),
      initialProfile,
    );
  }
});

test("ordinary pets keep existing non-base overwrite and forget behavior", () => {
  const service = createAuthService({store: createMemoryAuthStore()});
  const registered = service.register({
    username: "ordinaryskillpolicy",
    password: "test1234",
    displayName: "普通宠技能",
  });
  const token = registered.session.token;
  const profile = battleProfile(
    "普通宠技能",
    {level: 1, hp: 120, maxHp: 120},
    {
      petId: "ordinary_pet_1",
      formId: "bui_normal_red_fire10",
      name: "普通布伊",
    },
  );
  profile.stoneCoins = 200;
  assert.equal(
    service.saveProfile(token, {expectedRevision: 0, profile}).ok,
    true,
  );

  const replaced = service.profileAction(token, {
    action: "pet_skill_set_slot",
    payload: {
      instanceId: "ordinary_pet_1",
      slot: 3,
      skillId: "pet_focus_bite",
      trainerId: "firebud_pet_skill_trainer",
    },
  });
  assert.equal(replaced.ok, true);
  assert.equal(replaced.profile.petInstances[0].petSkillSlots[2], "pet_focus_bite");

  const forgotten = service.profileAction(token, {
    action: "pet_skill_forget",
    payload: {
      instanceId: "ordinary_pet_1",
      skillId: "pet_focus_bite",
    },
  });
  assert.equal(forgotten.ok, true);
  assert.equal(
    forgotten.profile.petInstances[0].activeSkillIds.includes("pet_focus_bite"),
    false,
  );
});

function fusionPet() {
  return {
    instanceId: "pet_fusion_skill_1",
    petId: "pet_fusion_skill_1",
    formId: "emberhorn_red_fire8_earth2",
    templateId: "emberhorn_red_fire8_earth2",
    name: "融合技能兽",
    state: "battle",
    level: 1,
    hp: 172,
    maxHp: 172,
    attack: 31,
    defense: 11,
    quick: 90,
    activeSkillIds: [
      "pet_attack",
      "pet_defend",
      INHERITED_ACTIVE_ID,
    ],
    petSkillSlots: [
      "pet_attack",
      "pet_defend",
      INHERITED_ACTIVE_ID,
      "",
      "",
      "",
      "",
    ],
    passiveSkillIds: ["emberhorn_red_burning_mind"],
    forgottenSkillIds: [],
    fusionLineage: {
      schemaVersion: 1,
      catalogId: "pet_fusion_recipes_v1",
      mode: "fusion",
      recipeId: "test_fusion_skill_policy_v1",
      targetFormId: "emberhorn_red_fire8_earth2",
      terminalStage: 2,
      activeInheritance: [
        {
          roleId: "core",
          geneProfileId: "fusion_gene_emberhorn_red_v1",
          skillId: INHERITED_ACTIVE_ID,
          inherited: true,
        },
        {
          roleId: "resonance_one",
          geneProfileId: "fusion_gene_emberhorn_ash_v1",
          skillId: "pet_gene_emberhorn_ash_sure_charge",
          inherited: false,
        },
        {
          roleId: "resonance_two",
          geneProfileId: "fusion_gene_mossback_marsh_v1",
          skillId: "pet_gene_mossback_marsh_sure_crush",
          inherited: false,
        },
      ],
      passiveInheritance: {
        roleId: "core",
        geneProfileId: "fusion_gene_emberhorn_red_v1",
        skillId: "emberhorn_red_burning_mind",
      },
    },
  };
}

function profileRevision(service, accountId) {
  return Number(
    service.snapshot().profileBindings[accountId].profileRevision || 0,
  );
}
