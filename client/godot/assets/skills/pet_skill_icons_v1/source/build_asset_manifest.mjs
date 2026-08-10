#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const bundleDir = path.resolve(sourceDir, "..");
const sourceGeneratedDir = path.join(sourceDir, "generated");
const runtimeDir = path.join(bundleDir, "runtime");
const outputPath = path.join(bundleDir, "asset-manifest.json");
const kinds = ["active", "passive"];

const sha256 = (filePath) => crypto
  .createHash("sha256")
  .update(fs.readFileSync(filePath))
  .digest("hex");

const pngSize = (filePath) => {
  const bytes = fs.readFileSync(filePath);
  if (bytes.length < 24 || bytes.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`不是 PNG: ${filePath}`);
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
};

const entries = [];
for (const kind of kinds) {
  const kindDir = path.join(runtimeDir, kind);
  if (!fs.existsSync(kindDir)) continue;
  for (const filename of fs.readdirSync(kindDir).filter((name) => name.endsWith(".png")).sort()) {
    const skillId = filename.slice(0, -4);
    const runtimePath = path.join(kindDir, filename);
    const sourcePath = path.join(sourceGeneratedDir, filename);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`${skillId} 缺少 source/generated`);
    }
    entries.push({
      skillId,
      kind,
      sourcePath: `source/generated/${filename}`,
      runtimePath: `runtime/${kind}/${filename}`,
      sourceSize: pngSize(sourcePath),
      runtimeSize: pngSize(runtimePath),
      sourceSha256: sha256(sourcePath),
      runtimeSha256: sha256(runtimePath),
      generator: "OpenAI ImageGen",
      ownership: "original_project_asset",
      ownerReviewStatus: "owner_review_pending",
    });
  }
}

const utilities = [];
const emptySlotSourcePath = path.join(sourceGeneratedDir, "ui_empty_skill_slot.png");
const emptySlotRuntimePath = path.join(runtimeDir, "common", "empty_skill_slot.png");
if (fs.existsSync(emptySlotSourcePath) && fs.existsSync(emptySlotRuntimePath)) {
  utilities.push({
    assetId: "ui_empty_skill_slot",
    sourcePath: "source/generated/ui_empty_skill_slot.png",
    runtimePath: "runtime/common/empty_skill_slot.png",
    sourceSize: pngSize(emptySlotSourcePath),
    runtimeSize: pngSize(emptySlotRuntimePath),
    sourceSha256: sha256(emptySlotSourcePath),
    runtimeSha256: sha256(emptySlotRuntimePath),
    generator: "OpenAI ImageGen",
    ownership: "original_project_asset",
    ownerReviewStatus: "owner_review_pending",
  });
}

const manifest = {
  schemaVersion: 1,
  bundleId: "pet_skill_icons_v1",
  generatedAt: new Date().toISOString(),
  sourceAndOwnership: "source-and-ownership.md",
  entries,
  utilities,
};

fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `技能图标 manifest: ${entries.length} skills + ${utilities.length} utilities -> ${outputPath}`,
);
