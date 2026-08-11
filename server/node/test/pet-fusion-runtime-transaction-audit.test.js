"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  ATOMIC_REPORT_NAME,
  DATA_PATHS,
  RESILIENCE_REPORT_NAME,
  ROUTE_CASES,
  SUMMARY_NAME,
  createIsolatedRuntimeCatalog,
  loadProductionDocuments,
  runAudit,
  writeAuditReports,
} = require("../scripts/pet-fusion-runtime-transaction-audit");

const REPOSITORY_ROOT = path.resolve(__dirname, "../../..");

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

test("both formal production fusion routes pass isolated atomic and retry-safety evidence", async (t) => {
  const productionCatalogPath = path.join(REPOSITORY_ROOT, DATA_PATHS.fusion);
  const catalogBefore = fs.readFileSync(productionCatalogPath);
  const outputDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "beastbound-pet-fusion-runtime-audit-"),
  );
  t.after(() => fs.rmSync(outputDir, {recursive: true, force: true}));

  const reports = await runAudit();
  assert.equal(reports.atomicReport.status, "passed");
  assert.equal(
    reports.atomicReport.evidenceKind,
    "authoritative_three_pet_atomic_transaction",
  );
  assert.equal(reports.atomicReport.routeCount, ROUTE_CASES.length);
  assert.equal(reports.atomicReport.routes.length, ROUTE_CASES.length);
  assert.equal(
    reports.atomicReport.routes.every((route) => (
      route.quoteReadOnly === true
      && route.sourcePetCount === 3
      && route.resultPetCount === 1
      && route.allThreeMaterialInstancesConsumed === true
      && route.newResultInstanceCreated === true
      && route.profileRevisionDelta === 1
      && route.randomAuthorityOpenCount === 1
      && route.durableReceiptPersisted === true
      && route.privateAuthorityFieldsExposed === false
    )),
    true,
  );

  assert.equal(reports.resilienceReport.status, "passed");
  assert.equal(
    reports.resilienceReport.evidenceKind,
    "idempotency_disconnect_conflict_rollback",
  );
  assert.equal(reports.resilienceReport.routes.length, ROUTE_CASES.length);
  assert.equal(
    reports.resilienceReport.routes.every((route) => (
      route.simulatedResponseLossBeforeReconnect === true
      && route.replayAfterServiceRestart === true
      && route.replayedSameResultInstance === true
      && route.replayRandomAuthorityOpenCount === 0
      && route.replayStoreMutationCount === 0
      && route.staleRevisionConflictCode === "revision_conflict"
      && route.staleRevisionConflictStoreChanged === false
      && route.staleCatalogConflictCode === "pet_fusion_catalog_conflict"
      && route.staleCatalogConflictStoreChanged === false
      && route.confirmedRollbackErrorCode === "storage_write_failed"
      && route.confirmedRollbackOutcomeUnknown === false
      && route.confirmedRollbackPublishedMutation === false
      && route.confirmedRollbackPersistedMutation === false
      && route.confirmedRollbackSourcePetCount === 3
    )),
    true,
  );
  assert.equal(reports.atomicReport.sharedMysqlConnected, false);
  assert.equal(reports.atomicReport.realPlayerProfileMutated, false);

  const written = writeAuditReports(outputDir, reports);
  assert.equal(path.basename(written.atomicPath), ATOMIC_REPORT_NAME);
  assert.equal(path.basename(written.resiliencePath), RESILIENCE_REPORT_NAME);
  assert.equal(path.basename(written.summaryPath), SUMMARY_NAME);
  const summary = JSON.parse(fs.readFileSync(written.summaryPath, "utf8"));
  assert.equal(summary.status, "passed");
  assert.deepEqual(
    summary.outputs.map((entry) => entry.evidenceKind),
    [
      "authoritative_three_pet_atomic_transaction",
      "idempotency_disconnect_conflict_rollback",
    ],
  );
  assert.equal(summary.outputs[0].sha256, sha256File(written.atomicPath));
  assert.equal(summary.outputs[1].sha256, sha256File(written.resiliencePath));

  assert.deepEqual(fs.readFileSync(productionCatalogPath), catalogBefore);
  const productionDocument = JSON.parse(catalogBefore.toString("utf8"));
  assert.equal(productionDocument.runtimeEnabled, false);
});

test("isolated audit bypass rejects an already-open or drifted production catalog", async (t) => {
  const cases = [
    {
      name: "already open",
      mutate(documents) {
        documents.fusionDocument.runtimeEnabled = true;
      },
      evidence: "must remain closed",
    },
    {
      name: "target drift",
      mutate(documents) {
        documents.fusionDocument.recipes[0].targetFormId = "drifted_fusion_target";
      },
      evidence: "recipe target drift",
    },
    {
      name: "route removed",
      mutate(documents) {
        documents.fusionDocument.recipes.pop();
      },
      evidence: "exactly the two frozen routes",
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, () => {
      const documents = loadProductionDocuments();
      testCase.mutate(documents);
      assert.throws(
        () => createIsolatedRuntimeCatalog(documents),
        (error) => (
          error.code === "pet_fusion_runtime_transaction_audit_failed"
          && error.message.includes(testCase.evidence)
        ),
      );
    });
  }
});
