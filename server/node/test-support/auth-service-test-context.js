"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {once} = require("node:events");
const {
  createAuthService: createAuthServiceStrict,
  createMemoryAuthStore,
} = require("../src/auth-service");

// 测试默认放开整档写入闸门，方便用 saveProfile 造档；显式传 allowFullProfileSave: false 可测生产拒绝路径。
function createAuthService(options = {}) {
  return createAuthServiceStrict({"allowFullProfileSave": true, ...options});
}
const {
  createHttpServer,
  createDefaultStore,
  DEFAULT_COMMAND_CATALOG,
} = require("../src/http-server");
const {
  CLIENT_PROTOCOL_HEADER,
  CLIENT_VERSION_HEADER,
  PROTOCOL_VERSION,
  SERVER_VERSION,
} = require("../src/protocol");
const {
  createMysqlAuthStore,
} = require("../src/mysql-store");

function createCountingAuthStore(initialData = null) {
  const store = createMemoryAuthStore(initialData);
  const counts = {
    loads: 0,
    saves: 0,
  };
  return {
    counts,
    load() {
      counts.loads += 1;
      return store.load();
    },
    save(nextData) {
      counts.saves += 1;
      store.save(nextData);
    },
    snapshot() {
      return store.load();
    },
  };
}

function testPasswordHash(password, salt) {
  return crypto.scryptSync(String(password), String(salt), 32).toString("hex");
}

async function withEnv(overrides, fn) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

function battleProfile(name, playerStats, petStats = null) {
  const petId = petStats && petStats.petId ? petStats.petId : "";
  const profile = {
    "player": {
      "name": name,
      "level": Number(playerStats.level || 1),
      "hp": Number(playerStats.hp || playerStats.maxHp || 120),
      "maxHp": Number(playerStats.maxHp || 120),
      "baseStats": {
        "maxHp": Number(playerStats.maxHp || 120),
        "attack": Number(playerStats.attack || 18),
        "defense": Number(playerStats.defense || 6),
        "quick": Number(playerStats.quick || 70),
      },
      "comboRateOverride": playerStats.comboRateOverride,
    },
    "activePetInstanceId": petId,
    "petInstances": [],
  };
  if (petStats) {
    profile.petInstances.push({
      "instanceId": petId,
      "petId": petId,
      "formId": String(petStats.formId || "bui_normal_red_fire10"),
      "name": String(petStats.name || "宠物"),
      "state": "battle",
      "level": Number(petStats.level || 1),
      "hp": Number(petStats.hp || petStats.maxHp || 90),
      "maxHp": Number(petStats.maxHp || 90),
      "attack": Number(petStats.attack || 12),
      "defense": Number(petStats.defense || 6),
      "quick": Number(petStats.quick || 50),
      "activeSkillIds": ["pet_attack", "pet_defend", "pet_bui_charge"],
      "petSkillSlots": ["pet_attack", "pet_defend", "pet_bui_charge", "", "", "", ""],
      "passiveSkillIds": ["test_passive"],
      "comboRateOverride": petStats.comboRateOverride,
    });
  }
  return profile;
}

function profileItemCount(profile, itemId) {
  const slots = Array.isArray(profile && profile.backpackSlots) ? profile.backpackSlots : [];
  return slots.reduce((total, slot) => {
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
      return total;
    }
    if (String(slot.itemId || "") !== itemId) {
      return total;
    }
    return total + Math.max(0, Math.trunc(Number(slot.count || 0)));
  }, 0);
}

function playerRebirthReadyProfile(name) {
  const profile = battleProfile(name, {
    "level": 80,
    "hp": 220,
    "maxHp": 220,
    "attack": 45,
    "defense": 30,
    "quick": 90,
  }, {
    "petId": "rebirth_active_pet",
    "formId": "bui_normal_red_fire10",
    "name": "随行布伊",
    "level": 60,
    "hp": 160,
    "maxHp": 160,
    "attack": 40,
    "defense": 20,
    "quick": 80,
  });
  profile.rebirthQuestCompletions = ["rebirth_1"];
  profile.rebirthTrialProofs = {"shadow_oath_rebirth_guardian": 1};
  profile.backpackSlots = [
    {"itemId": "ring_earth_trial", "count": 1},
    {"itemId": "ring_water_trial", "count": 1},
    {"itemId": "ring_fire_trial", "count": 1},
    {"itemId": "ring_wind_trial", "count": 1},
    ...Array.from({"length": 11}, () => ({})),
  ];
  profile.petInstances.push({
    "instanceId": "rebirth_beast_earth_1",
    "petId": "rebirth_beast_earth_1",
    "formId": "rebirth_beast_earth_lv50",
    "templateId": "rebirth_beast_earth_lv50",
    "name": "地灵转生兽",
    "state": "standby",
    "level": 50,
    "hp": 520,
    "maxHp": 520,
    "attack": 76,
    "defense": 92,
    "quick": 48,
  });
  profile.nextPetInstanceSerial = 10;
  profile.recordPoint = {
    "mapId": "firebud_village_gate",
    "spawnName": "doctor_record",
    "label": "火芽村医旁记录点",
  };
  return profile;
}

function battleProfileWithPets(name, playerStats, pets) {
  const profile = battleProfile(name, playerStats, null);
  profile.activePetInstanceId = "";
  profile.petInstances = pets.map((pet, index) => {
    const petId = String(pet.petId || `pet_${index + 1}`);
    if (pet.state === "battle" && profile.activePetInstanceId === "") {
      profile.activePetInstanceId = petId;
    }
    return {
      "instanceId": petId,
      "petId": petId,
      "formId": String(pet.formId || "bui_normal_red_fire10"),
      "name": String(pet.name || "宠物"),
      "state": String(pet.state || "standby"),
      "level": Number(pet.level || 1),
      "hp": Number(pet.hp || pet.maxHp || 90),
      "maxHp": Number(pet.maxHp || 90),
      "attack": Number(pet.attack || 12),
      "defense": Number(pet.defense || 6),
      "quick": Number(pet.quick || 50),
      "activeSkillIds": ["pet_attack", "pet_defend", "pet_bui_charge"],
      "petSkillSlots": ["pet_attack", "pet_defend", "pet_bui_charge", "", "", "", ""],
      "passiveSkillIds": [],
    };
  });
  if (profile.activePetInstanceId === "" && profile.petInstances.length > 0) {
    profile.activePetInstanceId = String(profile.petInstances[0].instanceId || "");
    profile.petInstances[0].state = "battle";
  }
  return profile;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    "headers": {
      "content-type": "application/json",
      [CLIENT_VERSION_HEADER]: SERVER_VERSION,
      [CLIENT_PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
      ...(options.headers || {}),
    },
  });
  return response.json();
}

function eventStreamUrl(base, token, lastEventSeq = 0) {
  const query = new URLSearchParams({
    clientVersion: SERVER_VERSION,
    clientProtocolVersion: String(PROTOCOL_VERSION),
    token,
  });
  if (lastEventSeq > 0) {
    query.set("lastEventSeq", String(lastEventSeq));
  }
  return `${base}/events?${query.toString()}`;
}

function webSocketOpen(ws) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("websocket open timeout")), 1000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    }, {"once": true});
    ws.addEventListener("error", (event) => {
      clearTimeout(timer);
      reject(new Error(`websocket error ${event.message || ""}`));
    }, {"once": true});
  });
}

async function webSocketDataText(data) {
  if (typeof data === "string") {
    return data;
  }
  if (data && typeof data.arrayBuffer === "function") {
    return Buffer.from(await data.arrayBuffer()).toString("utf8");
  }
  return Buffer.from(data).toString("utf8");
}

function webSocketJsonReader(ws) {
  const queue = [];
  const waiters = [];
  ws.addEventListener("message", async (event) => {
    const data = await webSocketDataText(event.data);
    queue.push(JSON.parse(data));
    flush();
  });
  ws.addEventListener("error", (event) => {
    const error = new Error(`websocket error ${event.message || ""}`);
    while (waiters.length > 0) {
      const waiter = waiters.shift();
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  });
  function next(type) {
    const existingIndex = queue.findIndex((message) => !type || message.type === type);
    if (existingIndex >= 0) {
      const [message] = queue.splice(existingIndex, 1);
      return Promise.resolve(message);
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        type,
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) {
            waiters.splice(index, 1);
          }
          reject(new Error(`websocket message timeout: ${type}`));
        }, 1200),
      };
      waiters.push(waiter);
      flush();
    });
  }
  function flush() {
    for (let waiterIndex = 0; waiterIndex < waiters.length; waiterIndex += 1) {
      const waiter = waiters[waiterIndex];
      const messageIndex = queue.findIndex((message) => !waiter.type || message.type === waiter.type);
      if (messageIndex < 0) {
        continue;
      }
      const [message] = queue.splice(messageIndex, 1);
      waiters.splice(waiterIndex, 1);
      waiterIndex -= 1;
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  }
  return {next};
}

module.exports = {
  assert,
  crypto,
  fs,
  os,
  path,
  test,
  once,
  createAuthService,
  createMemoryAuthStore,
  createHttpServer,
  createDefaultStore,
  DEFAULT_COMMAND_CATALOG,
  CLIENT_PROTOCOL_HEADER,
  CLIENT_VERSION_HEADER,
  PROTOCOL_VERSION,
  SERVER_VERSION,
  createMysqlAuthStore,
  createCountingAuthStore,
  testPasswordHash,
  withEnv,
  battleProfile,
  profileItemCount,
  playerRebirthReadyProfile,
  battleProfileWithPets,
  fetchJson,
  eventStreamUrl,
  webSocketOpen,
  webSocketJsonReader,
};
