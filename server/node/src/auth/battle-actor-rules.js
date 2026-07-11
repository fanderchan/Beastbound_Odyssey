"use strict";

const PET_ACTOR_KINDS = new Set(["pet", "wild_pet"]);
const ELEMENT_IDS = Object.freeze(["fire", "water", "earth", "wind"]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function uniqueIds(values) {
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const id = String(value || "").trim();
    if (id !== "" && !result.includes(id)) {
      result.push(id);
    }
  }
  return result;
}

function templateElements(template) {
  const source = isRecord(template && template.elements) ? template.elements : {};
  return Object.fromEntries(ELEMENT_IDS.map((elementId) => {
    const value = Number(source[elementId] || 0);
    return [elementId, Number.isFinite(value) ? Math.max(0, Math.min(10, value)) : 0];
  }));
}

function createBattleActorRules({passiveCatalog, templateResolver} = {}) {
  if (!passiveCatalog || typeof passiveCatalog.applyActorPassives !== "function") {
    throw new TypeError("battle actor rules require a passive catalog");
  }
  if (typeof templateResolver !== "function") {
    throw new TypeError("battle actor rules require a pet template resolver");
  }

  function materializeActor(value) {
    const source = isRecord(value) ? structuredClone(value) : {};
    if (!PET_ACTOR_KINDS.has(String(source.kind || ""))) {
      return {actor: source, unknownPassiveIds: []};
    }

    const formId = String(source.formId || source.templateId || source.speciesId || "").trim();
    const templateValue = templateResolver(formId);
    const template = isRecord(templateValue) ? templateValue : {};
    const passiveSkillIds = uniqueIds([
      ...uniqueIds(template.passiveSkillIds),
      ...uniqueIds(source.passiveSkillIds),
    ]);
    const authoritative = {
      ...source,
      formId,
      lineId: String(template.lineId || ""),
      elements: templateElements(template),
      passiveSkillIds,
      // 当前宠物抗性只由服务端模板和被动派生；不继承客户端/旧 actor 提交的结果字段。
      statusResist: {},
      statusImmune: {},
    };
    const applied = passiveCatalog.applyActorPassives(authoritative);
    return {
      actor: applied.actor,
      unknownPassiveIds: uniqueIds(applied.unknownPassiveIds),
    };
  }

  function materializeActors(values) {
    const actors = [];
    const diagnostics = [];
    for (const value of Array.isArray(values) ? values : []) {
      const materialized = materializeActor(value);
      actors.push(materialized.actor);
      if (materialized.unknownPassiveIds.length > 0) {
        diagnostics.push({
          actorId: String(materialized.actor.actorId || ""),
          passiveIds: materialized.unknownPassiveIds,
        });
      }
    }
    return {actors, diagnostics};
  }

  return Object.freeze({materializeActor, materializeActors});
}

module.exports = {createBattleActorRules};
