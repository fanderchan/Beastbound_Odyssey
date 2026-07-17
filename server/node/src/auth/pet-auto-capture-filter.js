"use strict";

const {MODEL_VERSION} = require("./pet-growth-authority");
const {levelOnePercentiles} = require("./pet-level-one-percentile");

const FILTER_SCHEMA_VERSION = 1;
const ELEMENT_IDS = Object.freeze(["fire", "water", "earth", "wind"]);
const LEVEL_ONE_STAT_KEYS = Object.freeze(["maxHp", "attack", "defense", "quick"]);
const LEVEL_ONE_STAT_LABELS = Object.freeze({
  maxHp: "生命",
  attack: "攻击",
  defense: "防御",
  quick: "敏捷",
});

function isObjectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteInteger(value, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isFinite(value) && Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function safeResolve(resolver, value) {
  try {
    const resolved = resolver(value);
    return isObjectRecord(resolved) ? resolved : null;
  } catch (_error) {
    return null;
  }
}

function reason(code, message) {
  return {code, message};
}

function publicElements(value) {
  const source = isObjectRecord(value) ? value : null;
  return Object.fromEntries(ELEMENT_IDS.map((elementId) => {
    if (!source) {
      return [elementId, null];
    }
    const points = finiteInteger(source[elementId], 0, 10);
    return [elementId, points];
  }));
}

function defaultPolicy() {
  return {
    lineIds: [],
    element: {mode: "any", ids: [], minPoints: 1},
    onlyNewCodexForm: false,
    maxOwnedSameForm: 0,
    levelOneMinimumPercentiles: Object.fromEntries(LEVEL_ONE_STAT_KEYS.map((key) => [key, 0])),
  };
}

function policyForEvaluation(settings) {
  const source = isObjectRecord(settings) && isObjectRecord(settings.filterPolicy)
    ? settings.filterPolicy
    : {};
  const fallback = defaultPolicy();
  const elementSource = isObjectRecord(source.element) ? source.element : {};
  const percentileSource = isObjectRecord(source.levelOneMinimumPercentiles)
    ? source.levelOneMinimumPercentiles
    : {};
  const lineIds = Array.isArray(source.lineIds)
    ? source.lineIds.map(cleanId).filter((lineId, index, all) => lineId !== "" && all.indexOf(lineId) === index)
    : [];
  const elementIds = Array.isArray(elementSource.ids)
    ? elementSource.ids
      .map((value) => cleanId(value).toLowerCase())
      .filter((elementId, index, all) => ELEMENT_IDS.includes(elementId) && all.indexOf(elementId) === index)
    : [];
  const minPoints = finiteInteger(elementSource.minPoints, 1, 10) ?? 1;
  const maxOwnedSameForm = finiteInteger(source.maxOwnedSameForm, 0, 999) ?? 0;
  return {
    lineIds,
    element: {
      mode: elementSource.mode === "all" ? "all" : "any",
      ids: elementIds,
      minPoints,
    },
    onlyNewCodexForm: source.onlyNewCodexForm === true,
    maxOwnedSameForm,
    levelOneMinimumPercentiles: Object.fromEntries(LEVEL_ONE_STAT_KEYS.map((key) => [
      key,
      finiteInteger(percentileSource[key], 0, 100) ?? fallback.levelOneMinimumPercentiles[key],
    ])),
  };
}

function hasDeferredLevelOneChecks(policy) {
  return LEVEL_ONE_STAT_KEYS.some((key) => policy.levelOneMinimumPercentiles[key] > 0);
}

function emptyFacts() {
  return {
    formId: "",
    formName: "",
    lineId: "",
    lineName: "",
    elements: publicElements(null),
    level: null,
    hp: null,
    maxHp: null,
    hpPercent: null,
    isNewCodexForm: null,
    ownedSameFormCount: null,
    pendingSameFormCount: null,
    levelOneFourV: null,
    levelOnePercentiles: null,
    levelOnePercentileProfileId: "",
  };
}

function evaluation(stage, status, matched, reasons, deferredChecks, facts) {
  return {
    schemaVersion: FILTER_SCHEMA_VERSION,
    stage,
    status,
    matched,
    retainPet: true,
    reasons,
    deferredChecks,
    facts,
  };
}

function unavailablePre(code, message, facts = emptyFacts()) {
  return evaluation("pre_capture", "unavailable", false, [reason(code, message)], [], facts);
}

function normalizedSettingsValue(settings, key, fallback) {
  if (!isObjectRecord(settings)) {
    return fallback;
  }
  return settings[key];
}

function targetTextMatches(needle, values) {
  const normalizedNeedle = needle.toLocaleLowerCase("zh-CN");
  return values.some((value) => cleanText(value).toLocaleLowerCase("zh-CN").includes(normalizedNeedle));
}

function copyPreFacts(value) {
  const source = isObjectRecord(value) ? value : {};
  return {
    formId: cleanId(source.formId),
    formName: cleanText(source.formName),
    lineId: cleanId(source.lineId),
    lineName: cleanText(source.lineName),
    elements: publicElements(source.elements),
    level: finiteInteger(source.level, 1),
    hp: finiteInteger(source.hp, 0),
    maxHp: finiteInteger(source.maxHp, 1),
    hpPercent: finiteInteger(source.hpPercent, 0, 100),
    isNewCodexForm: typeof source.isNewCodexForm === "boolean" ? source.isNewCodexForm : null,
    ownedSameFormCount: finiteInteger(source.ownedSameFormCount, 0),
    pendingSameFormCount: finiteInteger(source.pendingSameFormCount, 0),
    levelOneFourV: null,
    levelOnePercentiles: null,
    levelOnePercentileProfileId: "",
  };
}

function createPetAutoCaptureFilter(options = {}) {
  const resolveTemplate = typeof options.resolveTemplate === "function" ? options.resolveTemplate : () => null;
  const resolveLine = typeof options.resolveLine === "function" ? options.resolveLine : () => null;
  const resolveGrowthProfile = typeof options.resolveGrowthProfile === "function"
    ? options.resolveGrowthProfile
    : () => null;

  function evaluatePreCapture({settings, actor, context} = {}) {
    if (normalizedSettingsValue(settings, "enabled", false) !== true) {
      return evaluation(
        "pre_capture",
        "disabled",
        false,
        [reason("auto_capture_disabled", "自动捕捉未开启。")],
        [],
        emptyFacts()
      );
    }
    if (!isObjectRecord(actor)) {
      return unavailablePre("actor_public_facts_unavailable", "目标的公开战斗信息不可用，未执行自动捕捉。");
    }

    // Only these actor fields are public inputs to pre-capture filtering. Do not
    // add candidate, growth or rolled-stat reads here.
    const formId = cleanId(actor.formId);
    const displayName = cleanText(actor.displayName);
    const hp = finiteInteger(actor.hp, 0);
    const maxHp = finiteInteger(actor.maxHp, 1);
    const level = finiteInteger(actor.level, 1);
    const catchable = actor.catchable === true;
    if (formId === "" || hp === null || maxHp === null || level === null) {
      return unavailablePre("actor_public_facts_unavailable", "目标的形态、等级或生命信息不可用，未执行自动捕捉。");
    }

    const template = safeResolve(resolveTemplate, formId);
    if (!template) {
      return unavailablePre("pet_template_unavailable", "服务器找不到目标宠物图鉴，未执行自动捕捉。");
    }
    const lineId = cleanId(template.lineId);
    const line = lineId === "" ? null : safeResolve(resolveLine, lineId);
    const elements = publicElements(template.elements);
    const profileContext = isObjectRecord(context) ? context : {};
    const codexIds = Array.isArray(profileContext.codexCapturedFormIds)
      ? profileContext.codexCapturedFormIds.map(cleanId).filter(Boolean)
      : null;
    const ownedSameFormCount = finiteInteger(profileContext.ownedSameFormCount, 0);
    const pendingSameFormCount = finiteInteger(profileContext.pendingSameFormCount, 0);
    const hpPercent = Math.ceil(hp / maxHp * 100);
    const facts = {
      formId,
      formName: cleanText(template.formName) || cleanText(template.name),
      lineId,
      lineName: line ? (cleanText(line.lineName) || cleanText(line.name)) : "",
      elements,
      level,
      hp,
      maxHp,
      hpPercent,
      isNewCodexForm: codexIds && pendingSameFormCount !== null
        ? !codexIds.includes(formId) && pendingSameFormCount === 0
        : null,
      ownedSameFormCount,
      pendingSameFormCount,
      levelOneFourV: null,
      levelOnePercentiles: null,
      levelOnePercentileProfileId: "",
    };

    if (!catchable) {
      return evaluation("pre_capture", "not_matched", false, [
        reason("actor_not_catchable", "目标当前不可捕捉。"),
      ], [], facts);
    }
    if (hp <= 0 || hp > maxHp || hpPercent < 1 || hpPercent > 100) {
      return evaluation("pre_capture", "not_matched", false, [
        reason("actor_not_alive", "目标当前不能作为自动捕捉对象。"),
      ], [], facts);
    }

    const failures = [];
    const hpThreshold = finiteInteger(normalizedSettingsValue(settings, "hpPercent", 100), 1, 100) ?? 100;
    if (hpPercent > hpThreshold) {
      failures.push(reason("hp_percent_not_matched", `目标生命为 ${hpPercent}%，高于自动捕捉上限 ${hpThreshold}%。`));
    }

    const comparator = normalizedSettingsValue(settings, "levelComparator", "=");
    const targetLevel = finiteInteger(normalizedSettingsValue(settings, "levelValue", 1), 1, 999) ?? 1;
    const levelMatched = comparator === "<"
      ? level < targetLevel
      : (comparator === ">" ? level > targetLevel : level === targetLevel);
    if (!levelMatched) {
      failures.push(reason("level_not_matched", `目标等级 Lv${level} 不符合 ${comparator} Lv${targetLevel}。`));
    }

    const targetMode = normalizedSettingsValue(settings, "targetMode", "all");
    if (targetMode !== "all") {
      const targetFormId = cleanId(normalizedSettingsValue(settings, "targetFormId", ""));
      const manualText = cleanText(normalizedSettingsValue(settings, "targetManualText", ""));
      const formMatched = targetFormId !== "" && targetFormId === formId;
      const manualMatched = manualText !== "" && targetTextMatches(manualText, [
        formId,
        displayName,
        facts.formName,
        cleanText(template.wildName),
        lineId,
        facts.lineName,
        cleanText(template.subtypeName),
      ]);
      if (!formMatched && !manualMatched) {
        failures.push(reason("target_identity_not_matched", "目标形态不在指定图鉴宠物条件内。"));
      }
    }

    const policy = policyForEvaluation(settings);
    if (policy.lineIds.length > 0 && !policy.lineIds.includes(lineId)) {
      failures.push(reason("pet_line_not_matched", "目标所属宠物系别不符合筛选条件。"));
    }

    if (policy.element.ids.length > 0) {
      const publicElementFactsAvailable = policy.element.ids.every((elementId) => elements[elementId] !== null);
      if (!publicElementFactsAvailable) {
        return unavailablePre("pet_element_facts_unavailable", "目标属性点信息不完整，未执行自动捕捉。", facts);
      }
      const elementMatched = policy.element.mode === "all"
        ? policy.element.ids.every((elementId) => elements[elementId] >= policy.element.minPoints)
        : policy.element.ids.some((elementId) => elements[elementId] >= policy.element.minPoints);
      if (!elementMatched) {
        failures.push(reason("pet_element_not_matched", "目标属性点不符合筛选条件。"));
      }
    }

    if (policy.onlyNewCodexForm) {
      if (!codexIds || pendingSameFormCount === null) {
        return unavailablePre("codex_history_unavailable", "图鉴捕捉历史不可用，未执行自动捕捉。", facts);
      }
      if (codexIds.includes(formId) || pendingSameFormCount > 0) {
        failures.push(reason("codex_form_already_captured", "该形态已收入捕捉图鉴或本场已捕获。"));
      }
    }

    if (policy.maxOwnedSameForm > 0) {
      if (ownedSameFormCount === null || pendingSameFormCount === null) {
        return unavailablePre("owned_form_count_unavailable", "同形态持有数量不可用，未执行自动捕捉。", facts);
      }
      if (ownedSameFormCount + pendingSameFormCount >= policy.maxOwnedSameForm) {
        failures.push(reason(
          "owned_same_form_limit_reached",
          `同形态宠物已达到 ${policy.maxOwnedSameForm} 只，本次不自动投网。`
        ));
      }
    }

    if (failures.length > 0) {
      return evaluation("pre_capture", "not_matched", false, failures, [], facts);
    }

    const hasLevelOneRules = hasDeferredLevelOneChecks(policy);
    const deferredChecks = hasLevelOneRules && level === 1 ? ["level_one_four_v_percentiles"] : [];
    return evaluation("pre_capture", "matched", true, [
      reason(
        "pre_capture_public_rules_matched",
        deferredChecks.length > 0
          ? "投网前公开条件已命中；Lv1 四维分位将在抓回后复核。"
          : (hasLevelOneRules && level > 1
            ? `投网前公开条件已命中；目标为 Lv${level}，捕获后默认保留人工判断。`
            : "投网前公开条件已命中。")
      ),
    ], deferredChecks, facts);
  }

  function readLevelOneStats(value) {
    if (!isObjectRecord(value)) {
      return null;
    }
    const stats = {};
    for (const key of LEVEL_ONE_STAT_KEYS) {
      const stat = finiteInteger(value[key], 1, 999999);
      if (stat === null) {
        return null;
      }
      stats[key] = stat;
    }
    return stats;
  }

  function unavailablePost(code, message, facts) {
    return evaluation("post_capture", "unavailable", false, [reason(code, message)], [], facts);
  }

  function evaluatePostCapture({settings, pet, preEvaluation} = {}) {
    const preFacts = copyPreFacts(isObjectRecord(preEvaluation) ? preEvaluation.facts : null);
    if (normalizedSettingsValue(settings, "enabled", false) !== true) {
      return evaluation("post_capture", "disabled", false, [
        reason("auto_capture_disabled", "自动捕捉未开启；宠物已完整保留。"),
      ], [], preFacts);
    }
    if (
      !isObjectRecord(preEvaluation)
      || preEvaluation.stage !== "pre_capture"
      || typeof preEvaluation.matched !== "boolean"
    ) {
      return unavailablePost("pre_capture_evaluation_unavailable", "投网前筛选结果不可用；宠物已保留等待复核。", preFacts);
    }
    if (!preEvaluation.matched) {
      const status = preEvaluation.status === "unavailable" ? "unavailable" : "not_matched";
      return evaluation("post_capture", status, false, [
        reason("pre_capture_rules_not_matched", "投网前公开条件未命中；宠物仍已完整保留。"),
      ], [], preFacts);
    }
    if (!isObjectRecord(pet)) {
      return unavailablePost("level_one_four_v_unavailable", "Lv1 四维不可用；宠物已保留等待人工复核。", preFacts);
    }

    let petFormId;
    let petLevel;
    try {
      petFormId = cleanId(pet.formId);
      petLevel = finiteInteger(pet.level, 1, 140);
    } catch (_error) {
      return unavailablePost("captured_pet_identity_unavailable", "捕获个体的形态或等级无法确认；宠物已保留等待人工复核。", preFacts);
    }
    if (
      petFormId === ""
      || petLevel === null
      || petFormId !== preFacts.formId
      || petLevel !== preFacts.level
    ) {
      return unavailablePost("captured_pet_identity_inconsistent", "战斗目标与捕获个体的形态或等级不一致；宠物已保留等待人工复核。", preFacts);
    }

    const policy = policyForEvaluation(settings);
    if (petLevel > 1) {
      return evaluation("post_capture", "manual_review", true, [
        reason(
          "captured_level_not_one",
          `捕获等级为 Lv${petLevel}，不参与 Lv1 四维自动筛选；宠物已保留，请人工判断。`
        ),
      ], [], preFacts);
    }

    let initialStats;
    let mirroredStats;
    let currentStats;
    let growthModelVersion;
    let growthSpeciesProfileId;
    try {
      // These are the only pet properties this evaluator may read. Hidden
      // growth rolls, seeds and candidate state are intentionally unreachable.
      initialStats = readLevelOneStats(pet.initialStats);
      mirroredStats = readLevelOneStats(pet.growthSpeciesLevel1Stats);
      currentStats = readLevelOneStats({
        maxHp: pet.maxHp,
        attack: pet.attack,
        defense: pet.defense,
        quick: pet.quick,
      });
      growthModelVersion = cleanId(pet.growthModelVersion);
      growthSpeciesProfileId = cleanId(pet.growthSpeciesProfileId);
    } catch (_error) {
      return unavailablePost("level_one_four_v_unavailable", "Lv1 四维不可用；宠物已保留等待人工复核。", preFacts);
    }
    if (!initialStats || !mirroredStats || !currentStats) {
      return unavailablePost("level_one_four_v_unavailable", "Lv1 四维不完整；宠物已保留等待人工复核。", preFacts);
    }
    if (LEVEL_ONE_STAT_KEYS.some((key) => (
      initialStats[key] !== mirroredStats[key] || initialStats[key] !== currentStats[key]
    ))) {
      return unavailablePost("level_one_four_v_inconsistent", "当前四维与两份 Lv1 记录不一致；宠物已保留等待人工复核。", preFacts);
    }

    const profile = safeResolve(resolveGrowthProfile, petFormId);
    if (
      !profile
      || growthModelVersion !== MODEL_VERSION
      || growthSpeciesProfileId === ""
      || growthSpeciesProfileId !== cleanId(profile.profileId)
    ) {
      return unavailablePost("level_one_percentile_profile_unavailable", "物种 Lv1 分位档案无法确认；宠物已保留等待人工复核。", preFacts);
    }
    let percentileFacts;
    try {
      percentileFacts = levelOnePercentiles(profile, initialStats);
    } catch (_error) {
      return unavailablePost("level_one_percentile_unavailable", "Lv1 四维分位暂时无法计算；宠物已保留等待人工复核。", preFacts);
    }
    const facts = {
      ...preFacts,
      levelOneFourV: initialStats,
      levelOnePercentiles: {...percentileFacts.statPercentiles},
      levelOnePercentileProfileId: percentileFacts.profileId,
    };
    const failures = [];
    for (const key of LEVEL_ONE_STAT_KEYS) {
      const value = percentileFacts.statPercentiles[key];
      const minimum = policy.levelOneMinimumPercentiles[key];
      if (minimum > 0 && value < minimum) {
        failures.push(reason(
          `level_one_${key}_percentile_below_min`,
          `Lv1 ${LEVEL_ONE_STAT_LABELS[key]} ${initialStats[key]} 为 ${value.toFixed(1)}% 分位，低于保留门槛 ${minimum}%。`
        ));
      }
    }
    if (failures.length > 0) {
      failures.push(reason("post_capture_public_rules_not_matched", "Lv1 四维分位未全部达标；当前不会自动放生，宠物已完整保留。"));
      return evaluation("post_capture", "not_matched", false, failures, [], facts);
    }
    return evaluation("post_capture", "matched", true, [
      reason("post_capture_public_rules_matched", "Lv1 四维分位达到设置；这不代表隐藏成长，宠物已完整保留。"),
    ], [], facts);
  }

  return Object.freeze({
    evaluatePreCapture,
    evaluatePostCapture,
  });
}

module.exports = {
  FILTER_SCHEMA_VERSION,
  createPetAutoCaptureFilter,
};
