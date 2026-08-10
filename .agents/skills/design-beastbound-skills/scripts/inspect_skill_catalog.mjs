#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../../..");
const godotRoot = path.join(repoRoot, "client/godot");
const activePath = path.join(godotRoot, "data/battle_actions.json");
const passivePath = path.join(godotRoot, "data/battle_passive_skills.json");
const trainingPath = path.join(godotRoot, "data/pet_skill_training.json");

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const activeDoc = readJson(activePath);
const passiveDoc = readJson(passivePath);
const trainingDoc = readJson(trainingPath);
const active = (activeDoc.actions ?? []).filter((entry) => entry.owner === "pet_skill");
const passive = passiveDoc.passives ?? [];
const trainedIds = new Set((trainingDoc.skills ?? []).map((entry) => entry.skillId));
const petOwnerEffectTargetSupport = Object.freeze({
  damage: Object.freeze({
    commands: Object.freeze(["attack", "pet_skill"]),
    target: "single_enemy",
  }),
  defend: Object.freeze({
    commands: Object.freeze(["defend"]),
    target: "self_only",
  }),
  status: Object.freeze({
    commands: Object.freeze(["pet_skill"]),
    target: "single_enemy",
  }),
});
const errors = [];
const warnings = [];
const icons = [];

const targetShapeMatches = (target, expected) => {
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    return false;
  }
  if (expected === "single_enemy") {
    return (
      target.isAll === false
      && target.canTargetAlly === false
      && target.canTargetEnemy === true
      && target.selfOnly === false
    );
  }
  if (expected === "self_only") {
    return (
      target.isAll === false
      && target.canTargetAlly === true
      && target.canTargetEnemy === false
      && target.requiresSelection === false
      && target.selfOnly === true
    );
  }
  return false;
};

const inspectPetOwnerRuntimeSupport = (entry, id) => {
  const effect = entry.effect && typeof entry.effect === "object" && !Array.isArray(entry.effect)
    ? entry.effect
    : {};
  const effectType = String(effect.type ?? "");
  const command = String(entry.command ?? "");
  const support = petOwnerEffectTargetSupport[effectType];
  if (!support) {
    errors.push(
      `${id} 当前宠物运行时不支持 effect.type=${effectType || "(empty)"}；`
      + `只允许 ${Object.keys(petOwnerEffectTargetSupport).join(", ")}`,
    );
    return;
  }
  if (!support.commands.includes(command)) {
    errors.push(
      `${id} effect.type=${effectType} 的 command=${command || "(empty)"} 不受当前宠物运行时支持；`
      + `允许 ${support.commands.join(", ")}`,
    );
  }
  if (!targetShapeMatches(entry.target, support.target)) {
    errors.push(`${id} effect.type=${effectType} 的目标规则必须符合 ${support.target}`);
  }
  if (support.target === "single_enemy") {
    const expectedSelection = command !== "attack";
    if (entry.target?.requiresSelection !== expectedSelection) {
      errors.push(
        `${id} command=${command || "(empty)"} 的 requiresSelection 必须为 ${expectedSelection}`,
      );
    }
  }
};

const inspectEntry = (entry, kind) => {
  const id = String(entry.id ?? "");
  if (!id) {
    errors.push(`${kind} 技能缺少 id`);
    return;
  }
  const presentation = entry.presentation;
  if (!presentation || typeof presentation !== "object") {
    errors.push(`${id} 缺少 presentation`);
    return;
  }
  for (const field of ["description", "role", "source", "iconPath"]) {
    if (!String(presentation[field] ?? "").trim()) {
      errors.push(`${id}.presentation.${field} 不能为空`);
    }
  }
  const iconPath = String(presentation.iconPath ?? "");
  if (iconPath.startsWith("res://")) {
    const absolutePath = path.join(godotRoot, iconPath.slice("res://".length));
    if (!fs.existsSync(absolutePath)) {
      errors.push(`${id} 图标不存在: ${iconPath}`);
    } else {
      const content = fs.readFileSync(absolutePath);
      icons.push({
        id,
        kind,
        path: iconPath,
        bytes: content.length,
        sha256: crypto.createHash("sha256").update(content).digest("hex"),
      });
    }
  } else if (iconPath) {
    errors.push(`${id}.presentation.iconPath 必须以 res:// 开头`);
  }
  if (id === "quick_instinct" && !Boolean(presentation.mechanicsImplemented)) {
    warnings.push("quick_instinct 仍是展示型 no-op，UI 不得宣称先手效果");
  }
  if (kind === "active") {
    inspectPetOwnerRuntimeSupport(entry, id);
  }
};

for (const entry of active) inspectEntry(entry, "active");
for (const entry of passive) inspectEntry(entry, "passive");

for (const skillId of trainedIds) {
  if (!active.some((entry) => entry.id === skillId)) {
    errors.push(`训练目录引用不存在的宠物主动技能: ${skillId}`);
  }
}

const duplicateHashes = new Map();
for (const icon of icons) {
  const list = duplicateHashes.get(icon.sha256) ?? [];
  list.push(icon.id);
  duplicateHashes.set(icon.sha256, list);
}
for (const ids of duplicateHashes.values()) {
  if (ids.length > 1) {
    errors.push(`多个技能复用了同一图标文件内容: ${ids.join(", ")}`);
  }
}

console.log(JSON.stringify({
  activeCount: active.length,
  passiveCount: passive.length,
  trainedCount: trainedIds.size,
  iconCount: icons.length,
  petOwnerEffectTargetSupport,
  errors,
  warnings,
}, null, 2));

process.exit(errors.length === 0 ? 0 : 1);
