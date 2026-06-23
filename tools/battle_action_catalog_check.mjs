#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const catalogPath = path.join(repoRoot, "client/godot/data/battle_actions.json");
const passiveCatalogPath = path.join(repoRoot, "client/godot/data/battle_passive_skills.json");
const petTemplateCatalogPath = path.join(repoRoot, "client/godot/data/pet_templates.json");
const maxPetSkillSlots = 7;
const validOwners = new Set(["player", "spirit", "pet_skill", "item"]);
const validEffectTypes = new Set(["damage", "heal", "poison", "status", "cleanse", "defend", "capture"]);
const validStatusIds = new Set(["poison", "sleep", "confusion", "stone"]);
const validElementIds = new Set(["fire", "water", "earth", "wind"]);
const requiredRuntimeActions = [
  "spirit_grace_5",
  "spirit_moist_5",
  "spirit_moist_6",
  "spirit_poison_5",
  "spirit_poison_mist_5",
  "pet_attack",
  "pet_defend",
  "pet_bui_charge",
  "pet_sleep_powder",
  "pet_confuse_cry",
  "pet_stone_gaze",
  "item_heal_all_5",
  "item_heal_single_5",
  "item_poison_single_5",
  "item_poison_all_5",
  "item_cleanse_single_5",
];

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function readCatalog() {
  return readJson(catalogPath);
}

function readPassiveCatalog() {
  return readJson(passiveCatalogPath);
}

function readPetTemplateCatalog() {
  return readJson(petTemplateCatalogPath);
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
  } else if (!validEffectTypes.has(effect.type)) {
    errors.push(`${name}.effect.type 无效: ${effect.type}`);
  }
  if (["heal", "poison"].includes(effect.type) && typeof effect.amount !== "number") {
    errors.push(`${name}.${effect.type} 必须配置数字 amount`);
  }
  if ("amountBonus" in effect && typeof effect.amountBonus !== "number") {
    errors.push(`${name}.effect.amountBonus 必须是数字`);
  }
  if (["poison", "status"].includes(effect.type)) {
    validateStatusEffect(name, effect, errors);
  }
  if (effect.type === "cleanse") {
    validateCleanseEffect(name, effect, errors);
  }
}

function validateStatusEffect(name, effect, errors) {
  if (!validStatusIds.has(effect.statusId)) {
    errors.push(`${name}.effect.statusId 无效: ${effect.statusId}`);
  }
  if (typeof effect.statusTurns !== "number" || effect.statusTurns <= 0) {
    errors.push(`${name}.effect.statusTurns 必须是正数`);
  }
  if ("statusPotency" in effect && typeof effect.statusPotency !== "number") {
    errors.push(`${name}.effect.statusPotency 必须是数字`);
  }
  if ("statusPotencyRatio" in effect && typeof effect.statusPotencyRatio !== "number") {
    errors.push(`${name}.effect.statusPotencyRatio 必须是数字`);
  }
  if ("statusHitRate" in effect) {
    if (typeof effect.statusHitRate !== "number") {
      errors.push(`${name}.effect.statusHitRate 必须是数字`);
    } else if (effect.statusHitRate < 0 || effect.statusHitRate > 1) {
      errors.push(`${name}.effect.statusHitRate 必须在 0 到 1 之间`);
    }
  }
}

function validateCleanseEffect(name, effect, errors) {
  if (!Array.isArray(effect.statusIds) || effect.statusIds.length === 0) {
    errors.push(`${name}.effect.statusIds 必须是非空数组`);
    return;
  }
  for (const statusId of effect.statusIds) {
    if (!validStatusIds.has(statusId)) {
      errors.push(`${name}.effect.statusIds 包含无效状态: ${statusId}`);
    }
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

function validatePassiveCatalog(catalog) {
  const errors = [];
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    return ["battle_passive_skills.json 必须是 JSON 对象"];
  }
  if (catalog.schemaVersion !== 1) {
    errors.push("battle_passive_skills.json schemaVersion 当前必须是 1");
  }
  if (!Array.isArray(catalog.passives) || catalog.passives.length === 0) {
    errors.push("passives 不能为空");
    return errors;
  }

  const ids = new Set();
  catalog.passives.forEach((passive, index) => {
    if (!passive || typeof passive !== "object" || Array.isArray(passive)) {
      errors.push(`passives[${index}] 不是对象`);
      return;
    }
    const name = passive.id || `passives[${index}]`;
    if (!passive.id || typeof passive.id !== "string") {
      errors.push(`${name}.id 不能为空`);
    } else if (ids.has(passive.id)) {
      errors.push(`passive id 重复: ${passive.id}`);
    } else {
      ids.add(passive.id);
    }
    if (!passive.label || typeof passive.label !== "string") {
      errors.push(`${name}.label 不能为空`);
    }
    if (!passive.description || typeof passive.description !== "string") {
      errors.push(`${name}.description 不能为空`);
    }
    validatePassiveEffect(name, passive.effect, errors);
  });

  for (const requiredPassiveId of ["bui_resistant_skin", "wuli_hard_shell", "stone_immunity"]) {
    if (!ids.has(requiredPassiveId)) {
      errors.push(`缺少当前战斗需要的被动: ${requiredPassiveId}`);
    }
  }
  return errors;
}

function validatePassiveEffect(name, effect, errors) {
  if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
    errors.push(`${name}.effect 必须是对象`);
    return;
  }
  if ("statusImmune" in effect) {
    if (!Array.isArray(effect.statusImmune)) {
      errors.push(`${name}.effect.statusImmune 必须是数组`);
    } else {
      for (const statusId of effect.statusImmune) {
        if (!validStatusIds.has(statusId)) {
          errors.push(`${name}.effect.statusImmune 包含无效状态: ${statusId}`);
        }
      }
    }
  }
  if ("statusResist" in effect) {
    if (!effect.statusResist || typeof effect.statusResist !== "object" || Array.isArray(effect.statusResist)) {
      errors.push(`${name}.effect.statusResist 必须是对象`);
    } else {
      for (const [statusId, value] of Object.entries(effect.statusResist)) {
        if (statusId !== "all" && !validStatusIds.has(statusId)) {
          errors.push(`${name}.effect.statusResist 包含无效状态: ${statusId}`);
        }
        if (typeof value !== "number" || value < 0 || value > 1) {
          errors.push(`${name}.effect.statusResist.${statusId} 必须是 0 到 1 之间的数字`);
        }
      }
    }
  }
  if ("type" in effect) {
    if (effect.type !== "element_scaled_status_resist") {
      errors.push(`${name}.effect.type 无效: ${effect.type}`);
    } else {
      validateElementScaledStatusResist(name, effect, errors);
    }
  }
}

function validateElementScaledStatusResist(name, effect, errors) {
  if (typeof effect.scalePerPoint !== "number" || effect.scalePerPoint < 0 || effect.scalePerPoint > 1) {
    errors.push(`${name}.effect.scalePerPoint 必须是 0 到 1 之间的数字`);
  }
  if (effect.immuneAtOrAbove !== undefined && typeof effect.immuneAtOrAbove !== "number") {
    errors.push(`${name}.effect.immuneAtOrAbove 必须是数字`);
  }
  if (!effect.mapping || typeof effect.mapping !== "object" || Array.isArray(effect.mapping)) {
    errors.push(`${name}.effect.mapping 必须是对象`);
    return;
  }
  for (const [elementId, statusId] of Object.entries(effect.mapping)) {
    if (!validElementIds.has(elementId)) {
      errors.push(`${name}.effect.mapping 包含无效属性: ${elementId}`);
    }
    if (!validStatusIds.has(statusId)) {
      errors.push(`${name}.effect.mapping.${elementId} 包含无效状态: ${statusId}`);
    }
  }
}

function validatePetTemplateCatalog(catalog, actionCatalog, passiveCatalog) {
  const errors = [];
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    return ["pet_templates.json 必须是 JSON 对象"];
  }
  if (catalog.schemaVersion !== 1) {
    errors.push("pet_templates.json schemaVersion 当前必须是 1");
  }
  if (!Array.isArray(catalog.lines) || catalog.lines.length === 0) {
    errors.push("pet_templates.json lines 必须是非空数组");
  }
  if (!Array.isArray(catalog.subtypes) || catalog.subtypes.length === 0) {
    errors.push("pet_templates.json subtypes 必须是非空数组");
  }
  if (!Array.isArray(catalog.forms) || catalog.forms.length === 0) {
    errors.push("pet_templates.json forms 必须是非空数组");
  }
  if (errors.length > 0) {
    return errors;
  }

  const actionIds = new Set(actionCatalog.actions.map((action) => action.id));
  const passiveIds = new Set(passiveCatalog.passives.map((passive) => passive.id));
  const lineIds = new Set();
  const subtypeLineById = new Map();
  const formIds = new Set();

  catalog.lines.forEach((line, index) => {
    const name = line?.lineId || `lines[${index}]`;
    if (!line || typeof line !== "object" || Array.isArray(line)) {
      errors.push(`lines[${index}] 不是对象`);
      return;
    }
    if (!line.lineId || typeof line.lineId !== "string") {
      errors.push(`${name}.lineId 不能为空`);
    } else if (lineIds.has(line.lineId)) {
      errors.push(`lineId 重复: ${line.lineId}`);
    } else {
      lineIds.add(line.lineId);
    }
    if (!line.lineName || typeof line.lineName !== "string") {
      errors.push(`${name}.lineName 不能为空`);
    }
    if (!line.passiveSkillId || typeof line.passiveSkillId !== "string") {
      errors.push(`${name}.passiveSkillId 不能为空`);
    } else if (!passiveIds.has(line.passiveSkillId)) {
      errors.push(`${name}.passiveSkillId 不存在: ${line.passiveSkillId}`);
    }
    for (const forbiddenKey of ["passiveSkillIds", "allowedPassiveSkillIds", "passivePoolIds"]) {
      if (forbiddenKey in line) {
        errors.push(`${name} 不允许使用 ${forbiddenKey}；种系必须只有一个 passiveSkillId`);
      }
    }
  });

  catalog.subtypes.forEach((subtype, index) => {
    const name = subtype?.subtypeId || `subtypes[${index}]`;
    if (!subtype || typeof subtype !== "object" || Array.isArray(subtype)) {
      errors.push(`subtypes[${index}] 不是对象`);
      return;
    }
    if (!subtype.subtypeId || typeof subtype.subtypeId !== "string") {
      errors.push(`${name}.subtypeId 不能为空`);
    } else if (subtypeLineById.has(subtype.subtypeId)) {
      errors.push(`subtypeId 重复: ${subtype.subtypeId}`);
    } else {
      subtypeLineById.set(subtype.subtypeId, subtype.lineId);
    }
    if (!subtype.subtypeName || typeof subtype.subtypeName !== "string") {
      errors.push(`${name}.subtypeName 不能为空`);
    }
    if (!lineIds.has(subtype.lineId)) {
      errors.push(`${name}.lineId 不存在: ${subtype.lineId}`);
    }
    if (!Array.isArray(subtype.activeSkillIds) || subtype.activeSkillIds.length === 0) {
      errors.push(`${name}.activeSkillIds 必须是非空数组`);
    } else {
      for (const actionId of subtype.activeSkillIds) {
        if (!actionIds.has(actionId)) {
          errors.push(`${name}.activeSkillIds 包含不存在的动作: ${actionId}`);
        }
      }
    }
  });

  catalog.forms.forEach((form, index) => {
    const name = form?.formId || `forms[${index}]`;
    if (!form || typeof form !== "object" || Array.isArray(form)) {
      errors.push(`forms[${index}] 不是对象`);
      return;
    }
    if (!form.formId || typeof form.formId !== "string") {
      errors.push(`${name}.formId 不能为空`);
    } else if (formIds.has(form.formId)) {
      errors.push(`formId 重复: ${form.formId}`);
    } else {
      formIds.add(form.formId);
    }
    if (!form.formName || typeof form.formName !== "string") {
      errors.push(`${name}.formName 不能为空`);
    }
    if (!lineIds.has(form.lineId)) {
      errors.push(`${name}.lineId 不存在: ${form.lineId}`);
    }
    if (!subtypeLineById.has(form.subtypeId)) {
      errors.push(`${name}.subtypeId 不存在: ${form.subtypeId}`);
    } else if (subtypeLineById.get(form.subtypeId) !== form.lineId) {
      errors.push(`${name}.subtypeId 所属种系和 form.lineId 不一致`);
    }
    validateElements(name, form.elements, errors);
    validateBaseStats(name, form.baseStats, errors);
    for (const forbiddenKey of ["passiveSkillIds", "extraPassiveSkillIds", "allowedPassiveSkillIds"]) {
      if (forbiddenKey in form) {
        errors.push(`${name} 不允许使用 ${forbiddenKey}；形态不能追加或替换种系被动`);
      }
    }
  });
  return errors;
}

function validateElements(name, elements, errors) {
  if (!elements || typeof elements !== "object" || Array.isArray(elements)) {
    errors.push(`${name}.elements 必须是对象`);
    return;
  }
  let total = 0;
  for (const elementId of validElementIds) {
    const value = elements[elementId];
    if (typeof value !== "number") {
      errors.push(`${name}.elements.${elementId} 必须是数字`);
      continue;
    }
    if (value < 0 || value > 10) {
      errors.push(`${name}.elements.${elementId} 必须在 0 到 10 之间`);
    }
    total += value;
  }
  if (total !== 10) {
    errors.push(`${name}.elements 四系合计必须为 10，当前为 ${total}`);
  }
}

function validateBaseStats(name, baseStats, errors) {
  if (!baseStats || typeof baseStats !== "object" || Array.isArray(baseStats)) {
    errors.push(`${name}.baseStats 必须是对象`);
    return;
  }
  for (const key of ["maxHp", "attack", "defense", "agility"]) {
    if (typeof baseStats[key] !== "number" || baseStats[key] <= 0) {
      errors.push(`${name}.baseStats.${key} 必须是大于 0 的数字`);
    }
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
let passiveCatalog;
let petTemplateCatalog;
try {
  catalog = readCatalog();
  passiveCatalog = readPassiveCatalog();
  petTemplateCatalog = readPetTemplateCatalog();
} catch (error) {
  console.error(`battle action catalog check failed: ${error.message}`);
  process.exit(1);
}

const errors = [
  ...validateCatalog(catalog),
  ...validatePassiveCatalog(passiveCatalog),
  ...validatePetTemplateCatalog(petTemplateCatalog, catalog, passiveCatalog),
];
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
console.log(`battle action catalog check ready: status=ok actions=${catalog.actions.length} passives=${passiveCatalog.passives.length} petForms=${petTemplateCatalog.forms.length} petSkillSlots=${maxPetSkillSlots}`);
