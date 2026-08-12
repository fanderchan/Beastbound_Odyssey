"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const REPOSITORY_ROOT = path.resolve(__dirname, "../../../..");
const DEFAULT_CATALOG_PATH = path.join(REPOSITORY_ROOT, "client/godot/data/battle_boss_mechanics.json");
const SCHEMA_VERSION = 2;
const MECHANIC_TARGETED_CHARGE = "targeted_charge";
const MECHANIC_TIDE_CORE = "tide_core";
const ALLOWED_MECHANIC_KINDS = new Set([MECHANIC_TARGETED_CHARGE, MECHANIC_TIDE_CORE]);
const ALLOWED_TARGET_KINDS = new Set(["pet", "player"]);

class BattleBossRulesError extends Error {
  constructor(errors) {
    const normalized = (Array.isArray(errors) ? errors : [errors]).map(String).filter(Boolean);
    super(`battle boss rules invalid: ${normalized.join("; ")}`);
    this.name = "BattleBossRulesError";
    this.code = "battle_boss_rules_invalid";
    this.errors = normalized;
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function strictText(value) {
  return typeof value === "string" && value !== "" && value === value.trim() ? value : "";
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function ratio(value, {allowOne = true} = {}) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0 || (allowOne ? numberValue > 1 : numberValue >= 1)) {
    return 0;
  }
  return numberValue;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}

function validateMechanic(raw, index, ids, errors) {
  const fieldPath = `mechanics[${index}]`;
  if (!isRecord(raw)) {
    errors.push(`${fieldPath} must be an object`);
    return;
  }
  const id = strictText(raw.id);
  if (id === "") {
    errors.push(`${fieldPath}.id must be a stable non-empty id`);
  } else if (ids.has(id)) {
    errors.push(`duplicate boss mechanic id ${id}`);
  } else {
    ids.add(id);
  }
  for (const key of ["label", "encounterGroupId", "bossActorSlot"]) {
    if (strictText(raw[key]) === "") {
      errors.push(`${fieldPath}.${key} must be non-empty trimmed text`);
    }
  }
  const kind = strictText(raw.kind);
  if (!ALLOWED_MECHANIC_KINDS.has(kind)) {
    errors.push(`${fieldPath}.kind must be one of ${Array.from(ALLOWED_MECHANIC_KINDS).join(", ")}`);
    return;
  }
  if (kind === MECHANIC_TIDE_CORE) {
    validateTideCoreMechanic(raw, fieldPath, errors);
    return;
  }
  validateTargetedChargeMechanic(raw, fieldPath, errors);
}

function validateTargetedChargeMechanic(raw, fieldPath, errors) {
  for (const key of ["strikeActionId", "strikeLabel", "telegraphText", "commandText", "evadedText", "interruptedText"]) {
    if (strictText(raw[key]) === "") {
      errors.push(`${fieldPath}.${key} must be non-empty trimmed text`);
    }
  }
  const telegraphRound = positiveInteger(raw.telegraphRound);
  const strikeRound = positiveInteger(raw.strikeRound);
  if (telegraphRound === 0) {
    errors.push(`${fieldPath}.telegraphRound must be a positive integer`);
  }
  if (strikeRound !== telegraphRound + 1) {
    errors.push(`${fieldPath}.strikeRound must immediately follow telegraphRound`);
  }
  if (!Array.isArray(raw.targetKindPriority) || raw.targetKindPriority.length < 1) {
    errors.push(`${fieldPath}.targetKindPriority must be a non-empty array`);
  } else {
    const seen = new Set();
    for (const kind of raw.targetKindPriority) {
      if (!ALLOWED_TARGET_KINDS.has(kind)) {
        errors.push(`${fieldPath}.targetKindPriority contains unsupported kind ${String(kind || "")}`);
      } else if (seen.has(kind)) {
        errors.push(`${fieldPath}.targetKindPriority contains duplicate kind ${kind}`);
      } else {
        seen.add(kind);
      }
    }
  }
  if (!String(raw.telegraphText || "").includes("{boss}") || !String(raw.telegraphText || "").includes("{target}")) {
    errors.push(`${fieldPath}.telegraphText must name {boss} and {target}`);
  }
  if (!String(raw.commandText || "").includes("{boss}") || !String(raw.commandText || "").includes("{target}")) {
    errors.push(`${fieldPath}.commandText must name {boss} and {target}`);
  }
}

function validateTideCoreMechanic(raw, fieldPath, errors) {
  for (const key of ["intentActionId", "openText", "commandText", "healText", "brokenText", "ebbEndText"]) {
    if (strictText(raw[key]) === "") {
      errors.push(`${fieldPath}.${key} must be non-empty trimmed text`);
    }
  }
  if (ratio(raw.triggerHpRatio, {allowOne: false}) === 0) {
    errors.push(`${fieldPath}.triggerHpRatio must be greater than 0 and less than 1`);
  }
  if (positiveInteger(raw.resolveAfterRounds) === 0) {
    errors.push(`${fieldPath}.resolveAfterRounds must be a positive integer`);
  }
  if (ratio(raw.healMaxHpRatio) === 0) {
    errors.push(`${fieldPath}.healMaxHpRatio must be greater than 0 and at most 1`);
  }
  if (ratio(raw.ebbDefenseMultiplier, {allowOne: false}) === 0) {
    errors.push(`${fieldPath}.ebbDefenseMultiplier must be greater than 0 and less than 1`);
  }
  if (positiveInteger(raw.ebbRounds) === 0) {
    errors.push(`${fieldPath}.ebbRounds must be a positive integer`);
  }
  for (const key of ["openText", "commandText", "healText", "brokenText"]) {
    const text = String(raw[key] || "");
    if (!text.includes("{boss}") || !text.includes("{target}")) {
      errors.push(`${fieldPath}.${key} must name {boss} and {target}`);
    }
  }
  if (!String(raw.ebbEndText || "").includes("{boss}")) {
    errors.push(`${fieldPath}.ebbEndText must name {boss}`);
  }
}

function createBattleBossRules({document} = {}) {
  const errors = [];
  if (!isRecord(document)) {
    throw new BattleBossRulesError(["document must be an object"]);
  }
  if (document.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  }
  if (!Array.isArray(document.mechanics) || document.mechanics.length < 1) {
    errors.push("mechanics must be a non-empty array");
  }
  const ids = new Set();
  for (const [index, mechanic] of (Array.isArray(document.mechanics) ? document.mechanics : []).entries()) {
    validateMechanic(mechanic, index, ids, errors);
  }
  if (errors.length > 0) {
    throw new BattleBossRulesError(errors);
  }

  const mechanics = document.mechanics.map((mechanic) => deepFreeze(structuredClone(mechanic)));
  const byId = new Map(mechanics.map((mechanic) => [mechanic.id, mechanic]));

  function mechanicForRoom(room) {
    const encounter = isRecord(room && room.encounter) ? room.encounter : {};
    const mechanicId = strictText(encounter.bossMechanicId);
    if (mechanicId === "") {
      return null;
    }
    const mechanic = byId.get(mechanicId);
    if (!mechanic || String(encounter.groupId || "") !== mechanic.encounterGroupId) {
      throw new BattleBossRulesError([`encounter ${String(encounter.groupId || "")} cannot use ${mechanicId}`]);
    }
    return mechanic;
  }

  function bossForMechanic(actors, mechanic, {requireAlive}) {
    const boss = (Array.isArray(actors) ? actors : []).find((actor) => (
      actor && String(actor.slotId || "") === mechanic.bossActorSlot && String(actor.side || "") === "enemy"
    ));
    if (!boss || (requireAlive && Number(boss.hp || 0) <= 0) || String(boss.accountId || "") !== "") {
      throw new BattleBossRulesError([`${mechanic.id} boss actor ${mechanic.bossActorSlot} is missing`]);
    }
    if (
      mechanic.kind === MECHANIC_TARGETED_CHARGE
      && (!Array.isArray(boss.activeSkillIds) || !boss.activeSkillIds.includes(mechanic.strikeActionId))
    ) {
      throw new BattleBossRulesError([`${mechanic.id} boss actor lacks ${mechanic.strikeActionId}`]);
    }
    return boss;
  }

  function initialize(room, actors) {
    const mechanic = mechanicForRoom(room);
    if (!mechanic) {
      return null;
    }
    const boss = bossForMechanic(actors, mechanic, {requireAlive: true});
    if (mechanic.kind === MECHANIC_TIDE_CORE) {
      return {
        mechanicId: mechanic.id,
        kind: mechanic.kind,
        bossActorId: String(boss.actorId || ""),
        phase: "waiting",
        openedRound: 0,
        resolveRound: 0,
        coreActorId: "",
        baseBossDefense: Math.max(1, Math.trunc(Number(boss.defense || 1))),
        ebbRestoreRound: 0,
        completed: false,
        schemaVersion: 2,
      };
    }
    return {
      mechanicId: mechanic.id,
      kind: mechanic.kind,
      bossActorId: String(boss.actorId || ""),
      telegraphRound: mechanic.telegraphRound,
      strikeRound: mechanic.strikeRound,
      completed: false,
      schemaVersion: 2,
    };
  }

  function normalizeState(room, actors, state) {
    const mechanic = mechanicForRoom(room);
    if (!mechanic) {
      return null;
    }
    const boss = bossForMechanic(actors, mechanic, {requireAlive: false});
    const bossActorId = String(boss.actorId || "");
    if (mechanic.kind === MECHANIC_TIDE_CORE) {
      return normalizeTideCoreState(mechanic, boss, bossActorId, actors, state);
    }
    return {
      mechanicId: mechanic.id,
      kind: mechanic.kind,
      bossActorId,
      telegraphRound: mechanic.telegraphRound,
      strikeRound: mechanic.strikeRound,
      completed: Boolean(
        isRecord(state)
        && String(state.mechanicId || "") === mechanic.id
        && String(state.bossActorId || "") === bossActorId
        && state.completed
      ),
      schemaVersion: 2,
    };
  }

  function normalizeIntent(room, actors, state, intent) {
    const mechanic = mechanicForRoom(room);
    if (
      !mechanic
      || !isRecord(state)
      || state.completed
      || String(state.mechanicId || "") !== mechanic.id
      || !isRecord(intent)
      || String(intent.mechanicId || "") !== mechanic.id
      || String(intent.bossActorId || "") !== String(state.bossActorId || "")
    ) {
      return null;
    }
    if (mechanic.kind === MECHANIC_TIDE_CORE) {
      return normalizeTideCoreIntent(room, actors, state, intent, mechanic);
    }
    if (
      Number(room && room.battle && room.battle.round || 0) !== mechanic.strikeRound
      || Number(intent.announcedRound || 0) !== mechanic.telegraphRound
      || Number(intent.resolveRound || 0) !== mechanic.strikeRound
      || String(intent.actionId || "") !== mechanic.strikeActionId
    ) {
      return null;
    }
    const boss = bossForMechanic(actors, mechanic, {requireAlive: false});
    if (Number(boss.hp || 0) <= 0 || Boolean(boss.escaped) || Boolean(boss.captured)) {
      return null;
    }
    const target = (Array.isArray(actors) ? actors : []).find((actor) => (
      actor
      && String(actor.actorId || "") === String(intent.targetActorId || "")
      && String(actor.side || "") !== String(boss.side || "")
      && mechanic.targetKindPriority.includes(String(actor.kind || ""))
      && Number(actor.hp || 0) > 0
      && actor.activeInBattle !== false
      && !Boolean(actor.escaped)
      && !Boolean(actor.captured)
    ));
    if (!target) {
      return null;
    }
    const bossName = String(boss.displayName || boss.username || "守护兽");
    const targetName = String(target.displayName || target.username || "目标");
    return {
      mechanicId: mechanic.id,
      bossActorId: String(boss.actorId || ""),
      bossName,
      targetActorId: String(target.actorId || ""),
      targetAccountId: String(target.accountId || ""),
      targetUsername: String(target.username || ""),
      targetName,
      announcedRound: mechanic.telegraphRound,
      resolveRound: mechanic.strikeRound,
      actionId: mechanic.strikeActionId,
      intentKind: MECHANIC_TARGETED_CHARGE,
      markerStyle: "charge",
      message: formatText(mechanic.commandText, bossName, targetName),
      schemaVersion: 2,
    };
  }

  function commandForRound(room, battle, actor, round) {
    const state = isRecord(battle && battle.bossMechanic) ? battle.bossMechanic : null;
    if (!state || state.completed || String(actor && actor.actorId || "") !== String(state.bossActorId || "")) {
      return null;
    }
    const mechanic = byId.get(String(state.mechanicId || ""));
    if (!mechanic) {
      return null;
    }
    if (mechanic.kind !== MECHANIC_TARGETED_CHARGE) {
      return null;
    }
    if (round === mechanic.telegraphRound) {
      const target = chooseTarget(room, battle, actor, mechanic, round);
      if (!target) {
        return null;
      }
      return bossCommand(room, actor, round, {
        actionId: "boss_charge_telegraph",
        actionKind: "boss_charge_telegraph",
        target,
        targetRule: "boss_marked_target",
        bossMechanicId: mechanic.id,
        resolvesLast: true,
      });
    }
    if (round === mechanic.strikeRound) {
      const intent = isRecord(battle && battle.bossIntent) ? battle.bossIntent : null;
      if (!intent || String(intent.mechanicId || "") !== mechanic.id || Number(intent.resolveRound || 0) !== round) {
        return null;
      }
      return bossCommand(room, actor, round, {
        actionId: mechanic.strikeActionId,
        actionKind: "pet_skill",
        skillName: mechanic.strikeLabel,
        target: {
          actorId: String(intent.targetActorId || ""),
          accountId: String(intent.targetAccountId || ""),
          username: String(intent.targetUsername || ""),
        },
        targetRule: "boss_marked_target",
        bossMechanicId: mechanic.id,
        bossChargeStrike: true,
        disableRetarget: true,
        resolvesLast: true,
      });
    }
    return null;
  }

  function telegraphEvent(room, battle, command, actor, target, round, sequence) {
    const mechanic = byId.get(String(command && command.bossMechanicId || ""));
    if (!mechanic) {
      return null;
    }
    const resolvedTarget = target
      && Number(target.hp || 0) > 0
      && target.activeInBattle !== false
      && !Boolean(target.escaped)
      && !Boolean(target.captured)
      ? target
      : chooseTarget(room, battle, actor, mechanic, round);
    if (!resolvedTarget) {
      finishMechanic(battle);
      return null;
    }
    const bossName = String(actor.displayName || actor.username || "守护兽");
    const targetName = String(resolvedTarget.displayName || resolvedTarget.username || "目标");
    battle.bossIntent = {
      mechanicId: mechanic.id,
      bossActorId: String(actor.actorId || ""),
      bossName,
      targetActorId: String(resolvedTarget.actorId || ""),
      targetAccountId: String(resolvedTarget.accountId || ""),
      targetUsername: String(resolvedTarget.username || ""),
      targetName,
      announcedRound: round,
      resolveRound: mechanic.strikeRound,
      actionId: mechanic.strikeActionId,
      intentKind: MECHANIC_TARGETED_CHARGE,
      markerStyle: "charge",
      message: formatText(mechanic.commandText, bossName, targetName),
      schemaVersion: 2,
    };
    return {
      eventId: `${room.roomId}:r${round}:e${sequence}`,
      eventType: "boss_charge_telegraph",
      round,
      sequence,
      actorAccountId: String(actor.accountId || ""),
      actorUsername: String(actor.username || ""),
      actorId: String(actor.actorId || ""),
      actorKind: String(actor.kind || "wild_pet"),
      targetActorId: String(resolvedTarget.actorId || ""),
      targetKind: String(resolvedTarget.kind || "player"),
      actionId: "boss_charge_telegraph",
      skillId: "",
      bossMechanicId: mechanic.id,
      damage: 0,
      animation: {actor: "skill", targetReaction: "marked", observer: "watch_target"},
      message: formatText(mechanic.telegraphText, bossName, targetName),
      schemaVersion: 2,
    };
  }

  function resolveRoundEnd(room, battle, round, sequence) {
    const state = isRecord(battle && battle.bossMechanic) ? battle.bossMechanic : null;
    if (!state || state.completed) {
      return [];
    }
    const mechanic = byId.get(String(state.mechanicId || ""));
    if (!mechanic || mechanic.kind !== MECHANIC_TIDE_CORE) {
      return [];
    }
    const boss = (Array.isArray(battle && battle.actors) ? battle.actors : []).find((actor) => (
      actor && String(actor.actorId || "") === String(state.bossActorId || "")
    ));
    if (!livingActor(boss)) {
      finishMechanic(battle);
      return [];
    }
    if (String(state.phase || "") === "ebb") {
      if (round < Number(state.ebbRestoreRound || 0)) {
        return [];
      }
      boss.defense = Math.max(1, Math.trunc(Number(state.baseBossDefense || boss.defense || 1)));
      state.phase = "completed";
      state.completed = true;
      return [bossPhaseEvent(room, boss, boss, mechanic, round, sequence, {
        eventType: "boss_tide_ebb_end",
        actionId: "boss_tide_ebb_end",
        message: formatText(mechanic.ebbEndText, actorName(boss, "潮回守护兽"), ""),
        defenseAfter: boss.defense,
      })];
    }
    if (String(state.phase || "") === "open") {
      if (round < Number(state.resolveRound || 0)) {
        return [];
      }
      const core = (Array.isArray(battle.actors) ? battle.actors : []).find((actor) => (
        actor && String(actor.actorId || "") === String(state.coreActorId || "")
      ));
      const bossName = actorName(boss, "潮回守护兽");
      const coreName = actorName(core, "潮核");
      battle.bossIntent = null;
      if (livingActor(core)) {
        const hpBefore = Math.max(0, Math.trunc(Number(boss.hp || 0)));
        const heal = Math.max(1, Math.ceil(Math.max(1, Number(boss.maxHp || 1)) * mechanic.healMaxHpRatio));
        boss.hp = Math.min(Math.max(1, Math.trunc(Number(boss.maxHp || 1))), hpBefore + heal);
        const healed = Math.max(0, boss.hp - hpBefore);
        state.phase = "completed";
        state.completed = true;
        return [bossPhaseEvent(room, boss, boss, mechanic, round, sequence, {
          eventType: "boss_tide_core_heal",
          actionId: mechanic.intentActionId,
          message: formatText(mechanic.healText, bossName, coreName),
          hpBefore,
          hpAfter: boss.hp,
          heal: healed,
          healed,
        })];
      }
      const baseDefense = Math.max(1, Math.trunc(Number(state.baseBossDefense || boss.defense || 1)));
      boss.defense = Math.max(1, Math.floor(baseDefense * mechanic.ebbDefenseMultiplier));
      state.phase = "ebb";
      state.ebbRestoreRound = round + mechanic.ebbRounds;
      return [bossPhaseEvent(room, boss, boss, mechanic, round, sequence, {
        eventType: "boss_tide_core_broken",
        actionId: mechanic.intentActionId,
        message: formatText(mechanic.brokenText, bossName, coreName),
        defenseBefore: baseDefense,
        defenseAfter: boss.defense,
        ebbRestoreRound: state.ebbRestoreRound,
      })];
    }
    const maxHp = Math.max(1, Math.trunc(Number(boss.maxHp || 1)));
    if (Number(boss.hp || 0) / maxHp > mechanic.triggerHpRatio) {
      return [];
    }
    const core = chooseTideCoreTarget(room, battle, boss, mechanic, round);
    if (!core) {
      finishMechanic(battle);
      return [];
    }
    const bossName = actorName(boss, "潮回守护兽");
    const coreName = actorName(core, "潮核");
    state.phase = "open";
    state.openedRound = round;
    state.resolveRound = round + mechanic.resolveAfterRounds;
    state.coreActorId = String(core.actorId || "");
    battle.bossIntent = {
      mechanicId: mechanic.id,
      bossActorId: String(boss.actorId || ""),
      bossName,
      targetActorId: String(core.actorId || ""),
      targetAccountId: "",
      targetUsername: "",
      targetName: coreName,
      announcedRound: round,
      resolveRound: state.resolveRound,
      actionId: mechanic.intentActionId,
      intentKind: MECHANIC_TIDE_CORE,
      markerStyle: "tide_core",
      message: formatText(mechanic.commandText, bossName, coreName),
      schemaVersion: 2,
    };
    return [bossPhaseEvent(room, boss, core, mechanic, round, sequence, {
      eventType: "boss_tide_core_open",
      actionId: mechanic.intentActionId,
      message: formatText(mechanic.openText, bossName, coreName),
      resolveRound: state.resolveRound,
    })];
  }

  function finishMechanic(battle) {
    if (isRecord(battle && battle.bossMechanic)) {
      battle.bossMechanic.completed = true;
    }
    if (battle && typeof battle === "object") {
      battle.bossIntent = null;
    }
  }

  function finishIfBossUnavailable(battle) {
    const state = isRecord(battle && battle.bossMechanic) ? battle.bossMechanic : null;
    if (!state || state.completed) {
      return false;
    }
    const boss = (Array.isArray(battle && battle.actors) ? battle.actors : []).find((actor) => (
      actor && String(actor.actorId || "") === String(state.bossActorId || "")
    ));
    if (boss && Number(boss.hp || 0) > 0 && !Boolean(boss.escaped) && !Boolean(boss.captured)) {
      return false;
    }
    finishMechanic(battle);
    return true;
  }

  function interruptionMessage(command, actor) {
    const mechanic = byId.get(String(command && command.bossMechanicId || ""));
    const actorName = String(actor && (actor.displayName || actor.username) || "守护兽");
    return mechanic ? formatText(mechanic.interruptedText, actorName, "") : `${actorName}的蓄力被打断了。`;
  }

  function evadedMessage(command, actor, intent) {
    const mechanic = byId.get(String(command && command.bossMechanicId || ""));
    const actorName = String(actor && (actor.displayName || actor.username) || "守护兽");
    const targetName = String(intent && intent.targetName || "目标");
    return mechanic ? formatText(mechanic.evadedText, actorName, targetName) : `${targetName}已离场，${actorName}的冲撞落空了。`;
  }

  return deepFreeze({
    schemaVersion: SCHEMA_VERSION,
    mechanicIds: mechanics.map((mechanic) => mechanic.id),
    mechanicById(mechanicId) {
      return byId.get(String(mechanicId || "")) || null;
    },
    initialize,
    normalizeState,
    normalizeIntent,
    commandForRound,
    telegraphEvent,
    resolveRoundEnd,
    finishMechanic,
    finishIfBossUnavailable,
    interruptionMessage,
    evadedMessage,
  });
}

function chooseTarget(room, battle, actor, mechanic, round) {
  const actors = Array.isArray(battle && battle.actors) ? battle.actors : [];
  for (const kind of mechanic.targetKindPriority) {
    const candidates = actors.filter((target) => (
      target
      && String(target.side || "") !== String(actor && actor.side || "")
      && String(target.kind || "") === kind
      && Number(target.hp || 0) > 0
      && target.activeInBattle !== false
      && !Boolean(target.escaped)
      && !Boolean(target.captured)
    )).sort((a, b) => String(a.actorId || "").localeCompare(String(b.actorId || "")));
    if (candidates.length < 1) {
      continue;
    }
    const seed = [room && (room.seed || room.roomId) || "", mechanic.id, round, actor && actor.actorId || "", kind].join(":");
    const index = Number.parseInt(crypto.createHash("sha256").update(seed).digest("hex").slice(0, 8), 16) % candidates.length;
    return candidates[index];
  }
  return null;
}

function normalizeTideCoreState(mechanic, boss, bossActorId, actors, state) {
  const valid = isRecord(state)
    && String(state.mechanicId || "") === mechanic.id
    && String(state.bossActorId || "") === bossActorId
    && String(state.kind || "") === mechanic.kind
    && Number(state.schemaVersion || 0) === SCHEMA_VERSION;
  const phase = valid && ["waiting", "open", "ebb", "completed"].includes(String(state.phase || ""))
    ? String(state.phase || "")
    : "waiting";
  const baseBossDefense = valid
    ? Math.max(1, Math.trunc(Number(state.baseBossDefense || boss.defense || 1)))
    : Math.max(1, Math.trunc(Number(boss.defense || 1)));
  const openedRound = valid ? Math.max(0, Math.trunc(Number(state.openedRound || 0))) : 0;
  const coreActorId = phase === "open" && openedRound > 0 && (Array.isArray(actors) ? actors : []).some((actor) => (
    actor
    && String(actor.actorId || "") === String(state.coreActorId || "")
    && String(actor.actorId || "") !== bossActorId
    && String(actor.side || "") === String(boss.side || "enemy")
    && String(actor.accountId || "") === ""
  )) ? String(state.coreActorId || "") : "";
  const completed = Boolean(valid && state.completed) || phase === "completed";
  const normalizedPhase = completed ? "completed" : (phase === "open" && coreActorId === "" ? "waiting" : phase);
  const resolveRound = normalizedPhase === "open" || normalizedPhase === "ebb"
    ? openedRound + mechanic.resolveAfterRounds
    : 0;
  const ebbRestoreRound = normalizedPhase === "ebb"
    ? resolveRound + mechanic.ebbRounds
    : 0;
  boss.defense = normalizedPhase === "ebb"
    ? Math.max(1, Math.floor(baseBossDefense * mechanic.ebbDefenseMultiplier))
    : baseBossDefense;
  return {
    mechanicId: mechanic.id,
    kind: mechanic.kind,
    bossActorId,
    phase: normalizedPhase,
    openedRound: normalizedPhase === "waiting" ? 0 : openedRound,
    resolveRound,
    coreActorId,
    baseBossDefense,
    ebbRestoreRound,
    completed,
    schemaVersion: 2,
  };
}

function normalizeTideCoreIntent(room, actors, state, intent, mechanic) {
  if (
    String(state.phase || "") !== "open"
    || String(state.coreActorId || "") === ""
    || String(intent.targetActorId || "") !== String(state.coreActorId || "")
    || Number(intent.announcedRound || 0) !== Number(state.openedRound || 0)
    || Number(intent.resolveRound || 0) !== Number(state.resolveRound || 0)
    || Number(room && room.battle && room.battle.round || 0) !== Number(state.resolveRound || 0)
    || String(intent.actionId || "") !== mechanic.intentActionId
  ) {
    return null;
  }
  const boss = bossForTideState(actors, state);
  const target = (Array.isArray(actors) ? actors : []).find((actor) => (
    actor
    && String(actor.actorId || "") === String(state.coreActorId || "")
    && String(actor.side || "") === "enemy"
    && String(actor.actorId || "") !== String(state.bossActorId || "")
    && String(actor.accountId || "") === ""
  ));
  if (!livingActor(boss) || !livingActor(target)) {
    return null;
  }
  const bossName = actorName(boss, "潮回守护兽");
  const targetName = actorName(target, "潮核");
  return {
    mechanicId: mechanic.id,
    bossActorId: String(boss.actorId || ""),
    bossName,
    targetActorId: String(target.actorId || ""),
    targetAccountId: "",
    targetUsername: "",
    targetName,
    announcedRound: Number(state.openedRound || 0),
    resolveRound: Number(state.resolveRound || 0),
    actionId: mechanic.intentActionId,
    intentKind: MECHANIC_TIDE_CORE,
    markerStyle: "tide_core",
    message: formatText(mechanic.commandText, bossName, targetName),
    schemaVersion: 2,
  };
}

function bossForTideState(actors, state) {
  return (Array.isArray(actors) ? actors : []).find((actor) => (
    actor && String(actor.actorId || "") === String(state && state.bossActorId || "")
  )) || null;
}

function chooseTideCoreTarget(room, battle, boss, mechanic, round) {
  const candidates = (Array.isArray(battle && battle.actors) ? battle.actors : []).filter((actor) => (
    actor
    && String(actor.side || "") === String(boss && boss.side || "enemy")
    && String(actor.actorId || "") !== String(boss && boss.actorId || "")
    && String(actor.accountId || "") === ""
    && livingActor(actor)
  )).sort((a, b) => String(a.actorId || "").localeCompare(String(b.actorId || "")));
  if (candidates.length < 1) {
    return null;
  }
  const seed = [room && (room.seed || room.roomId) || "", mechanic.id, round, boss && boss.actorId || "", "tide_core"].join(":");
  const index = Number.parseInt(crypto.createHash("sha256").update(seed).digest("hex").slice(0, 8), 16) % candidates.length;
  return candidates[index];
}

function livingActor(actor) {
  return Boolean(
    actor
    && Number(actor.hp || 0) > 0
    && actor.activeInBattle !== false
    && !Boolean(actor.escaped)
    && !Boolean(actor.captured)
  );
}

function actorName(actor, fallback) {
  return String(actor && (actor.displayName || actor.username) || fallback);
}

function bossPhaseEvent(room, boss, target, mechanic, round, sequence, details) {
  return {
    eventId: `${room.roomId}:r${round}:e${sequence}`,
    eventType: String(details.eventType || "boss_phase"),
    round,
    sequence,
    actorAccountId: "",
    actorUsername: "",
    actorId: String(boss && boss.actorId || ""),
    actorKind: String(boss && boss.kind || "wild_pet"),
    targetActorId: String(target && target.actorId || ""),
    targetKind: String(target && target.kind || "wild_pet"),
    actionId: String(details.actionId || ""),
    skillId: "",
    bossMechanicId: mechanic.id,
    intentKind: MECHANIC_TIDE_CORE,
    markerStyle: "tide_core",
    damage: 0,
    animation: {actor: "skill", targetReaction: "marked", observer: "watch_target"},
    message: String(details.message || ""),
    ...Object.fromEntries(Object.entries(details).filter(([key]) => !["eventType", "actionId", "message"].includes(key))),
    schemaVersion: 2,
  };
}

function bossCommand(room, actor, round, options) {
  const target = options.target || {};
  return {
    commandId: `battle_boss_${round}_${String(actor.actorId || "").replace(/[^a-z0-9_-]+/gi, "_")}`,
    roomId: String(room.roomId || ""),
    round,
    accountId: "",
    username: "",
    actorId: String(actor.actorId || ""),
    actorKind: String(actor.kind || "wild_pet"),
    actionId: options.actionId,
    actionKind: options.actionKind,
    skillId: options.actionKind === "pet_skill" ? options.actionId : "",
    skillName: strictText(options.skillName),
    petId: "",
    itemId: "",
    targetActorId: String(target.actorId || ""),
    targetAccountId: String(target.accountId || ""),
    targetUsername: String(target.username || ""),
    targetRule: options.targetRule,
    bossMechanicId: options.bossMechanicId,
    bossChargeStrike: Boolean(options.bossChargeStrike),
    disableRetarget: Boolean(options.disableRetarget),
    resolvesLast: Boolean(options.resolvesLast),
    submittedAt: "",
    schemaVersion: 1,
  };
}

function formatText(template, bossName, targetName) {
  return String(template || "")
    .replaceAll("{boss}", bossName)
    .replaceAll("{target}", targetName);
}

function loadBattleBossRules({filePath = DEFAULT_CATALOG_PATH} = {}) {
  let document;
  try {
    document = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new BattleBossRulesError([`failed to load ${filePath}: ${error.message}`]);
  }
  return createBattleBossRules({document});
}

module.exports = {
  BattleBossRulesError,
  DEFAULT_CATALOG_PATH,
  createBattleBossRules,
  loadBattleBossRules,
};
