"use strict";

const {
  publicEquipmentTransferSummary,
  validateEquipmentTransferEnvelope,
} = require("./equipment-transfer-envelope");

const MARKET_LISTING_SCHEMA_VERSION = 2;
const MARKET_LISTING_LEGACY_SCHEMA_VERSION = 1;
const MARKET_MAX_LISTINGS = 120;
const MARKET_MAX_LISTINGS_PER_SELLER = 20;
const MARKET_DEFAULT_MAX_COUNT = 999;
const MARKET_DEFAULT_MAX_UNIT_PRICE = 999999999;
const MARKET_DEFAULT_CURRENCIES = Object.freeze(["stoneCoins", "diamonds"]);

const MARKET_LISTING_V1_FIELDS = new Set([
  "listingId",
  "sellerAccountId",
  "itemId",
  "count",
  "unitPrice",
  "currency",
  "createdAt",
  "schemaVersion",
]);
const MARKET_LISTING_LEGACY_FIELDS = new Set(
  Array.from(MARKET_LISTING_V1_FIELDS).filter((field) => field !== "schemaVersion"),
);
const MARKET_LISTING_V2_FIELDS = new Set([
  ...MARKET_LISTING_V1_FIELDS,
  "equipmentEnvelope",
]);
const MARKET_EQUIPMENT_BUILD_FIELDS = new Set([
  "listingId",
  "sellerAccountId",
  "itemId",
  "count",
  "unitPrice",
  "currency",
  "createdAt",
]);

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function clone(value) {
  return structuredClone(value);
}

function fail(code, message, details = {}) {
  return {ok: false, code, message, ...details};
}

function exactFields(value, fields) {
  return isRecord(value)
    && Object.keys(value).length === fields.size
    && Object.keys(value).every((key) => fields.has(key));
}

function sortedFieldDifference(value, expectedFields) {
  const actual = new Set(isRecord(value) ? Object.keys(value) : []);
  return {
    missingFields: Array.from(expectedFields).filter((key) => !actual.has(key)).sort(),
    unknownFields: Array.from(actual).filter((key) => !expectedFields.has(key)).sort(),
  };
}

function positiveInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function listingConfig(catalog, options = {}) {
  const currencies = Array.isArray(options.currencies) && options.currencies.length > 0
    ? options.currencies.map((value) => String(value || "").trim()).filter(Boolean)
    : MARKET_DEFAULT_CURRENCIES;
  const currencySet = new Set(currencies);
  return {
    itemById: typeof options.itemById === "function"
      ? options.itemById
      : (itemId) => (catalog && catalog.itemById instanceof Map ? catalog.itemById.get(itemId) || null : null),
    isEquipmentItemId: typeof options.isEquipmentItemId === "function"
      ? options.isEquipmentItemId
      : (itemId) => Boolean(catalog && catalog.itemById instanceof Map && catalog.itemById.has(itemId)),
    maxCount: positiveInteger(options.maxCount, MARKET_DEFAULT_MAX_COUNT),
    maxUnitPrice: positiveInteger(options.maxUnitPrice, MARKET_DEFAULT_MAX_UNIT_PRICE),
    currencies: currencySet,
    equipmentTransferOptions: isRecord(options.equipmentTransferOptions)
      ? options.equipmentTransferOptions
      : {},
  };
}

function listingSchema(value) {
  if (!Object.hasOwn(value, "schemaVersion")) {
    return {ok: true, version: MARKET_LISTING_LEGACY_SCHEMA_VERSION, legacy: true};
  }
  const version = value.schemaVersion;
  if (!Number.isSafeInteger(version) || version < MARKET_LISTING_LEGACY_SCHEMA_VERSION) {
    return fail(
      "market_listing_schema_invalid",
      "这条挂单的数据版本无法识别，暂不能操作；挂单和货币会原样保留，请联系GM处理。",
      {schemaVersion: version},
    );
  }
  if (version > MARKET_LISTING_SCHEMA_VERSION) {
    return fail(
      "market_listing_schema_future",
      "这条挂单来自更高版本，暂不能操作；挂单和货币会原样保留，请联系GM处理。",
      {schemaVersion: version},
    );
  }
  return {ok: true, version, legacy: false};
}

function listingShapeFailure(value, fields, schemaVersion) {
  return fail(
    "market_listing_schema_unsupported",
    "这条挂单含当前版本无法安全读取的数据，暂不能操作；挂单和货币会原样保留，请联系GM处理。",
    {schemaVersion, ...sortedFieldDifference(value, fields)},
  );
}

function listingIdentityFailure(field) {
  return fail(
    "market_listing_asset_invalid",
    "这条挂单的物品或价格档案异常，暂不能操作；挂单和货币会原样保留，请联系GM处理。",
    {field},
  );
}

function validateListingBase(value, config) {
  const listingId = value.listingId;
  if (
    typeof listingId !== "string"
    || listingId === ""
    || listingId !== listingId.trim()
    || listingId.length > 96
  ) {
    return listingIdentityFailure("listingId");
  }
  const sellerAccountId = value.sellerAccountId;
  if (
    typeof sellerAccountId !== "string"
    || sellerAccountId === ""
    || sellerAccountId !== sellerAccountId.trim()
    || sellerAccountId.length > 80
  ) {
    return listingIdentityFailure("sellerAccountId");
  }
  const itemId = value.itemId;
  if (
    typeof itemId !== "string"
    || itemId === ""
    || itemId !== itemId.trim()
    || itemId.length > 96
  ) {
    return listingIdentityFailure("itemId");
  }
  if (!config.itemById(itemId)) {
    return fail(
      "market_item_unknown",
      "这条挂单含当前版本无法识别的物品，暂不能操作；挂单和货币会原样保留，请联系GM处理。",
      {itemId},
    );
  }
  if (!Number.isSafeInteger(value.count) || value.count < 1 || value.count > config.maxCount) {
    return listingIdentityFailure("count");
  }
  if (!Number.isSafeInteger(value.unitPrice) || value.unitPrice < 1 || value.unitPrice > config.maxUnitPrice) {
    return listingIdentityFailure("unitPrice");
  }
  if (typeof value.currency !== "string" || !config.currencies.has(value.currency)) {
    return listingIdentityFailure("currency");
  }
  if (
    typeof value.createdAt !== "string"
    || value.createdAt === ""
    || value.createdAt !== value.createdAt.trim()
    || value.createdAt.length > 40
  ) {
    return listingIdentityFailure("createdAt");
  }
  return {
    ok: true,
    listing: {
      listingId,
      sellerAccountId,
      itemId,
      count: value.count,
      unitPrice: value.unitPrice,
      currency: value.currency,
      createdAt: value.createdAt,
    },
    isEquipment: Boolean(config.isEquipmentItemId(itemId)),
  };
}

function readMarketListing(value, equipmentCatalog, options = {}) {
  if (!isRecord(value)) {
    return fail(
      "market_listing_invalid",
      "这条挂单的数据格式异常，暂不能操作；挂单和货币会原样保留，请联系GM处理。",
    );
  }
  const raw = value;
  const schema = listingSchema(raw);
  if (!schema.ok) {
    return schema;
  }
  const config = listingConfig(equipmentCatalog, options);
  const rawItemId = typeof raw.itemId === "string" ? raw.itemId.trim() : "";
  if (rawItemId !== "" && !config.itemById(rawItemId)) {
    return fail(
      "market_item_unknown",
      "这条挂单含当前版本无法识别的物品，暂不能操作；挂单和货币会原样保留，请联系GM处理。",
      {itemId: rawItemId},
    );
  }
  const expectedFields = schema.legacy
    ? MARKET_LISTING_LEGACY_FIELDS
    : (schema.version === MARKET_LISTING_LEGACY_SCHEMA_VERSION
      ? MARKET_LISTING_V1_FIELDS
      : MARKET_LISTING_V2_FIELDS);
  if (!exactFields(raw, expectedFields)) {
    return listingShapeFailure(raw, expectedFields, schema.version);
  }
  const base = validateListingBase(raw, config);
  if (!base.ok) {
    return base;
  }
  if (schema.version === MARKET_LISTING_LEGACY_SCHEMA_VERSION) {
    if (base.isEquipment) {
      return fail(
        "market_equipment_transfer_unsupported",
        "旧装备挂单缺少实例信封，暂不能操作；挂单和货币会原样保留，请联系GM处理。",
        {itemId: base.listing.itemId},
      );
    }
    const listing = {...base.listing, schemaVersion: MARKET_LISTING_LEGACY_SCHEMA_VERSION};
    return {
      ok: true,
      changed: schema.legacy,
      sourceSchemaVersion: MARKET_LISTING_LEGACY_SCHEMA_VERSION,
      legacy: schema.legacy,
      kind: "ordinary",
      isEquipment: false,
      equipmentEnvelope: null,
      listing,
    };
  }
  if (!base.isEquipment) {
    return fail(
      "market_equipment_envelope_unexpected",
      "普通物品挂单不能携带装备实例信封；挂单和货币会原样保留，请联系GM处理。",
      {itemId: base.listing.itemId},
    );
  }
  if (base.listing.count !== 1) {
    return fail(
      "market_equipment_count_invalid",
      "装备挂单每次只能托管一个具体实例；挂单和货币会原样保留，请联系GM处理。",
      {itemId: base.listing.itemId, count: base.listing.count},
    );
  }
  const envelope = validateEquipmentTransferEnvelope(
    raw.equipmentEnvelope,
    equipmentCatalog,
    config.equipmentTransferOptions,
  );
  if (!envelope.ok) {
    return envelope;
  }
  if (envelope.envelope.itemId !== base.listing.itemId) {
    return fail(
      "market_equipment_envelope_item_mismatch",
      "装备挂单与托管信封的物品身份不一致；挂单和货币会原样保留，请联系GM处理。",
      {itemId: base.listing.itemId, envelopeItemId: envelope.envelope.itemId},
    );
  }
  const listing = {
    ...base.listing,
    equipmentEnvelope: envelope.envelope,
    schemaVersion: MARKET_LISTING_SCHEMA_VERSION,
  };
  return {
    ok: true,
    changed: false,
    sourceSchemaVersion: MARKET_LISTING_SCHEMA_VERSION,
    legacy: false,
    kind: "equipment",
    isEquipment: true,
    equipmentEnvelope: envelope.envelope,
    stateFingerprint: envelope.stateFingerprint,
    listing,
  };
}

function buildEquipmentMarketListing(baseValue, envelopeValue, equipmentCatalog, options = {}) {
  if (!isRecord(baseValue) || !exactFields(baseValue, MARKET_EQUIPMENT_BUILD_FIELDS)) {
    return listingShapeFailure(baseValue, MARKET_EQUIPMENT_BUILD_FIELDS, MARKET_LISTING_SCHEMA_VERSION);
  }
  return readMarketListing({
    ...clone(baseValue),
    equipmentEnvelope: clone(envelopeValue),
    schemaVersion: MARKET_LISTING_SCHEMA_VERSION,
  }, equipmentCatalog, options);
}

function auditMarketListingBook(value, equipmentCatalog, options = {}) {
  if (!isRecord(value)) {
    return fail(
      "market_listing_book_invalid",
      "交易所挂单容器异常，暂不能操作；全部挂单会原样保留，请联系GM处理。",
    );
  }
  const listings = [];
  const listingById = Object.create(null);
  const firstListingIdByEnvelopeId = new Map();
  for (const listingKey of Object.keys(value).sort()) {
    const read = readMarketListing(value[listingKey], equipmentCatalog, options);
    if (!read.ok) {
      return {...read, listingKey};
    }
    if (read.listing.listingId !== listingKey) {
      return fail(
        "market_listing_identity_conflict",
        "交易所挂单索引与挂单身份不一致，暂不能操作；全部挂单会原样保留，请联系GM处理。",
        {listingKey, listingId: read.listing.listingId},
      );
    }
    if (read.equipmentEnvelope) {
      const envelopeId = read.equipmentEnvelope.envelopeId;
      if (firstListingIdByEnvelopeId.has(envelopeId)) {
        return fail(
          "market_equipment_envelope_duplicate",
          "交易所存在重复的装备托管信封，暂不能操作；全部挂单会原样保留，请联系GM处理。",
          {
            envelopeId,
            firstListingId: firstListingIdByEnvelopeId.get(envelopeId),
            listingId: read.listing.listingId,
          },
        );
      }
      firstListingIdByEnvelopeId.set(envelopeId, read.listing.listingId);
    }
    listings.push(read.listing);
    listingById[read.listing.listingId] = read.listing;
  }
  return {
    ok: true,
    listings,
    listingById,
    equipmentEnvelopeIds: Array.from(firstListingIdByEnvelopeId.keys()).sort(),
  };
}

function publicMarketListingFacts(value, equipmentCatalog, options = {}) {
  const read = readMarketListing(value, equipmentCatalog, options);
  if (!read.ok) {
    return read;
  }
  return {
    ok: true,
    kind: read.kind,
    isEquipment: read.isEquipment,
    equipmentEnvelope: read.equipmentEnvelope
      ? publicEquipmentTransferSummary(
        read.equipmentEnvelope,
        equipmentCatalog,
        listingConfig(equipmentCatalog, options).equipmentTransferOptions,
      )
      : null,
  };
}

module.exports = {
  MARKET_LISTING_SCHEMA_VERSION,
  MARKET_MAX_LISTINGS,
  MARKET_MAX_LISTINGS_PER_SELLER,
  auditMarketListingBook,
  buildEquipmentMarketListing,
  publicMarketListingFacts,
  readMarketListing,
};
