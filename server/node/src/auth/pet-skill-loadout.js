"use strict";

const MAX_PET_SKILL_SLOTS = 7;
const PET_SKILL_OWNER = "pet_skill";

function uniqueIds(value) {
  const result = [];
  for (const item of Array.isArray(value) ? value : []) {
    const id = String(item || "").trim();
    if (id !== "" && !result.includes(id)) {
      result.push(id);
    }
  }
  return result;
}

function petSkillAction(resolveAction, skillId) {
  if (typeof resolveAction !== "function") {
    return null;
  }
  const action = resolveAction(String(skillId || ""));
  return action && typeof action === "object" && !Array.isArray(action) && String(action.owner || "") === PET_SKILL_OWNER
    ? action
    : null;
}

function preferredSlotForAction(action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    return 0;
  }
  const value = Object.prototype.hasOwnProperty.call(action, "preferredSlot")
    ? action.preferredSlot
    : action.slot;
  const slot = Math.trunc(Number(value || 0));
  return Number.isFinite(slot) ? slot : 0;
}

function normalizePetSkillSlots(skillIds, rawSlots, resolveAction, maxSlots = MAX_PET_SKILL_SLOTS) {
  const slotCount = Math.max(1, Math.trunc(Number(maxSlots || MAX_PET_SKILL_SLOTS)));
  const learned = uniqueIds(skillIds).filter((skillId) => petSkillAction(resolveAction, skillId));
  const slots = Array.from({length: slotCount}, () => "");
  const used = new Set();
  const requestedSlots = Array.isArray(rawSlots) ? rawSlots : [];

  for (let index = 0; index < Math.min(slotCount, requestedSlots.length); index += 1) {
    const skillId = String(requestedSlots[index] || "").trim();
    if (
      skillId === ""
      || used.has(skillId)
      || !learned.includes(skillId)
      || !petSkillAction(resolveAction, skillId)
    ) {
      continue;
    }
    slots[index] = skillId;
    used.add(skillId);
  }

  for (const skillId of learned) {
    if (used.has(skillId)) {
      continue;
    }
    const preferredSlot = preferredSlotForAction(petSkillAction(resolveAction, skillId));
    if (preferredSlot >= 1 && preferredSlot <= slotCount && slots[preferredSlot - 1] === "") {
      slots[preferredSlot - 1] = skillId;
      used.add(skillId);
      continue;
    }
    const emptyIndex = slots.findIndex((value) => value === "");
    if (emptyIndex < 0) {
      break;
    }
    slots[emptyIndex] = skillId;
    used.add(skillId);
  }
  return slots;
}

function equippedPetSkillIds(skillIds, rawSlots, resolveAction, maxSlots = MAX_PET_SKILL_SLOTS) {
  return normalizePetSkillSlots(skillIds, rawSlots, resolveAction, maxSlots).filter(Boolean);
}

module.exports = {
  MAX_PET_SKILL_SLOTS,
  equippedPetSkillIds,
  normalizePetSkillSlots,
  preferredSlotForAction,
};
