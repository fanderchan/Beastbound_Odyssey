"use strict";

// Blocking service NPCs are opened from one of their eight adjacent approach
// cells. A wider radius would let clients invoke the service before reaching
// the actual interaction position.
const DEFAULT_MAX_DISTANCE_CELLS = 1;
const REMOTE_STABLE_ABILITY_ID = "remoteStable";
const STABLE_ACTION_IDS = new Set([
  "pet_stable_toggle",
  "pet_batch_store",
]);
const TRAINER_ACTION_ID = "pet_skill_set_slot";

function createPetServiceAccess(options = {}) {
  const resolveMap = typeof options.mapDocumentById === "function"
    ? options.mapDocumentById
    : () => null;
  const positionHasCell = typeof options.playerPositionHasCell === "function"
    ? options.playerPositionHasCell
    : defaultPositionHasCell;
  const maxDistanceCells = positiveInteger(
    options.maxDistanceCells,
    DEFAULT_MAX_DISTANCE_CELLS,
  );

  return Object.freeze({
    authorize(input = {}) {
      return authorizePetServiceAction(input, {
        resolveMap,
        positionHasCell,
        maxDistanceCells,
      });
    },
  });
}

function authorizePetServiceAction(input = {}, dependencies = {}) {
  const action = text(input.action).toLowerCase();
  if (!STABLE_ACTION_IDS.has(action) && action !== TRAINER_ACTION_ID) {
    return allowed("not_required");
  }

  const profile = object(input.profile);
  const position = object(input.position);
  const params = object(input.params);
  const resolveMap = typeof dependencies.resolveMap === "function"
    ? dependencies.resolveMap
    : () => null;
  const positionHasCell = typeof dependencies.positionHasCell === "function"
    ? dependencies.positionHasCell
    : defaultPositionHasCell;
  const maxDistanceCells = positiveInteger(
    dependencies.maxDistanceCells,
    DEFAULT_MAX_DISTANCE_CELLS,
  );

  if (STABLE_ACTION_IDS.has(action)) {
    if (hasUnlockedAbility(profile, REMOTE_STABLE_ABILITY_ID)) {
      return allowed("remote_stable");
    }
    const service = nearbyServicePoint({
      position,
      resolveMap,
      positionHasCell,
      maxDistanceCells,
      matches: stableServicePoint,
    });
    if (service) {
      return allowed("stable_npc", service);
    }
    return denied(
      "pet_stable_access_required",
      "需要学会远程兽栏，或走近可用的兽栏管理员。",
    );
  }

  const trainerId = text(params.trainerId);
  if (trainerId === "") {
    return denied(
      "pet_skill_trainer_required",
      "请在宠技训练师处选择要使用的训练服务。",
    );
  }
  const service = nearbyServicePoint({
    position,
    resolveMap,
    positionHasCell,
    maxDistanceCells,
    matches: (point) => petSkillTrainerPoint(point, trainerId),
  });
  if (!service) {
    return denied(
      "pet_skill_trainer_access_required",
      "距离对应的宠技训练师太远，请走近后再训练。",
    );
  }
  return allowed("pet_skill_trainer", service);
}

function nearbyServicePoint(options = {}) {
  const position = object(options.position);
  const resolveMap = typeof options.resolveMap === "function"
    ? options.resolveMap
    : () => null;
  const positionHasCell = typeof options.positionHasCell === "function"
    ? options.positionHasCell
    : defaultPositionHasCell;
  const matches = typeof options.matches === "function" ? options.matches : () => false;
  if (!positionHasCell(position)) {
    return null;
  }
  if (Boolean(position.moving)) {
    return null;
  }
  const mapId = text(position.mapId);
  const mapDocument = object(resolveMap(mapId));
  if (mapId === "" || text(mapDocument.id) !== mapId) {
    return null;
  }
  const maxDistanceCells = positiveInteger(
    options.maxDistanceCells,
    DEFAULT_MAX_DISTANCE_CELLS,
  );
  let nearest = null;
  for (const point of array(mapDocument.interactionPoints)) {
    if (!point || typeof point !== "object" || Array.isArray(point) || !matches(point)) {
      continue;
    }
    const cell = array(point.cell);
    if (cell.length < 2 || !Number.isFinite(Number(cell[0])) || !Number.isFinite(Number(cell[1]))) {
      continue;
    }
    const distanceCells = chebyshevDistance(
      position.cellX,
      position.cellY,
      cell[0],
      cell[1],
    );
    if (distanceCells > maxDistanceCells || (nearest && nearest.distanceCells <= distanceCells)) {
      continue;
    }
    nearest = {
      mapId,
      interactionId: text(point.id),
      trainerId: text(point.trainerId),
      distanceCells,
    };
  }
  return nearest;
}

function stableServicePoint(point) {
  const kind = text(point && point.kind).toLowerCase();
  const interactionId = text(point && point.id);
  const actionType = text(point && point.actionType).toLowerCase();
  return kind === "npc" && interactionId !== "" && actionType === "stable";
}

function petSkillTrainerPoint(point, trainerId) {
  const kind = text(point && point.kind).toLowerCase();
  const interactionId = text(point && point.id);
  const actionType = text(point && point.actionType).toLowerCase();
  return kind === "npc"
    && interactionId === trainerId
    && text(point && point.trainerId) === trainerId
    && actionType === "pet_skill_trainer";
}

function hasUnlockedAbility(profile, abilityId) {
  const expected = text(abilityId);
  return expected !== "" && array(profile && profile.unlockedAbilities)
    .some((value) => typeof value === "string" && value.trim() === expected);
}

function defaultPositionHasCell(position) {
  if (!position || typeof position !== "object" || Array.isArray(position) || position.hasCell === false) {
    return false;
  }
  return Number.isFinite(Number(position.cellX)) && Number.isFinite(Number(position.cellY));
}

function chebyshevDistance(ax, ay, bx, by) {
  return Math.max(
    Math.abs(Math.trunc(Number(ax)) - Math.trunc(Number(bx))),
    Math.abs(Math.trunc(Number(ay)) - Math.trunc(Number(by))),
  );
}

function allowed(mode, service = null) {
  return {
    ok: true,
    mode: text(mode),
    service: service ? {...service} : null,
    schemaVersion: 1,
  };
}

function denied(code, message) {
  return {
    ok: false,
    code: text(code),
    message: text(message),
    schemaVersion: 1,
  };
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value || "").trim();
}

module.exports = {
  DEFAULT_MAX_DISTANCE_CELLS,
  REMOTE_STABLE_ABILITY_ID,
  authorizePetServiceAction,
  createPetServiceAccess,
};
