#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {isDeepStrictEqual} = require("node:util");

const {
  createAuthService,
  createAsyncWriteAuthStore,
  createMemoryAuthStore,
  internalProfileForAccount,
} = require("../test-support/auth-service-test-context");
const {
  createFusionMaterial,
} = require("../test-support/pet-fusion-fixture");
const {
  PET_FUSION_ROLE_IDS,
  createPetFusionRecipeCatalog,
} = require("../src/auth/pet-fusion-recipe-catalog");
const {
  loadPetGrowthCatalog,
} = require("../src/auth/pet-growth-catalog");
const {
  createPetFusionRandomAuthority,
} = require("../src/auth/pet-fusion-random-authority");

const REPOSITORY_ROOT = path.resolve(__dirname, "../../..");
const TOOL_PATH = path.resolve(__filename);
const DEFAULT_OUTPUT_DIR = path.join(
  REPOSITORY_ROOT,
  ".run/evidence/phase410_pet_fusion_runtime_transaction_audit",
);
const ISOLATED_CATALOG_PATH =
  "test://pet_fusion_runtime_transaction_audit/production_recipes.json";
const NOW_MS = Date.parse("2026-08-12T06:00:00.000Z");
const ACTION_ID = "POST /pets/fusion";
const ATOMIC_REPORT_NAME = "authoritative-three-pet-atomic-transaction.json";
const RESILIENCE_REPORT_NAME = "idempotency-disconnect-conflict-rollback.json";
const SUMMARY_NAME = "summary.json";

const DATA_PATHS = Object.freeze({
  fusion: "client/godot/data/pet_fusion_recipes.json",
  templates: "client/godot/data/pet_templates.json",
  growth: "client/godot/data/balance/pet_growth_species_profiles.json",
  actions: "client/godot/data/battle_actions.json",
  passives: "client/godot/data/battle_passive_skills.json",
  skillTraining: "client/godot/data/pet_skill_training.json",
  paidReset: "client/godot/data/balance/pet_paid_reset_policy.json",
});

const ROUTE_CASES = Object.freeze([
  Object.freeze({
    name: "曜冠角兽路线",
    recipeId: "emberhorn_solar_crown_fusion_v1",
    targetFormId: "emberhorn_fusion_solar_crown_fire7_wind3",
    geneProfileIdsByRole: Object.freeze({
      core: "fusion_gene_emberhorn_red_v1",
      resonance_one: "fusion_gene_emberhorn_gale_v1",
      resonance_two: "fusion_gene_mossback_sunbaked_v1",
    }),
  }),
  Object.freeze({
    name: "苔垒角兽路线",
    recipeId: "emberhorn_moss_rampart_fusion_v1",
    targetFormId: "emberhorn_fusion_moss_rampart_fire4_earth6",
    geneProfileIdsByRole: Object.freeze({
      core: "fusion_gene_emberhorn_ash_v1",
      resonance_one: "fusion_gene_mossback_marsh_v1",
      resonance_two: "fusion_gene_emberhorn_red_v1",
    }),
  }),
]);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function stableRequestHash(value) {
  return sha256(Buffer.from(JSON.stringify(value), "utf8"));
}

function repositoryRelative(filePath) {
  return path.relative(REPOSITORY_ROOT, filePath).split(path.sep).join("/");
}

function requireAudit(condition, message) {
  if (!condition) {
    const error = new Error(`pet fusion runtime transaction audit failed: ${message}`);
    error.code = "pet_fusion_runtime_transaction_audit_failed";
    throw error;
  }
}

function loadProductionDocuments() {
  return {
    fusionDocument: readJson(DATA_PATHS.fusion),
    templatesDocument: readJson(DATA_PATHS.templates),
    growthProfilesDocument: readJson(DATA_PATHS.growth),
    actionsDocument: readJson(DATA_PATHS.actions),
    passivesDocument: readJson(DATA_PATHS.passives),
    skillTrainingDocument: readJson(DATA_PATHS.skillTraining),
    paidResetDocument: readJson(DATA_PATHS.paidReset),
  };
}

function createIsolatedRuntimeCatalog(documents = loadProductionDocuments()) {
  const fusionDocument = structuredClone(documents.fusionDocument);
  requireAudit(
    fusionDocument.runtimeEnabled === false,
    "production fusion catalog must remain closed before isolated audit",
  );
  requireAudit(
    Array.isArray(fusionDocument.recipes)
      && fusionDocument.recipes.length === ROUTE_CASES.length,
    "production fusion catalog must contain exactly the two frozen routes",
  );
  for (const routeCase of ROUTE_CASES) {
    const recipe = fusionDocument.recipes.find(
      (entry) => entry && entry.recipeId === routeCase.recipeId,
    );
    requireAudit(Boolean(recipe), `missing frozen recipe ${routeCase.recipeId}`);
    requireAudit(
      recipe.targetFormId === routeCase.targetFormId,
      `recipe target drift for ${routeCase.recipeId}`,
    );
    requireAudit(
      recipe.assetGate && recipe.assetGate.status === "formal",
      `formal asset gate missing for ${routeCase.recipeId}`,
    );
  }

  fusionDocument.runtimeEnabled = true;
  const catalog = createPetFusionRecipeCatalog({
    ...documents,
    document: fusionDocument,
    allowTestOnlyRecipes: true,
    allowUnattestedRuntimeForTests: true,
    catalogPath: ISOLATED_CATALOG_PATH,
  });
  requireAudit(catalog.runtimeEnabled === true, "isolated audit catalog did not open");
  requireAudit(
    catalog.releaseAttestation
      && catalog.releaseAttestation.testOnly === true
      && catalog.releaseAttestation.status === "test_only_unattested"
      && catalog.releaseAttestation.catalogPath === ISOLATED_CATALOG_PATH,
    "isolated audit catalog escaped the test-only release boundary",
  );
  return catalog;
}

function countedRandomAuthority(byte) {
  let calls = 0;
  const authority = createPetFusionRandomAuthority({
    randomBytes(size) {
      calls += 1;
      return Buffer.alloc(size, byte);
    },
  });
  return {
    authority,
    calls() {
      return calls;
    },
  };
}

function createAuditService(store, catalog, randomByte) {
  const random = countedRandomAuthority(randomByte);
  const service = createAuthService({
    store,
    now: () => NOW_MS,
    petFusionRecipeCatalog: catalog,
    petFusionRandomAuthority: random.authority,
  });
  return {service, random};
}

function seedRoute(service, catalog, routeCase, username, seedOffset = 0) {
  const registered = service.register({
    username,
    password: "test1234",
    displayName: `${routeCase.name}事务审计猎人`,
  });
  requireAudit(registered.ok === true, `registration failed for ${routeCase.recipeId}`);
  const loaded = service.getProfile(registered.session.token);
  requireAudit(loaded.ok === true, `profile load failed for ${routeCase.recipeId}`);

  const growthCatalog = loadPetGrowthCatalog();
  const materials = {};
  for (const [index, roleId] of PET_FUSION_ROLE_IDS.entries()) {
    const geneProfileId = routeCase.geneProfileIdsByRole[roleId];
    const geneProfile = catalog.geneProfilesById[geneProfileId];
    requireAudit(Boolean(geneProfile), `missing gene profile ${geneProfileId}`);
    const binding = roleId === "core" ? "bound" : "unbound";
    materials[roleId] = createFusionMaterial(geneProfile, {
      growthCatalog,
      instanceId: `${username}_${roleId}`,
      privateSeedByte: 0x51 + seedOffset + index,
      state: index === 0 ? "battle" : (index === 1 ? "standby" : "storage"),
      binding,
      bound: binding === "bound",
    });
  }

  const profile = structuredClone(loaded.profile);
  profile.petInstances = PET_FUSION_ROLE_IDS.map((roleId) => materials[roleId]);
  profile.activePetInstanceId = materials.core.instanceId;
  profile.ridePetInstanceId = "";
  profile.nextPetInstanceSerial = 100;
  const saved = service.saveProfile(registered.session.token, {
    expectedRevision: loaded.profileSummary.profileRevision,
    profile,
  });
  requireAudit(saved.ok === true, `profile seed failed for ${routeCase.recipeId}`);
  return {
    accountId: registered.account.accountId,
    materialInstanceIds: Object.fromEntries(
      PET_FUSION_ROLE_IDS.map((roleId) => [roleId, materials[roleId].instanceId]),
    ),
    materials,
    profileRevision: saved.profileSummary.profileRevision,
    sessionToken: registered.session.token,
  };
}

function requestFor(account, catalog, routeCase, overrides = {}) {
  return {
    recipeId: routeCase.recipeId,
    materialInstanceIds: {...account.materialInstanceIds},
    expectedProfileRevision: account.profileRevision,
    expectedCatalogId: catalog.catalogId,
    ...overrides,
  };
}

function operationFor(operationId, request) {
  return {
    operationId,
    requestHash: stableRequestHash(request),
    actionId: ACTION_ID,
  };
}

function privateSeeds(profile) {
  const values = [];
  for (const pet of Array.isArray(profile.petInstances) ? profile.petInstances : []) {
    for (const value of [
      pet && pet.fusionPrivate && pet.fusionPrivate.privateRootSeed,
      pet && pet.fusionPrivate && pet.fusionPrivate.growthPrivateSeed,
      pet && pet.petGrowth && pet.petGrowth.private && pet.petGrowth.private.privateSeed,
    ]) {
      if (typeof value === "string" && value !== "") values.push(value);
    }
  }
  return values;
}

function activeReceiptCount(snapshot) {
  return Object.keys(snapshot && snapshot.mutationReceipts || {}).length;
}

async function auditRoute(routeCase, routeIndex, catalog) {
  const store = createMemoryAuthStore();
  const firstRuntime = createAuditService(store, catalog, 0x71 + routeIndex);
  const account = seedRoute(
    firstRuntime.service,
    catalog,
    routeCase,
    `fusionauditsuccess${routeIndex}`,
    routeIndex * 4,
  );
  const beforeProfile = structuredClone(
    internalProfileForAccount(firstRuntime.service, account.accountId),
  );
  const beforeStore = structuredClone(store.load());
  const sourcePrivateSeeds = privateSeeds(beforeProfile);
  requireAudit(beforeProfile.petInstances.length === 3, "audit seed must contain three pets");

  const quotePayload = {
    recipeId: routeCase.recipeId,
    materialInstanceIds: {...account.materialInstanceIds},
  };
  const quote = firstRuntime.service.getPetFusionQuote(
    account.sessionToken,
    quotePayload,
  );
  requireAudit(quote.ok === true, `quote failed for ${routeCase.recipeId}: ${quote.code}`);
  requireAudit(
    quote.petFusionQuote.result.targetFormId === routeCase.targetFormId,
    `quote target drift for ${routeCase.recipeId}`,
  );
  requireAudit(
    isDeepStrictEqual(
      internalProfileForAccount(firstRuntime.service, account.accountId),
      beforeProfile,
    ) && isDeepStrictEqual(store.load(), beforeStore),
    `quote mutated authority for ${routeCase.recipeId}`,
  );

  const request = requestFor(account, catalog, routeCase);
  const operationId = `pet_fusion_runtime_audit_${routeIndex}_commit_0001`;
  const operation = operationFor(operationId, request);
  const committed = await firstRuntime.service.invokeDurable(
    "fusePets",
    [account.sessionToken, request],
    operation,
  );
  await firstRuntime.service.waitForDurableIdle();
  requireAudit(committed.ok === true, `commit failed for ${routeCase.recipeId}`);
  requireAudit(
    committed.durableCommit && committed.durableCommit.replayed === false,
    `first commit was not new for ${routeCase.recipeId}`,
  );
  requireAudit(
    committed.petFusion && committed.petFusion.targetFormId === routeCase.targetFormId,
    `committed target drift for ${routeCase.recipeId}`,
  );

  const afterProfile = structuredClone(
    internalProfileForAccount(firstRuntime.service, account.accountId),
  );
  requireAudit(afterProfile.petInstances.length === 1, "fusion must leave one pet");
  const resultPet = afterProfile.petInstances[0];
  const materialIds = new Set(Object.values(account.materialInstanceIds));
  requireAudit(resultPet.formId === routeCase.targetFormId, "result form mismatch");
  requireAudit(!materialIds.has(resultPet.instanceId), "fusion reused a material instance");
  requireAudit(resultPet.level === 1, "fusion result must begin at Lv1");
  requireAudit(
    resultPet.petCultivation && resultPet.petCultivation.rebirthCount === 1,
    "fusion result must retain the one-rebirth contract",
  );
  requireAudit(resultPet.binding === "bound", "bound material did not bind result");
  requireAudit(
    Object.values(account.materialInstanceIds).every(
      (instanceId) => !afterProfile.petInstances.some((pet) => pet.instanceId === instanceId),
    ),
    "not all three material instances were consumed",
  );
  requireAudit(
    committed.profileBinding.profileRevision === account.profileRevision + 1,
    "profile revision did not advance exactly once",
  );
  requireAudit(firstRuntime.random.calls() === 1, "fusion random authority must open once");

  const publicJson = JSON.stringify(committed);
  const resultPrivateSeeds = privateSeeds(afterProfile);
  requireAudit(
    [...sourcePrivateSeeds, ...resultPrivateSeeds].every(
      (value) => !publicJson.includes(value),
    ),
    "private fusion or growth seed leaked into public response",
  );
  requireAudit(
    committed.profile.petInstances.every(
      (pet) => !Object.hasOwn(pet, "fusionPrivate")
        && !(pet.petGrowth && Object.hasOwn(pet.petGrowth, "private")),
    ),
    "public pet projection contains private authority fields",
  );

  const committedStore = structuredClone(store.load());
  const receiptCountAfterCommit = activeReceiptCount(committedStore);
  requireAudit(receiptCountAfterCommit >= 1, "durable fusion receipt was not persisted");

  // Simulate a caller losing the successful response, reconnecting to a fresh
  // service process, and retrying the exact operation identifier.
  const restartedRuntime = createAuditService(store, catalog, 0x31 + routeIndex);
  const replay = await restartedRuntime.service.invokeDurable(
    "fusePets",
    [account.sessionToken, request],
    operation,
  );
  await restartedRuntime.service.waitForDurableIdle();
  requireAudit(replay.ok === true, "restart replay failed");
  requireAudit(
    replay.durableCommit && replay.durableCommit.replayed === true,
    "restart replay did not use durable receipt",
  );
  requireAudit(
    replay.petFusion.resultInstanceId === committed.petFusion.resultInstanceId,
    "restart replay returned a different result instance",
  );
  requireAudit(
    restartedRuntime.random.calls() === 0,
    "restart replay reopened fusion randomness",
  );
  requireAudit(
    isDeepStrictEqual(store.load(), committedStore),
    "restart replay mutated committed store",
  );

  const conflictStoreBefore = structuredClone(store.load());
  const conflict = await restartedRuntime.service.invokeDurable(
    "fusePets",
    [account.sessionToken, request],
    operationFor(`pet_fusion_runtime_audit_${routeIndex}_conflict_0001`, request),
  );
  await restartedRuntime.service.waitForDurableIdle();
  requireAudit(conflict.ok === false && conflict.code === "revision_conflict", "stale retry conflict failed");
  requireAudit(
    isDeepStrictEqual(store.load(), conflictStoreBefore),
    "revision conflict changed committed store",
  );

  const rollbackBase = createMemoryAuthStore();
  const rollbackSeedRuntime = createAuditService(
    rollbackBase,
    catalog,
    0x41 + routeIndex,
  );
  const rollbackAccount = seedRoute(
    rollbackSeedRuntime.service,
    catalog,
    routeCase,
    `fusionauditrollback${routeIndex}`,
    12 + routeIndex * 4,
  );
  const rollbackRequest = requestFor(rollbackAccount, catalog, routeCase);
  const rollbackBeforeStore = structuredClone(rollbackBase.load());

  const catalogConflict = await rollbackSeedRuntime.service.invokeDurable(
    "fusePets",
    [rollbackAccount.sessionToken, {
      ...rollbackRequest,
      expectedCatalogId: "pet_fusion_recipes_stale",
    }],
    operationFor(
      `pet_fusion_runtime_audit_${routeIndex}_catalog_conflict_0001`,
      {...rollbackRequest, expectedCatalogId: "pet_fusion_recipes_stale"},
    ),
  );
  await rollbackSeedRuntime.service.waitForDurableIdle();
  requireAudit(
    catalogConflict.ok === false && catalogConflict.code === "pet_fusion_catalog_conflict",
    "catalog conflict did not fail closed",
  );
  requireAudit(
    isDeepStrictEqual(rollbackBase.load(), rollbackBeforeStore),
    "catalog conflict mutated rollback fixture",
  );

  const failingStore = createAsyncWriteAuthStore({
    mode: "mysql",
    load: () => rollbackBase.load(),
    async saveAsync() {
      const error = new Error("injected fusion transaction rollback");
      error.code = "mysql_transaction_rolled_back";
      error.outcomeUnknown = false;
      error.rollbackConfirmed = true;
      throw error;
    },
  }, {onError: () => {}});
  const rollbackRuntime = createAuditService(
    failingStore,
    catalog,
    0x21 + routeIndex,
  );
  const rollbackBeforeProfile = structuredClone(
    internalProfileForAccount(rollbackRuntime.service, rollbackAccount.accountId),
  );
  let rollbackError = null;
  try {
    await rollbackRuntime.service.invokeDurable(
      "fusePets",
      [rollbackAccount.sessionToken, rollbackRequest],
      operationFor(
        `pet_fusion_runtime_audit_${routeIndex}_rollback_0001`,
        rollbackRequest,
      ),
    );
  } catch (error) {
    rollbackError = error;
  }
  await rollbackRuntime.service.waitForDurableIdle();
  requireAudit(Boolean(rollbackError), "confirmed rollback unexpectedly succeeded");
  requireAudit(
    rollbackError.code === "storage_write_failed"
      && rollbackError.outcomeUnknown === false,
    "confirmed rollback returned an unsafe outcome classification",
  );
  requireAudit(
    isDeepStrictEqual(rollbackBase.load(), rollbackBeforeStore),
    "confirmed rollback persisted a candidate mutation",
  );
  requireAudit(
    isDeepStrictEqual(
      internalProfileForAccount(rollbackRuntime.service, rollbackAccount.accountId),
      rollbackBeforeProfile,
    ),
    "confirmed rollback published a candidate mutation",
  );
  requireAudit(
    rollbackBeforeProfile.petInstances.length === 3,
    "rollback baseline lost source materials",
  );

  return {
    atomic: {
      recipeId: routeCase.recipeId,
      routeName: routeCase.name,
      targetFormId: routeCase.targetFormId,
      quoteReadOnly: true,
      sourcePetCount: 3,
      resultPetCount: 1,
      allThreeMaterialInstancesConsumed: true,
      newResultInstanceCreated: true,
      resultLevel: resultPet.level,
      resultRebirthCount: resultPet.petCultivation.rebirthCount,
      resultBinding: resultPet.binding,
      profileRevisionDelta: 1,
      randomAuthorityOpenCount: firstRuntime.random.calls(),
      durableReceiptPersisted: true,
      privateAuthorityFieldsExposed: false,
    },
    resilience: {
      recipeId: routeCase.recipeId,
      routeName: routeCase.name,
      targetFormId: routeCase.targetFormId,
      simulatedResponseLossBeforeReconnect: true,
      replayAfterServiceRestart: true,
      replayedSameResultInstance: true,
      replayRandomAuthorityOpenCount: restartedRuntime.random.calls(),
      replayStoreMutationCount: 0,
      staleRevisionConflictCode: conflict.code,
      staleRevisionConflictStoreChanged: false,
      staleCatalogConflictCode: catalogConflict.code,
      staleCatalogConflictStoreChanged: false,
      confirmedRollbackErrorCode: rollbackError.code,
      confirmedRollbackOutcomeUnknown: rollbackError.outcomeUnknown,
      confirmedRollbackPublishedMutation: false,
      confirmedRollbackPersistedMutation: false,
      confirmedRollbackSourcePetCount: rollbackBeforeProfile.petInstances.length,
    },
  };
}

async function runAudit(options = {}) {
  const productionCatalogPath = path.join(REPOSITORY_ROOT, DATA_PATHS.fusion);
  const productionCatalogShaBefore = sha256File(productionCatalogPath);
  const productionDocuments = options.documents || loadProductionDocuments();
  const catalog = createIsolatedRuntimeCatalog(productionDocuments);
  const routeResults = [];
  for (const [index, routeCase] of ROUTE_CASES.entries()) {
    routeResults.push(await auditRoute(routeCase, index, catalog));
  }
  const productionCatalogShaAfter = sha256File(productionCatalogPath);
  requireAudit(
    productionCatalogShaAfter === productionCatalogShaBefore,
    "production fusion catalog changed during isolated audit",
  );
  const currentProductionDocument = readJson(DATA_PATHS.fusion);
  requireAudit(
    currentProductionDocument.runtimeEnabled === false,
    "production fusion runtime opened during isolated audit",
  );

  const shared = {
    schemaVersion: 1,
    auditMode: "isolated_test_only_production_recipe_replay",
    status: "passed",
    roadmapItem: "P1.4",
    toolPath: repositoryRelative(TOOL_PATH),
    toolSha256: sha256File(TOOL_PATH),
    productionCatalogPath: DATA_PATHS.fusion,
    productionCatalogSha256Before: productionCatalogShaBefore,
    productionCatalogSha256After: productionCatalogShaAfter,
    productionCatalogRuntimeEnabledBefore: false,
    productionCatalogRuntimeEnabledAfter: false,
    isolatedCatalogPath: ISOLATED_CATALOG_PATH,
    isolatedReleaseStatus: catalog.releaseAttestation.status,
    sharedMysqlConnected: false,
    realPlayerProfileMutated: false,
    routeCount: ROUTE_CASES.length,
    errors: [],
  };
  return {
    atomicReport: {
      ...shared,
      evidenceKind: "authoritative_three_pet_atomic_transaction",
      routes: routeResults.map((entry) => entry.atomic),
    },
    resilienceReport: {
      ...shared,
      evidenceKind: "idempotency_disconnect_conflict_rollback",
      routes: routeResults.map((entry) => entry.resilience),
    },
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeAuditReports(outputDir, reports) {
  const resolvedOutputDir = path.resolve(String(outputDir || DEFAULT_OUTPUT_DIR));
  const atomicPath = path.join(resolvedOutputDir, ATOMIC_REPORT_NAME);
  const resiliencePath = path.join(resolvedOutputDir, RESILIENCE_REPORT_NAME);
  writeJson(atomicPath, reports.atomicReport);
  writeJson(resiliencePath, reports.resilienceReport);
  const summary = {
    schemaVersion: 1,
    mode: "pet_fusion_runtime_transaction_audit",
    status: "passed",
    outputs: [
      {
        evidenceKind: reports.atomicReport.evidenceKind,
        path: path.relative(resolvedOutputDir, atomicPath),
        sha256: sha256File(atomicPath),
      },
      {
        evidenceKind: reports.resilienceReport.evidenceKind,
        path: path.relative(resolvedOutputDir, resiliencePath),
        sha256: sha256File(resiliencePath),
      },
    ],
    errors: [],
  };
  const summaryPath = path.join(resolvedOutputDir, SUMMARY_NAME);
  writeJson(summaryPath, summary);
  return {
    outputDir: resolvedOutputDir,
    atomicPath,
    resiliencePath,
    summaryPath,
    atomicSha256: sha256File(atomicPath),
    resilienceSha256: sha256File(resiliencePath),
    summarySha256: sha256File(summaryPath),
  };
}

function parseArgs(argv) {
  let outputDir = DEFAULT_OUTPUT_DIR;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir") {
      const value = String(argv[++index] || "").trim();
      if (value === "") throw new TypeError("--output-dir requires a value");
      outputDir = path.resolve(REPOSITORY_ROOT, value);
    } else {
      throw new TypeError(`unknown argument: ${argument}`);
    }
  }
  return {outputDir};
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const reports = await runAudit();
  const written = writeAuditReports(options.outputDir, reports);
  process.stdout.write(
    `pet fusion runtime transaction audit: passed routes=${ROUTE_CASES.length}\n`,
  );
  process.stdout.write(`atomic=${written.atomicPath} sha256=${written.atomicSha256}\n`);
  process.stdout.write(
    `resilience=${written.resiliencePath} sha256=${written.resilienceSha256}\n`,
  );
  process.stdout.write(`summary=${written.summaryPath} sha256=${written.summarySha256}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  ATOMIC_REPORT_NAME,
  DATA_PATHS,
  DEFAULT_OUTPUT_DIR,
  RESILIENCE_REPORT_NAME,
  ROUTE_CASES,
  SUMMARY_NAME,
  createIsolatedRuntimeCatalog,
  loadProductionDocuments,
  runAudit,
  writeAuditReports,
};
