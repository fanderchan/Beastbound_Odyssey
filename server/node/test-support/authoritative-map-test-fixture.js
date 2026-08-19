"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MAP_DATA_DIR = path.resolve(__dirname, "../../..", "client/godot/data");
const mapCache = new Map();

function loadAuthoritativeMap(mapId) {
  const expectedMapId = String(mapId || "").trim();
  if (expectedMapId === "") {
    throw new TypeError("authoritative map id is required");
  }
  if (mapCache.has(expectedMapId)) {
    return mapCache.get(expectedMapId);
  }
  const matches = [];
  for (const fileName of fs.readdirSync(MAP_DATA_DIR).sort()) {
    if (!fileName.endsWith("_map.json")) {
      continue;
    }
    const document = JSON.parse(fs.readFileSync(path.join(MAP_DATA_DIR, fileName), "utf8"));
    if (String(document && document.id || "").trim() === expectedMapId) {
      matches.push(document);
    }
  }
  if (matches.length !== 1) {
    throw new Error(`expected one authoritative map for ${expectedMapId}, found ${matches.length}`);
  }
  const document = deepFreeze(matches[0]);
  mapCache.set(expectedMapId, document);
  return document;
}

function authoritativeInteractionPoint(mapDocument, interactionId, expected = {}) {
  const map = requireMapDocument(mapDocument);
  const pointId = String(interactionId || "").trim();
  const matches = array(map.interactionPoints).filter((point) => (
    point
    && typeof point === "object"
    && !Array.isArray(point)
    && String(point.id || "").trim() === pointId
  ));
  if (pointId === "" || matches.length !== 1) {
    throw new Error(`expected one ${pointId || "<empty>"} interaction on ${map.id}`);
  }
  const point = matches[0];
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (String(point[field] || "") !== String(expectedValue)) {
      throw new Error(`${map.id}.${pointId}.${field} does not match the authoritative fixture contract`);
    }
  }
  requireCell(point.cell, `${map.id}.${pointId}.cell`);
  return point;
}

function authoritativeSpawnCell(mapDocument, spawnName = "default") {
  const map = requireMapDocument(mapDocument);
  const named = map.spawnPoints && typeof map.spawnPoints === "object" && !Array.isArray(map.spawnPoints)
    ? map.spawnPoints[String(spawnName || "")]
    : null;
  const cell = Array.isArray(named) ? named : map.spawnCell;
  requireCell(cell, `${map.id}.spawnPoints.${spawnName}`);
  if (!isStandableCell(map, cell)) {
    throw new Error(`${map.id}.${spawnName} is not standable`);
  }
  return frozenCell(cell);
}

function standableCellAtDistance(mapDocument, originCell, distance) {
  const map = requireMapDocument(mapDocument);
  const origin = requireCell(originCell, `${map.id}.originCell`);
  const expectedDistance = Math.trunc(Number(distance));
  if (expectedDistance < 1) {
    throw new TypeError("standable cell distance must be positive");
  }
  const [width, height] = mapGridSize(map);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cell = [x, y];
      if (chebyshevDistance(cell, origin) === expectedDistance && isStandableCell(map, cell)) {
        return frozenCell(cell);
      }
    }
  }
  throw new Error(`${map.id} has no standable cell at distance ${expectedDistance}`);
}

function standableCellFarFrom(mapDocument, originCells, minimumDistance) {
  const map = requireMapDocument(mapDocument);
  const origins = array(originCells).map((cell, index) => requireCell(cell, `${map.id}.originCells[${index}]`));
  const minimum = Math.trunc(Number(minimumDistance));
  if (origins.length < 1 || minimum < 1) {
    throw new TypeError("far standable cell requires origins and a positive minimum distance");
  }
  const [width, height] = mapGridSize(map);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cell = [x, y];
      if (
        origins.every((origin) => chebyshevDistance(cell, origin) >= minimum)
        && isStandableCell(map, cell)
      ) {
        return frozenCell(cell);
      }
    }
  }
  throw new Error(`${map.id} has no standable cell at least ${minimum} cells away`);
}

function blockedInteractionStep(mapDocument, interactionId) {
  const map = requireMapDocument(mapDocument);
  const point = authoritativeInteractionPoint(map, interactionId);
  if (!interactionPointBlocksMovement(point)) {
    throw new Error(`${map.id}.${interactionId} is not an authoritative blocker`);
  }
  const target = requireCell(point.cell, `${map.id}.${interactionId}.cell`);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const source = [target[0] + dx, target[1] + dy];
    if (isStandableCell(map, source)) {
      return Object.freeze({
        mapId: String(map.id),
        interactionId: String(point.id),
        fromCell: frozenCell(source),
        toCell: frozenCell(target),
      });
    }
  }
  throw new Error(`${map.id}.${interactionId} has no standable cardinal approach cell`);
}

function isStandableCell(mapDocument, cell) {
  const map = requireMapDocument(mapDocument);
  const normalized = requireCell(cell, `${map.id}.cell`);
  const [width, height] = mapGridSize(map);
  if (normalized[0] < 0 || normalized[1] < 0 || normalized[0] >= width || normalized[1] >= height) {
    return false;
  }
  if (array(map.blockedCells).some((blocked) => sameCell(blocked, normalized))) {
    return false;
  }
  return !array(map.interactionPoints).some((point) => (
    point
    && typeof point === "object"
    && !Array.isArray(point)
    && sameCell(point.cell, normalized)
    && interactionPointBlocksMovement(point)
  ));
}

function interactionPointBlocksMovement(point) {
  if (point && Object.prototype.hasOwnProperty.call(point, "blocksMovement")) {
    return Boolean(point.blocksMovement);
  }
  return String(point && point.movementCollision || "overlap").trim().toLowerCase() === "block";
}

function chebyshevDistance(left, right) {
  return Math.max(Math.abs(left[0] - right[0]), Math.abs(left[1] - right[1]));
}

function sameCell(left, right) {
  return Array.isArray(left)
    && left.length >= 2
    && Math.trunc(Number(left[0])) === right[0]
    && Math.trunc(Number(left[1])) === right[1];
}

function mapGridSize(mapDocument) {
  const grid = requireCell(mapDocument.gridSize, `${mapDocument.id}.gridSize`);
  if (grid[0] < 1 || grid[1] < 1) {
    throw new Error(`${mapDocument.id}.gridSize must be positive`);
  }
  return grid;
}

function requireMapDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || String(value.id || "").trim() === "") {
    throw new TypeError("authoritative map document is required");
  }
  return value;
}

function requireCell(value, label) {
  if (
    !Array.isArray(value)
    || value.length < 2
    || !Number.isFinite(Number(value[0]))
    || !Number.isFinite(Number(value[1]))
  ) {
    throw new TypeError(`${label} must be a numeric cell`);
  }
  return [Math.trunc(Number(value[0])), Math.trunc(Number(value[1]))];
}

function frozenCell(value) {
  return Object.freeze(requireCell(value, "cell"));
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

module.exports = {
  loadAuthoritativeMap,
  authoritativeInteractionPoint,
  authoritativeSpawnCell,
  standableCellAtDistance,
  standableCellFarFrom,
  blockedInteractionStep,
  isStandableCell,
};
