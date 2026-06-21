#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const catalogPath = path.join(repoRoot, "client/godot/data/battle_actions.json");
const maxPetSkillSlots = 7;
const validOwners = new Set(["player", "spirit", "pet_skill", "item"]);
const requiredRuntimeActions = [
  "spirit_grace_5",
  "spirit_moist_5",
  "spirit_poison_5",
  "spirit_poison_mist_5",
  "pet_attack",
  "pet_defend",
  "pet_bui_charge",
  "item_heal_all_5",
  "item_heal_single_5",
  "item_poison_single_5",
  "item_poison_all_5",
];

function readCatalog() {
  const raw = fs.readFileSync(catalogPath, "utf8");
  return JSON.parse(raw);
}

function actionName(action, index) {
  return action?.id || `actions[${index}]`;
}

function validateCatalog(catalog) {
  const errors = [];
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    return ["battle_actions.json 必须是 JSON 对象"];
  }
  if (!Array.isArray(catalog.actions) || catalog.actions.length === 0) {
    return ["actions 不能为空"];
  }
  if (catalog.maxPetSkillSlots !== maxPetSkillSlots) {
    errors.push(`maxPetSkillSlots 当前必须是 ${maxPetSkillSlots}`);
  }

  const ids = new Set();
  const petSlots = new Set();
  catalog.actions.forEach((action, index) => {
    if (!action || typeof action !== "object" || Array.isArray(action)) {
      errors.push(`actions[${index}] 不是对象`);
      return;
    }
    const name = actionName(action, index);
    if (!action.id || typeof action.id !== "string") {
      errors.push(`${name}.id 不能为空`);
    } else if (ids.has(action.id)) {
      errors.push(`action id 重复: ${action.id}`);
    } else {
      ids.add(action.id);
    }
    if (!action.label || typeof action.label !== "string") {
      errors.push(`${name}.label 不能为空`);
    }
    if (!validOwners.has(action.owner)) {
      errors.push(`${name}.owner 无效: ${action.owner}`);
    }
    validateTarget(name, action.target, errors);
    validateEffect(name, action.effect, errors);
    if (action.owner === "pet_skill") {
      validatePetSkillSlot(name, action.slot, petSlots, errors);
    }
  });

  for (const requiredId of requiredRuntimeActions) {
    if (!ids.has(requiredId)) {
      errors.push(`缺少当前战斗需要的动作: ${requiredId}`);
    }
  }
  return errors;
}

function validateTarget(name, target, errors) {
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    errors.push(`${name}.target 必须是对象`);
    return;
  }
  for (const key of ["isAll", "canTargetAlly", "canTargetEnemy", "requiresSelection", "selfOnly"]) {
    if (!(key in target)) {
      errors.push(`${name}.target.${key} 缺失`);
    } else if (typeof target[key] !== "boolean") {
      errors.push(`${name}.target.${key} 必须是布尔值`);
    }
  }
  if (target.isAll && target.requiresSelection) {
    errors.push(`${name} 不能既是全体又要求单体点选`);
  }
  if (target.isAll && !target.canTargetAlly && !target.canTargetEnemy) {
    errors.push(`${name} 全体目标必须至少允许我方或敌方一侧`);
  }
  if (target.requiresSelection && !target.canTargetAlly && !target.canTargetEnemy) {
    errors.push(`${name} 需要点选时必须至少允许一侧目标`);
  }
  if (target.selfOnly && (target.isAll || target.canTargetEnemy || target.requiresSelection)) {
    errors.push(`${name} selfOnly 只能是我方非全体且不点选`);
  }
}

function validateEffect(name, effect, errors) {
  if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
    errors.push(`${name}.effect 必须是对象`);
    return;
  }
  if (!effect.type || typeof effect.type !== "string") {
    errors.push(`${name}.effect.type 不能为空`);
  }
  if (["heal", "poison"].includes(effect.type) && typeof effect.amount !== "number") {
    errors.push(`${name}.${effect.type} 必须配置数字 amount`);
  }
  if ("amountBonus" in effect && typeof effect.amountBonus !== "number") {
    errors.push(`${name}.effect.amountBonus 必须是数字`);
  }
}

function validatePetSkillSlot(name, slot, petSlots, errors) {
  if (!Number.isInteger(slot) || slot < 1 || slot > maxPetSkillSlots) {
    errors.push(`${name}.slot 必须在 1-${maxPetSkillSlots} 之间`);
    return;
  }
  if (petSlots.has(slot)) {
    errors.push(`宠物技能槽重复: 技${slot}`);
  } else {
    petSlots.add(slot);
  }
}

function printList(catalog) {
  for (const action of catalog.actions) {
    const target = action.target;
    const sides = [
      target.canTargetAlly ? "我方" : "",
      target.canTargetEnemy ? "敌方" : "",
    ].filter(Boolean).join("+") || "无";
    const scope = target.isAll ? "全体" : target.selfOnly ? "自己" : "单体";
    const select = target.requiresSelection ? "需点选" : "不点选";
    const slot = action.owner === "pet_skill" ? ` 技${action.slot}` : "";
    console.log(`${action.id.padEnd(24)} ${action.owner}${slot} ${action.label} ${sides}/${scope}/${select}`);
  }
}

function printTemplate(kind) {
  const templates = {
    spirit: {
      id: "spirit_new_5",
      owner: "spirit",
      label: "新精灵5",
      command: "spirit",
      target: {
        isAll: false,
        canTargetAlly: true,
        canTargetEnemy: false,
        requiresSelection: true,
        selfOnly: false,
      },
      effect: {
        type: "heal",
        amount: 40,
      },
    },
    pet_skill: {
      id: "pet_new_skill",
      owner: "pet_skill",
      slot: 4,
      label: "新宠技",
      command: "pet_skill",
      target: {
        isAll: false,
        canTargetAlly: false,
        canTargetEnemy: true,
        requiresSelection: true,
        selfOnly: false,
      },
      effect: {
        type: "damage",
        amountBonus: 8,
      },
    },
    item: {
      id: "item_new_heal",
      owner: "item",
      label: "新道具",
      command: "item",
      target: {
        isAll: false,
        canTargetAlly: true,
        canTargetEnemy: false,
        requiresSelection: true,
        selfOnly: false,
      },
      effect: {
        type: "heal",
        amount: 30,
      },
    },
  };
  if (!templates[kind]) {
    console.error("可用模板: spirit, pet_skill, item");
    process.exit(2);
  }
  console.log(JSON.stringify(templates[kind], null, 2));
}

const args = process.argv.slice(2);
if (args[0] === "--template") {
  printTemplate(args[1]);
  process.exit(0);
}

let catalog;
try {
  catalog = readCatalog();
} catch (error) {
  console.error(`battle action catalog check failed: ${error.message}`);
  process.exit(1);
}

const errors = validateCatalog(catalog);
if (args.includes("--list")) {
  printList(catalog);
}
if (errors.length > 0) {
  console.error("battle action catalog check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}
console.log(`battle action catalog check ready: status=ok actions=${catalog.actions.length} petSkillSlots=${maxPetSkillSlots}`);
