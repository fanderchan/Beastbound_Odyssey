"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  createAuthService,
  createJsonAuthStore,
  createMemoryAuthStore,
  isValidUsername,
} = require("../src/auth-service");
const {createNewPetFactory} = require("../src/auth/new-pet-factory");
const {
  PROFILE_RESOLUTION_AUTHORITY_V1,
  loadPetGrowthCatalog,
} = require("../src/auth/pet-growth-catalog");
const {settlePetGrowthToLevel} = require("../src/auth/pet-growth-runtime");

const repoRoot = path.resolve(__dirname, "../../..");
const DEFAULT_JSON_STORE_PATH = path.resolve(repoRoot, ".run/demo_seed/demo-auth-store.json");
const DEFAULT_REPORT_PATH = "";
const DEFAULT_PASSWORD = "DemoPass123";
const DEFAULT_PREFIX = "demo";
const DEFAULT_MANOR_ID = "firebud_manor";
const BASE_SLOT_COUNT = 15;
const DEMO_PET_FORM_ID = "blue_man_dragon_water10";
const PET_TEMPLATE_PATH = path.resolve(repoRoot, "client/godot/data/pet_templates.json");
const petGrowthCatalog = loadPetGrowthCatalog();
const newPetFactory = createNewPetFactory({growthCatalog: petGrowthCatalog});

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const options = normalizeOptions(args);
  if (options.store === "memory" && fs.existsSync(options.output) && !options.resetOutput) {
    throw new Error("memory fixture output already exists; choose a new output or pass --reset-output");
  }
  if (options.resetOutput && fs.existsSync(options.output)) {
    fs.rmSync(options.output, {force: true});
  }
  const store = createStore(options);
  let currentMs = Date.now();
  const service = createAuthService({
    store,
    now: () => currentMs,
    // 只对全空的 memory/JSON disposable fixture 开启；MySQL 与既有档案在进入服务前已硬拒绝。
    allowFullProfileSave: true,
  });
  const result = seedDemoData(service, options, {
    advanceTo(isoValue) {
      const parsed = Date.parse(String(isoValue || ""));
      if (Number.isFinite(parsed)) {
        currentMs = Math.max(currentMs, parsed + 1000);
      }
    },
  });
  if (options.store === "memory" && options.output) {
    writeJsonFile(options.output, service.snapshot());
    result.output = path.relative(repoRoot, options.output);
  }
  if (options.report) {
    writeJsonFile(options.report, result);
  }
  console.log(JSON.stringify(result, null, 2));
}

function seedDemoData(service, options, time) {
  const specs = demoAccountSpecs(options.prefix);
  assertDisposableSeedStore(service, options);
  const ensured = {};
  for (const spec of specs) {
    ensured[spec.key] = ensureAccount(service, spec, options.password);
    ensured[spec.key].profile = ensureDemoProfile(service, ensured[spec.key], spec);
  }
  const family = ensureFamily(service, ensured.leader, options.familyName);
  const memberJoin = ensureFamilyMember(service, ensured.member, family.family);
  const rivalFamily = ensureFamily(service, ensured.rival, options.rivalFamilyName);
  const manor = options.skipManor
    ? {status: "skipped", reason: "skip_manor"}
    : ensureDemoManor(service, ensured.leader, options.manorId, time);
  const refreshedFamily = currentFamilyFor(service, ensured.leader) || family.family;
  const refreshedRivalFamily = currentFamilyFor(service, ensured.rival) || rivalFamily.family;
  const snapshot = service.snapshot();
  return {
    ok: true,
    store: options.store,
    prefix: options.prefix,
    credentials: specs.map((spec) => ({
      key: spec.key,
      username: spec.username,
      password: options.password,
      displayName: spec.displayName,
    })),
    accounts: specs.map((spec) => {
      const account = ensured[spec.key];
      return {
        key: spec.key,
        username: spec.username,
        action: account.action,
        level: account.profile.level,
        stoneCoins: account.profile.stoneCoins,
        activePetInstanceId: account.profile.activePetInstanceId,
        petCount: account.profile.petCount,
        profileRevision: account.profile.profileRevision,
      };
    }),
    families: [
      familySummary("main", refreshedFamily, family.action),
      familySummary("rival", refreshedRivalFamily, rivalFamily.action),
    ],
    memberJoin: {
      username: ensured.member.spec.username,
      action: memberJoin.action,
      familyId: memberJoin.family ? memberJoin.family.familyId : "",
    },
    manor,
    counts: snapshotCounts(snapshot),
    report: options.report ? path.relative(repoRoot, options.report) : DEFAULT_REPORT_PATH,
    output: options.store === "json" ? path.relative(repoRoot, options.output) : "",
  };
}

function currentFamilyFor(service, ensured) {
  const state = service.getFamilyState(ensured.session.token);
  return state.ok ? state.family : null;
}

function demoAccountSpecs(prefix) {
  return [
    {
      key: "leader",
      username: demoUsername(prefix, "leader"),
      displayName: "演示族长",
      stoneCoins: 1800,
      items: {
        item_meat_small: 12,
        item_heal_single_5: 8,
        item_heal_all_5: 4,
        capture_rope_basic: 8,
        capture_net: 4,
        encounter_stone_low: 3,
      },
      captureTools: {
        capture_rope_basic: 8,
        capture_net: 4,
      },
      player: {
        level: 35,
        hp: 420,
        maxHp: 420,
        attack: 88,
        defense: 48,
        quick: 118,
      },
      pet: {
        instanceId: "pet_demo_main",
        name: "演示战宠",
        level: 32,
      },
    },
    {
      key: "member",
      username: demoUsername(prefix, "member"),
      displayName: "演示队友",
      stoneCoins: 900,
      items: {
        item_meat_small: 8,
        item_heal_single_5: 6,
        capture_rope_basic: 6,
        capture_net: 2,
      },
      captureTools: {
        capture_rope_basic: 6,
        capture_net: 2,
      },
      player: {
        level: 18,
        hp: 220,
        maxHp: 220,
        attack: 42,
        defense: 24,
        quick: 78,
      },
      pet: {
        instanceId: "pet_demo_main",
        name: "跟队蓝人龙",
        level: 16,
      },
    },
    {
      key: "rival",
      username: demoUsername(prefix, "rival"),
      displayName: "演示挑战者",
      stoneCoins: 1200,
      items: {
        item_meat_small: 10,
        item_heal_single_5: 6,
        item_poison_single_5: 2,
        item_cleanse_single_5: 2,
      },
      captureTools: {
        capture_rope_basic: 5,
        capture_net: 2,
      },
      player: {
        level: 28,
        hp: 330,
        maxHp: 330,
        attack: 66,
        defense: 36,
        quick: 96,
      },
      pet: {
        instanceId: "pet_demo_main",
        name: "挑战蓝人龙",
        level: 25,
      },
    },
    {
      key: "guest",
      username: demoUsername(prefix, "guest"),
      displayName: "演示旅人",
      stoneCoins: 260,
      items: {
        item_meat_small: 4,
        item_heal_single_5: 3,
        capture_rope_basic: 3,
      },
      captureTools: {
        capture_rope_basic: 3,
      },
      player: {
        level: 5,
        hp: 145,
        maxHp: 145,
        attack: 24,
        defense: 10,
        quick: 72,
      },
      pet: {
        instanceId: "pet_demo_main",
        name: "新手蓝人龙",
        level: 4,
      },
    },
  ];
}

function ensureAccount(service, spec, password) {
  const registered = service.register({
    username: spec.username,
    password,
    displayName: spec.displayName,
  });
  if (registered.ok) {
    return {spec, action: "created", account: registered.account, session: registered.session};
  }
  const detail = `${registered.code || ""} ${registered.message || ""}`.trim();
  throw new Error(`demo seed refuses existing or unavailable account ${spec.username}: ${detail}`);
}

function ensureDemoProfile(service, ensured, spec) {
  const internal = freshInternalProfileForCreatedAccount(service, ensured);
  const profile = internal.profile;
  profile.player = objectOrEmpty(profile.player);
  profile.player.name = spec.displayName;
  profile.player.level = Math.max(intValue(profile.player.level, 1), spec.player.level);
  profile.player.exp = Math.max(intValue(profile.player.exp, 0), 0);
  profile.player.baseStats = {
    ...objectOrEmpty(profile.player.baseStats),
    maxHp: Math.max(intValue(profile.player.baseStats && profile.player.baseStats.maxHp, 0), spec.player.maxHp),
    attack: Math.max(intValue(profile.player.baseStats && profile.player.baseStats.attack, 0), spec.player.attack),
    defense: Math.max(intValue(profile.player.baseStats && profile.player.baseStats.defense, 0), spec.player.defense),
    quick: Math.max(intValue(profile.player.baseStats && profile.player.baseStats.quick, 0), spec.player.quick),
  };
  profile.player.maxHp = Math.max(intValue(profile.player.maxHp, 0), spec.player.maxHp);
  profile.player.hp = profile.player.maxHp;
  profile.stoneCoins = Math.max(intValue(profile.stoneCoins, 0), spec.stoneCoins);
  profile.backpackSlots = mergeBackpackItems(profile.backpackSlots, spec.items);
  profile.captureTools = mergeCounts(profile.captureTools, spec.captureTools);
  ensureDemoPet(profile, spec.pet);
  const save = service.saveProfile(ensured.session.token, {
    expectedRevision: internal.profileRevision,
    profile,
  });
  if (!save.ok) {
    throw new Error(`save profile ${spec.username} failed: ${save.code || ""} ${save.message || ""}`.trim());
  }
  return {
    level: profile.player.level,
    stoneCoins: profile.stoneCoins,
    activePetInstanceId: String(profile.activePetInstanceId || ""),
    petCount: Array.isArray(profile.petInstances) ? profile.petInstances.length : 0,
    profileRevision: intValue(save.profileSummary && save.profileSummary.profileRevision, 0),
  };
}

function ensureDemoPet(profile, petSpec) {
  if (!Array.isArray(profile.petInstances) || profile.petInstances.length !== 0) {
    throw new Error("disposable demo profile must not contain pets before authority initialization");
  }
  const template = demoPetTemplate(DEMO_PET_FORM_ID);
  const stats = objectOrEmpty(template.baseStats);
  const activeSkillIds = uniqueStrings(["pet_attack", "pet_defend", ...arrayOrEmpty(template.activeSkillIds)]);
  const levelOne = newPetFactory.finalizeLevelOne({
    instanceId: petSpec.instanceId,
    petId: petSpec.instanceId,
    templateId: DEMO_PET_FORM_ID,
    formId: DEMO_PET_FORM_ID,
    speciesId: DEMO_PET_FORM_ID,
    lineId: String(template.lineId || ""),
    lineName: String(template.lineName || ""),
    subtypeId: String(template.subtypeId || ""),
    subtypeName: String(template.subtypeName || ""),
    formName: String(template.formName || petSpec.name),
    name: petSpec.name,
    state: "battle",
    level: 1,
    exp: 0,
    nextExp: demoExpToNextLevel(1),
    hp: Math.max(1, intValue(stats.maxHp, 1)),
    maxHp: Math.max(1, intValue(stats.maxHp, 1)),
    attack: Math.max(1, intValue(stats.attack, 1)),
    defense: Math.max(1, intValue(stats.defense, 1)),
    quick: Math.max(1, intValue(stats.quick ?? stats.agility, 1)),
    elements: clone(objectOrEmpty(template.elements)),
    growthProfileId: String(template.growthProfileId || ""),
    growthSpeciesProfileId: String(template.growthSpeciesProfileId || ""),
    activeSkillIds,
    petSkillSlots: skillSlots(activeSkillIds),
    passiveSkillIds: uniqueStrings(arrayOrEmpty(template.passiveSkillIds)),
    schemaVersion: 1,
  }, {purpose: "demo_seed"});
  if (levelOne.growthKind !== PROFILE_RESOLUTION_AUTHORITY_V1) {
    throw new Error(`disposable demo pet ${DEMO_PET_FORM_ID} must use authority-v1 growth`);
  }
  const resolution = petGrowthCatalog.resolvePetProfile(levelOne.pet);
  if (resolution.kind !== PROFILE_RESOLUTION_AUTHORITY_V1 || !resolution.profile) {
    throw new Error(`disposable demo pet ${DEMO_PET_FORM_ID} growth profile could not be resolved`);
  }
  const targetLevel = Math.max(1, intValue(petSpec.level, 1));
  const pet = settlePetGrowthToLevel(levelOne.pet, resolution.profile, targetLevel).pet;
  pet.name = petSpec.name;
  pet.state = "battle";
  pet.exp = 0;
  pet.nextExp = demoExpToNextLevel(targetLevel);
  pet.hp = pet.maxHp;
  profile.petInstances = [pet];
  profile.activePetInstanceId = pet.instanceId;
  profile.nextPetInstanceSerial = Math.max(intValue(profile.nextPetInstanceSerial, 1), 6);
}

function ensureFamily(service, ensured, familyName) {
  const state = service.getFamilyState(ensured.session.token);
  if (!state.ok) {
    throw new Error(`family state ${ensured.spec.username} failed: ${state.code || ""} ${state.message || ""}`.trim());
  }
  if (state.family) {
    return {action: "already_joined", family: state.family};
  }
  const created = service.createFamily(ensured.session.token, {
    name: familyName,
    notice: "演示服：新手、组队、庄园入口都可从这里走查。",
  });
  if (created.ok) {
    return {action: "created", family: created.family};
  }
  if (created.code === "family_name_exists") {
    const families = service.listFamilies(ensured.session.token);
    const existing = families.ok
      ? families.families.find((family) => String(family.name || "") === familyName)
      : null;
    if (existing) {
      const joined = service.joinFamily(ensured.session.token, {familyId: existing.familyId});
      if (joined.ok) {
        return {action: "joined_existing", family: joined.family};
      }
      throw new Error(`join existing family ${familyName} failed: ${joined.code || ""} ${joined.message || ""}`.trim());
    }
  }
  throw new Error(`create family ${familyName} failed: ${created.code || ""} ${created.message || ""}`.trim());
}

function ensureFamilyMember(service, ensured, family) {
  const state = service.getFamilyState(ensured.session.token);
  if (!state.ok) {
    throw new Error(`member family state ${ensured.spec.username} failed: ${state.code || ""} ${state.message || ""}`.trim());
  }
  if (state.family && state.family.familyId === family.familyId) {
    return {action: "already_joined", family: state.family};
  }
  if (state.family) {
    return {action: "already_in_other_family", family: state.family};
  }
  const joined = service.joinFamily(ensured.session.token, {familyId: family.familyId});
  if (!joined.ok) {
    throw new Error(`join family ${ensured.spec.username} failed: ${joined.code || ""} ${joined.message || ""}`.trim());
  }
  return {action: "joined", family: joined.family};
}

function ensureDemoManor(service, leader, manorId, time) {
  const state = service.getFamilyState(leader.session.token);
  if (!state.ok || !state.family) {
    return {status: "skipped", reason: "family_missing", manorId};
  }
  const existingOwned = Array.isArray(state.manors)
    ? state.manors.find((manor) => String(manor.ownerFamilyId || "") === state.family.familyId)
    : null;
  if (existingOwned) {
    return {
      status: "already_owned",
      manorId: existingOwned.manorId,
      ownerFamilyName: String(existingOwned.ownerFamilyName || ""),
    };
  }
  const declared = service.challengeManor(leader.session.token, {manorId});
  if (!declared.ok) {
    return {
      status: "skipped",
      reason: declared.code || "challenge_failed",
      message: declared.message || "",
      manorId,
    };
  }
  time.advanceTo(declared.war && declared.war.startsAt);
  const resolved = service.resolveManorWar(leader.session.token, {warId: declared.war.warId});
  if (!resolved.ok) {
    return {
      status: "scheduled",
      reason: resolved.code || "resolve_failed",
      message: resolved.message || "",
      manorId,
      warId: declared.war.warId,
      startsAt: declared.war.startsAt,
    };
  }
  return {
    status: "occupied",
    manorId: resolved.manor.manorId,
    ownerFamilyName: resolved.manor.ownerFamilyName,
    warId: resolved.war.warId,
    result: resolved.battle.result,
    challengerPower: resolved.battle.challengerPower,
    defenderPower: resolved.battle.defenderPower,
    peaceEndsAt: resolved.manor.peaceEndsAt,
  };
}

function familySummary(kind, family, action) {
  return {
    kind,
    action,
    familyId: family ? family.familyId : "",
    name: family ? family.name : "",
    leaderUsername: family ? family.leaderUsername : "",
    memberCount: family ? family.memberCount : 0,
    manorIds: family && Array.isArray(family.manorIds) ? family.manorIds : [],
  };
}

function snapshotCounts(snapshot) {
  return {
    accounts: Object.keys(objectOrEmpty(snapshot.accounts)).length,
    profiles: Object.keys(objectOrEmpty(snapshot.profiles)).length,
    families: Object.keys(objectOrEmpty(snapshot.families)).length,
    manors: Object.keys(objectOrEmpty(snapshot.manors)).length,
    manorBattles: Array.isArray(snapshot.manorBattles) ? snapshot.manorBattles.length : 0,
    manorWars: Array.isArray(snapshot.manorWars) ? snapshot.manorWars.length : 0,
  };
}

function assertDisposableSeedStore(service, options) {
  if (!options || !["json", "memory"].includes(options.store)) {
    throw new Error("demo seed only supports disposable memory or JSON stores; MySQL is forbidden");
  }
  const snapshot = service.snapshot();
  const occupiedCollections = [];
  for (const [key, value] of Object.entries(snapshot)) {
    if (key === "schemaVersion") {
      continue;
    }
    if (snapshotValueHasContent(value)) {
      occupiedCollections.push(key);
    }
  }
  if (occupiedCollections.length > 0) {
    throw new Error(
      `demo seed requires an empty disposable store; found ${occupiedCollections.join(",")}. ` +
      "Choose a new output or pass --reset-output for an isolated JSON fixture."
    );
  }
}

function snapshotValueHasContent(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return Number(value || 0) !== 0;
}

function freshInternalProfileForCreatedAccount(service, ensured) {
  if (!ensured || ensured.action !== "created") {
    throw new Error("demo seed refuses reused accounts");
  }
  const snapshot = service.snapshot();
  const accountId = String(ensured.account && ensured.account.accountId || "");
  const binding = objectOrEmpty(objectOrEmpty(snapshot.profileBindings)[accountId]);
  const playerId = String(binding.playerId || "");
  const profileDoc = objectOrEmpty(objectOrEmpty(snapshot.profiles)[playerId]);
  const profile = clone(objectOrEmpty(profileDoc.profile));
  const profileRevision = intValue(binding.profileRevision, -1);
  if (accountId === "" || playerId === "" || profileRevision !== 0 || Object.keys(profile).length === 0) {
    throw new Error("new disposable demo account did not have a pristine revision-zero profile");
  }
  if (
    arrayOrEmpty(profile.petInstances).length > 0
    || arrayOrEmpty(profile.groundPetDrops).length > 0
    || arrayOrEmpty(profile.trainingPartners).length > 0
    || containsPetGrowthPrivateState(profile)
  ) {
    throw new Error("new disposable demo profile unexpectedly contained pet state");
  }
  return {profile, profileRevision};
}

function containsPetGrowthPrivateState(value) {
  if (Array.isArray(value)) {
    return value.some(containsPetGrowthPrivateState);
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  if (
    Object.prototype.hasOwnProperty.call(value, "privateSeed")
    || Object.prototype.hasOwnProperty.call(value, "privateRoll")
    || Object.prototype.hasOwnProperty.call(value, "growthSpeciesSeed")
    || (value.petGrowth && value.petGrowth.private)
  ) {
    return true;
  }
  return Object.values(value).some(containsPetGrowthPrivateState);
}

function demoPetTemplate(formId) {
  const document = JSON.parse(fs.readFileSync(PET_TEMPLATE_PATH, "utf8"));
  const form = arrayOrEmpty(document.forms).find((entry) => String(entry && entry.formId || "") === formId);
  if (!form) {
    throw new Error(`demo pet form ${formId} is missing`);
  }
  const line = arrayOrEmpty(document.lines).find((entry) => String(entry && entry.lineId || "") === String(form.lineId || ""));
  const subtype = arrayOrEmpty(document.subtypes).find((entry) => String(entry && entry.subtypeId || "") === String(form.subtypeId || ""));
  if (!line || !subtype) {
    throw new Error(`demo pet form ${formId} taxonomy is incomplete`);
  }
  const passiveSkillIds = uniqueStrings([
    ...arrayOrEmpty(line.passiveSkillIds),
    String(line.passiveSkillId || ""),
  ]);
  return {
    ...clone(form),
    lineName: String(line.lineName || ""),
    subtypeName: String(subtype.subtypeName || ""),
    activeSkillIds: uniqueStrings(arrayOrEmpty(subtype.activeSkillIds)),
    passiveSkillIds,
  };
}

function skillSlots(skillIds) {
  const slots = uniqueStrings(skillIds).slice(0, 7);
  while (slots.length < 7) {
    slots.push("");
  }
  return slots;
}

function demoExpToNextLevel(level) {
  const safeLevel = Math.max(1, intValue(level, 1));
  const base = (80 + safeLevel * 40) * Math.pow(1.052, safeLevel - 1);
  const highLevelShape = Math.pow(safeLevel, 2.15) * 2.0;
  return Math.max(1, Math.round(base + highLevelShape));
}

function createStore(options) {
  if (options.store === "json") {
    return createJsonAuthStore(options.output);
  }
  return createMemoryAuthStore();
}

function normalizeOptions(args) {
  const store = String(args.store || process.env.BEASTBOUND_DEMO_SEED_STORE || "json").trim().toLowerCase();
  if (!["json", "memory"].includes(store)) {
    throw new Error("--store must be json or memory; MySQL seeding is forbidden.");
  }
  const prefix = normalizePrefix(args.prefix || process.env.BEASTBOUND_DEMO_SEED_PREFIX || DEFAULT_PREFIX);
  const password = String(args.password || process.env.BEASTBOUND_DEMO_SEED_PASSWORD || DEFAULT_PASSWORD);
  if (password.length < 8) {
    throw new Error("Demo password must be at least 8 characters.");
  }
  const output = path.resolve(repoRoot, String(args.output || process.env.BEASTBOUND_DEMO_SEED_OUTPUT || DEFAULT_JSON_STORE_PATH));
  const report = args.report
    ? path.resolve(repoRoot, String(args.report))
    : "";
  return {
    store,
    prefix,
    password,
    output,
    report,
    resetOutput: Boolean(args.resetOutput),
    skipManor: Boolean(args.skipManor),
    manorId: String(args.manor || process.env.BEASTBOUND_DEMO_SEED_MANOR_ID || DEFAULT_MANOR_ID).trim() || DEFAULT_MANOR_ID,
    familyName: String(args.familyName || process.env.BEASTBOUND_DEMO_SEED_FAMILY_NAME || "演示火芽盟").trim(),
    rivalFamilyName: String(args.rivalFamilyName || process.env.BEASTBOUND_DEMO_SEED_RIVAL_FAMILY_NAME || "演示挑战盟").trim(),
  };
}

function normalizePrefix(value) {
  const prefix = String(value || DEFAULT_PREFIX)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 10) || DEFAULT_PREFIX;
  for (const suffix of ["leader", "member", "rival", "guest"]) {
    const username = demoUsername(prefix, suffix);
    if (!isValidUsername(username)) {
      throw new Error(`Invalid demo username after prefix normalization: ${username}`);
    }
  }
  return prefix;
}

function demoUsername(prefix, suffix) {
  const safeSuffix = String(suffix || "").replace(/[^a-z0-9_]/g, "");
  return `${prefix}_${safeSuffix}`.slice(0, 20);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--store") {
      result.store = argv[++index] || "";
    } else if (arg === "--prefix") {
      result.prefix = argv[++index] || "";
    } else if (arg === "--password") {
      result.password = argv[++index] || "";
    } else if (arg === "--output") {
      result.output = argv[++index] || "";
    } else if (arg === "--report") {
      result.report = argv[++index] || "";
    } else if (arg === "--family-name") {
      result.familyName = argv[++index] || "";
    } else if (arg === "--rival-family-name") {
      result.rivalFamilyName = argv[++index] || "";
    } else if (arg === "--manor") {
      result.manor = argv[++index] || "";
    } else if (arg === "--skip-manor") {
      result.skipManor = true;
    } else if (arg === "--reset-output") {
      result.resetOutput = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return result;
}

function mergeBackpackItems(slots, wantedCounts) {
  const counts = {};
  if (Array.isArray(slots)) {
    for (const slot of slots) {
      if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
        continue;
      }
      const itemId = String(slot.itemId || "").trim();
      const count = intValue(slot.count, 0);
      if (itemId && count > 0) {
        counts[itemId] = Math.max(0, counts[itemId] || 0) + count;
      }
    }
  }
  for (const [itemId, count] of Object.entries(objectOrEmpty(wantedCounts))) {
    counts[itemId] = Math.max(intValue(counts[itemId], 0), intValue(count, 0));
  }
  const result = Object.entries(counts)
    .filter(([, count]) => intValue(count, 0) > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemId, count]) => ({itemId, count: intValue(count, 0)}));
  while (result.length < BASE_SLOT_COUNT) {
    result.push({});
  }
  return result;
}

function mergeCounts(value, wantedCounts) {
  const result = {...objectOrEmpty(value)};
  for (const [key, count] of Object.entries(objectOrEmpty(wantedCounts))) {
    result[key] = Math.max(intValue(result[key], 0), intValue(count, 0));
  }
  return result;
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  const result = [];
  for (const value of arrayOrEmpty(values)) {
    const normalized = String(value || "").trim();
    if (normalized !== "" && !result.includes(normalized)) {
      result.push(normalized);
    }
  }
  return result;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function intValue(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? number : fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function printHelp() {
  console.log(`Usage:
  node server/node/scripts/seed-demo-data.js [options]

Options:
  --store json|memory             Disposable fixture store. Defaults to json; MySQL is forbidden.
  --prefix <name>                 Username prefix. Defaults to demo.
  --password <password>           Demo account password. Defaults to DemoPass123.
  --output <path>                 JSON store path or memory snapshot path.
  --report <path>                 Optional result report path.
  --family-name <name>            Main demo family name.
  --rival-family-name <name>      Rival demo family name.
  --manor <manorId>               Manor to occupy when possible.
  --skip-manor                    Do not seed manor occupation.
  --reset-output                  Remove an existing isolated JSON fixture before seeding.
`);
}

main();
