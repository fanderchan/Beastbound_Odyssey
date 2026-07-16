"use strict";

const {isDeepStrictEqual} = require("node:util");
const {
  validateEquipmentTransferEnvelopeBatch,
} = require("./equipment-transfer-envelope");

const MAIL_ATTACHMENT_SCHEMA_VERSION = 2;

const MAIL_V1_FIELDS = new Set([
  "mailId",
  "mailKind",
  "senderAccountId",
  "senderUsername",
  "senderDisplayName",
  "recipientAccountId",
  "recipientUsername",
  "recipientDisplayName",
  "title",
  "body",
  "items",
  "currency",
  "currencies",
  "createdAt",
  "readAt",
  "settledAt",
  "schemaVersion",
]);
const MAIL_V2_FIELDS = new Set([
  ...MAIL_V1_FIELDS,
  "equipmentEnvelopes",
]);
MAIL_V2_FIELDS.delete("currencies");

const MAIL_ITEM_FIELDS = new Set(["itemId", "count"]);
const MAIL_UPDATE_FIELDS = new Set([
  "claimedOrdinaryItems",
  "claimedEnvelopeIds",
  "claimCurrency",
]);
const MAIL_CURRENCY_FIELDS = new Set(["stoneCoins", "coins", "diamonds", "diamond"]);
const MAIL_CANONICAL_CURRENCY_IDS = ["stoneCoins", "diamonds"];
const MAIL_ASSET_FIELDS = new Set([
  "items",
  "currency",
  "currencies",
  "equipmentEnvelopes",
  "schemaVersion",
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

function mailSchemaFailure(status, details = {}) {
  if (status === "future") {
    return fail(
      "mail_schema_future",
      "这封邮件来自更高版本，暂不能领取；附件和货币会原样保留，请联系GM处理。",
      details,
    );
  }
  return fail(
    "mail_schema_invalid",
    "这封邮件的数据版本无法识别，暂不能领取；附件和货币会原样保留，请联系GM处理。",
    details,
  );
}

function schemaVersionFor(mail) {
  if (!Object.hasOwn(mail, "schemaVersion")) {
    return {ok: true, version: 1, legacy: true};
  }
  const version = mail.schemaVersion;
  if (!Number.isSafeInteger(version) || version < 1) {
    return mailSchemaFailure("invalid", {schemaVersion: version});
  }
  if (version > MAIL_ATTACHMENT_SCHEMA_VERSION) {
    return mailSchemaFailure("future", {schemaVersion: version});
  }
  return {ok: true, version, legacy: version < MAIL_ATTACHMENT_SCHEMA_VERSION};
}

function equipmentItemPredicate(catalog, options) {
  if (typeof options.isEquipmentItemId === "function") {
    return (itemId) => Boolean(options.isEquipmentItemId(itemId));
  }
  return (itemId) => Boolean(
    catalog
    && catalog.itemById instanceof Map
    && catalog.itemById.has(itemId)
  );
}

function itemExists(catalog, options, itemId) {
  if (typeof options.itemById === "function" && options.itemById(itemId)) {
    return true;
  }
  return Boolean(catalog && catalog.itemById instanceof Map && catalog.itemById.has(itemId));
}

function canonicalItems(value, catalog, options = {}) {
  if (!Array.isArray(value)) {
    return fail(
      "mail_item_invalid",
      "邮件附件档案异常，本次操作已取消；附件和货币会原样保留，请联系GM处理。",
    );
  }
  const counts = new Map();
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      return fail(
        "mail_item_invalid",
        "邮件附件档案异常，本次操作已取消；附件和货币会原样保留，请联系GM处理。",
        {index},
      );
    }
    if (typeof entry.itemId !== "string" || entry.itemId === "" || entry.itemId !== entry.itemId.trim()) {
      return fail(
        "mail_item_invalid",
        "邮件附件档案异常，本次操作已取消；附件和货币会原样保留，请联系GM处理。",
        {index},
      );
    }
    if (!itemExists(catalog, options, entry.itemId)) {
      return fail(
        "mail_item_unknown",
        "邮件含当前版本无法识别的物品，本次操作已取消；附件和货币会原样保留，请联系GM处理。",
        {index, itemId: entry.itemId},
      );
    }
    if (
      Object.keys(entry).some((key) => !MAIL_ITEM_FIELDS.has(key))
      || !Number.isSafeInteger(entry.count)
      || entry.count < 1
    ) {
      return fail(
        "mail_item_invalid",
        "邮件附件档案异常，本次操作已取消；附件和货币会原样保留，请联系GM处理。",
        {index},
      );
    }
    const nextCount = Number(counts.get(entry.itemId) || 0) + entry.count;
    if (!Number.isSafeInteger(nextCount)) {
      return fail(
        "mail_item_invalid",
        "邮件附件数量超出当前版本可安全处理的范围；附件和货币会原样保留，请联系GM处理。",
        {index, itemId: entry.itemId},
      );
    }
    counts.set(entry.itemId, nextCount);
  }
  return {
    ok: true,
    items: Array.from(counts.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([itemId, count]) => ({itemId, count})),
  };
}

function canonicalCurrencyObject(value) {
  if (!isRecord(value)) {
    return fail(
      "mail_currency_invalid",
      "邮件货币档案异常，暂不能领取；附件和货币会原样保留，请联系GM处理。",
    );
  }
  const unknownField = Object.keys(value).sort().find((key) => !MAIL_CURRENCY_FIELDS.has(key));
  if (unknownField) {
    return fail(
      "mail_currency_unknown",
      "邮件含当前版本无法识别的货币，暂不能领取；附件和货币会原样保留，请联系GM处理。",
      {field: unknownField},
    );
  }
  for (const [key, amount] of Object.entries(value)) {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      return fail(
        "mail_currency_invalid",
        "邮件货币档案异常，暂不能领取；附件和货币会原样保留，请联系GM处理。",
        {field: key},
      );
    }
  }
  if (
    (Object.hasOwn(value, "stoneCoins") && Object.hasOwn(value, "coins") && value.stoneCoins !== value.coins)
    || (Object.hasOwn(value, "diamonds") && Object.hasOwn(value, "diamond") && value.diamonds !== value.diamond)
  ) {
    return fail(
      "mail_currency_invalid",
      "邮件货币档案异常，暂不能领取；附件和货币会原样保留，请联系GM处理。",
    );
  }
  const currency = {};
  const stoneCoins = Number(value.stoneCoins ?? value.coins ?? 0);
  const diamonds = Number(value.diamonds ?? value.diamond ?? 0);
  if (stoneCoins > 0) {
    currency.stoneCoins = stoneCoins;
  }
  if (diamonds > 0) {
    currency.diamonds = diamonds;
  }
  return {ok: true, currency};
}

function canonicalCurrency(mail, schemaVersion) {
  const fields = ["currency", "currencies"].filter((field) => Object.hasOwn(mail, field));
  if (schemaVersion >= MAIL_ATTACHMENT_SCHEMA_VERSION && fields.includes("currencies")) {
    return fail(
      "mail_schema_unsupported",
      "这封邮件含当前版本无法安全读取的数据，暂不能领取；附件和货币会原样保留，请联系GM处理。",
      {field: "currencies"},
    );
  }
  const representations = [];
  for (const field of fields) {
    const result = canonicalCurrencyObject(mail[field]);
    if (!result.ok) {
      return result;
    }
    representations.push(result.currency);
  }
  if (representations.length > 1 && representations.some((value) => !isDeepStrictEqual(value, representations[0]))) {
    return fail(
      "mail_currency_invalid",
      "邮件货币档案异常，暂不能领取；附件和货币会原样保留，请联系GM处理。",
    );
  }
  return {ok: true, currency: representations.length > 0 ? representations[0] : {}};
}

function itemCountMap(items) {
  return new Map((Array.isArray(items) ? items : []).map((item) => [item.itemId, item.count]));
}

function envelopeCountMap(envelopes) {
  const counts = new Map();
  for (const envelope of Array.isArray(envelopes) ? envelopes : []) {
    counts.set(envelope.itemId, Number(counts.get(envelope.itemId) || 0) + 1);
  }
  return counts;
}

function equipmentSummaryConflict(items, envelopes, isEquipmentItemId) {
  const itemCounts = itemCountMap(items);
  const envelopeCounts = envelopeCountMap(envelopes);
  const itemIds = new Set([...itemCounts.keys(), ...envelopeCounts.keys()]);
  for (const itemId of Array.from(itemIds).sort()) {
    const summaryCount = Number(itemCounts.get(itemId) || 0);
    const envelopeCount = Number(envelopeCounts.get(itemId) || 0);
    if ((isEquipmentItemId(itemId) && summaryCount !== envelopeCount) || (!isEquipmentItemId(itemId) && envelopeCount !== 0)) {
      return fail(
        "mail_equipment_summary_mismatch",
        "邮件装备摘要与实例信封不一致，本次操作已取消；附件和货币会原样保留，请联系GM处理。",
        {itemId, summaryCount, envelopeCount},
      );
    }
  }
  return null;
}

function canonicalMetadata(mail) {
  const metadata = {};
  for (const [key, value] of Object.entries(mail)) {
    if (!MAIL_ASSET_FIELDS.has(key)) {
      metadata[key] = clone(value);
    }
  }
  return metadata;
}

function readMailAttachmentState(mailValue, equipmentCatalog, options = {}) {
  if (!isRecord(mailValue)) {
    return fail(
      "mail_root_invalid",
      "邮件档案异常，本次操作已取消；附件和货币会原样保留，请联系GM处理。",
    );
  }
  const mail = mailValue;
  const version = schemaVersionFor(mail);
  if (!version.ok) {
    return version;
  }
  const representationField = ["attachments", "itemAmounts"].find((field) => Object.hasOwn(mail, field));
  if (representationField) {
    return fail(
      "mail_representation_conflict",
      "这封邮件含当前版本无法安全读取的附件档案，附件和货币会原样保留，请联系GM处理。",
      {field: representationField},
    );
  }
  const allowedFields = version.version >= MAIL_ATTACHMENT_SCHEMA_VERSION ? MAIL_V2_FIELDS : MAIL_V1_FIELDS;
  const unknownField = Object.keys(mail).sort().find((key) => !allowedFields.has(key));
  if (unknownField) {
    return fail(
      "mail_schema_unsupported",
      "这封邮件含当前版本无法安全读取的数据，暂不能领取；附件和货币会原样保留，请联系GM处理。",
      {field: unknownField},
    );
  }
  if (version.version >= MAIL_ATTACHMENT_SCHEMA_VERSION) {
    for (const field of ["items", "equipmentEnvelopes", "currency"]) {
      if (!Object.hasOwn(mail, field)) {
        return fail(
          "mail_schema_unsupported",
          "这封邮件缺少当前版本必需的附件字段，暂不能领取；附件和货币会原样保留，请联系GM处理。",
          {field},
        );
      }
    }
  }
  const isEquipmentItemId = equipmentItemPredicate(equipmentCatalog, options);
  if (version.version < MAIL_ATTACHMENT_SCHEMA_VERSION && Array.isArray(mail.items)) {
    const unsupported = mail.items.find((entry) => (
      isRecord(entry)
      && typeof entry.itemId === "string"
      && isEquipmentItemId(entry.itemId.trim())
    ));
    if (unsupported) {
      return fail(
        "mail_equipment_transfer_unsupported",
        "旧邮件装备缺少实例信封，暂不能领取；附件和货币会原样保留，请联系GM处理。",
        {itemId: unsupported.itemId.trim()},
      );
    }
  }
  const itemResult = canonicalItems(Object.hasOwn(mail, "items") ? mail.items : [], equipmentCatalog, options);
  if (!itemResult.ok) {
    return itemResult;
  }
  if (version.version < MAIL_ATTACHMENT_SCHEMA_VERSION) {
    const unsupported = itemResult.items.find((item) => isEquipmentItemId(item.itemId));
    if (unsupported) {
      return fail(
        "mail_equipment_transfer_unsupported",
        "旧邮件装备缺少实例信封，暂不能领取；附件和货币会原样保留，请联系GM处理。",
        {itemId: unsupported.itemId},
      );
    }
  }
  const currencyResult = canonicalCurrency(mail, version.version);
  if (!currencyResult.ok) {
    return currencyResult;
  }
  let equipmentEnvelopes = [];
  if (version.version >= MAIL_ATTACHMENT_SCHEMA_VERSION) {
    const envelopeResult = validateEquipmentTransferEnvelopeBatch(
      mail.equipmentEnvelopes,
      equipmentCatalog,
      options.equipmentTransferOptions || {},
    );
    if (!envelopeResult.ok) {
      return envelopeResult;
    }
    equipmentEnvelopes = envelopeResult.envelopes;
    const summaryConflict = equipmentSummaryConflict(itemResult.items, equipmentEnvelopes, isEquipmentItemId);
    if (summaryConflict) {
      return summaryConflict;
    }
  }
  const canonical = {
    ...canonicalMetadata(mail),
    items: itemResult.items,
    equipmentEnvelopes,
    currency: currencyResult.currency,
    schemaVersion: MAIL_ATTACHMENT_SCHEMA_VERSION,
  };
  const ordinaryItems = canonical.items.filter((item) => !isEquipmentItemId(item.itemId));
  const equipmentItems = canonical.items.filter((item) => isEquipmentItemId(item.itemId));
  return {
    ok: true,
    changed: !isDeepStrictEqual(canonical, mail),
    sourceSchemaVersion: version.version,
    mail: canonical,
    items: clone(canonical.items),
    ordinaryItems: clone(ordinaryItems),
    equipmentItems: clone(equipmentItems),
    equipmentEnvelopes: clone(canonical.equipmentEnvelopes),
    currency: clone(canonical.currency),
  };
}

function buildMailAttachmentState(mailValue, equipmentCatalog, options = {}) {
  if (!isRecord(mailValue)) {
    return readMailAttachmentState(mailValue, equipmentCatalog, options);
  }
  const candidate = clone(mailValue);
  candidate.items = Object.hasOwn(candidate, "items") ? candidate.items : [];
  candidate.equipmentEnvelopes = Object.hasOwn(candidate, "equipmentEnvelopes")
    ? candidate.equipmentEnvelopes
    : [];
  candidate.currency = Object.hasOwn(candidate, "currency") ? candidate.currency : {};
  delete candidate.currencies;
  candidate.schemaVersion = MAIL_ATTACHMENT_SCHEMA_VERSION;
  return readMailAttachmentState(candidate, equipmentCatalog, options);
}

function canonicalClaimEnvelopeIds(value) {
  if (!Array.isArray(value)) {
    return fail("mail_claim_invalid", "邮件装备领取选择异常，请刷新邮箱后重试。", {field: "claimedEnvelopeIds"});
  }
  const ids = [];
  const seen = new Set();
  for (const [index, rawId] of value.entries()) {
    if (typeof rawId !== "string" || rawId === "" || rawId !== rawId.trim() || seen.has(rawId)) {
      return fail("mail_claim_invalid", "邮件装备领取选择异常，请刷新邮箱后重试。", {
        field: "claimedEnvelopeIds",
        index,
      });
    }
    seen.add(rawId);
    ids.push(rawId);
  }
  return {ok: true, ids};
}

function subtractCounts(items, removals) {
  const counts = itemCountMap(items);
  for (const removal of removals) {
    const available = Number(counts.get(removal.itemId) || 0);
    if (removal.count > available) {
      return fail(
        "mail_claim_item_not_enough",
        "邮件附件已经变化，请刷新邮箱后重试。",
        {itemId: removal.itemId, required: removal.count, available},
      );
    }
    counts.set(removal.itemId, available - removal.count);
  }
  return {
    ok: true,
    items: Array.from(counts.entries())
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([itemId, count]) => ({itemId, count})),
  };
}

function mergeItems(...groups) {
  const counts = new Map();
  for (const item of groups.flat()) {
    counts.set(item.itemId, Number(counts.get(item.itemId) || 0) + item.count);
  }
  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemId, count]) => ({itemId, count}));
}

function currencyTotal(currency) {
  return MAIL_CANONICAL_CURRENCY_IDS.reduce((total, currencyId) => (
    total + Number(currency && currency[currencyId] || 0)
  ), 0);
}

function updateMailAttachmentState(mailValue, claimValue, equipmentCatalog, options = {}) {
  const current = readMailAttachmentState(mailValue, equipmentCatalog, options);
  if (!current.ok) {
    return current;
  }
  if (!isRecord(claimValue) || Object.keys(claimValue).some((key) => !MAIL_UPDATE_FIELDS.has(key))) {
    return fail("mail_claim_invalid", "邮件领取请求异常，请刷新邮箱后重试。");
  }
  if (Object.hasOwn(claimValue, "claimCurrency") && typeof claimValue.claimCurrency !== "boolean") {
    return fail("mail_claim_invalid", "邮件领取请求异常，请刷新邮箱后重试。", {field: "claimCurrency"});
  }
  const ordinaryResult = canonicalItems(
    Object.hasOwn(claimValue, "claimedOrdinaryItems") ? claimValue.claimedOrdinaryItems : [],
    equipmentCatalog,
    options,
  );
  if (!ordinaryResult.ok) {
    return ordinaryResult;
  }
  const isEquipmentItemId = equipmentItemPredicate(equipmentCatalog, options);
  const mistakenEquipment = ordinaryResult.items.find((item) => isEquipmentItemId(item.itemId));
  if (mistakenEquipment) {
    return fail(
      "mail_claim_equipment_envelope_required",
      "装备附件必须按服务器信封领取，请刷新邮箱后重试。",
      {itemId: mistakenEquipment.itemId},
    );
  }
  const envelopeIds = canonicalClaimEnvelopeIds(
    Object.hasOwn(claimValue, "claimedEnvelopeIds") ? claimValue.claimedEnvelopeIds : [],
  );
  if (!envelopeIds.ok) {
    return envelopeIds;
  }
  const requestedEnvelopeIds = new Set(envelopeIds.ids);
  const currentEnvelopeById = new Map(current.equipmentEnvelopes.map((envelope) => [envelope.envelopeId, envelope]));
  for (const envelopeId of envelopeIds.ids) {
    if (!currentEnvelopeById.has(envelopeId)) {
      return fail(
        "mail_claim_envelope_missing",
        "邮件装备已经变化，请刷新邮箱后重试。",
        {envelopeId},
      );
    }
  }
  const claimedEnvelopes = current.equipmentEnvelopes.filter((envelope) => requestedEnvelopeIds.has(envelope.envelopeId));
  const remainingEnvelopes = current.equipmentEnvelopes.filter((envelope) => !requestedEnvelopeIds.has(envelope.envelopeId));
  const claimedEquipmentItems = Array.from(envelopeCountMap(claimedEnvelopes).entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemId, count]) => ({itemId, count}));
  const remainingItems = subtractCounts(
    current.items,
    mergeItems(ordinaryResult.items, claimedEquipmentItems),
  );
  if (!remainingItems.ok) {
    return remainingItems;
  }
  const claimCurrency = claimValue.claimCurrency === true;
  const claimedCurrency = claimCurrency ? current.currency : {};
  const remainingCurrency = claimCurrency ? {} : current.currency;
  const built = buildMailAttachmentState({
    ...canonicalMetadata(current.mail),
    items: remainingItems.items,
    equipmentEnvelopes: remainingEnvelopes,
    currency: remainingCurrency,
  }, equipmentCatalog, options);
  if (!built.ok) {
    return built;
  }
  const claimedItems = mergeItems(ordinaryResult.items, claimedEquipmentItems);
  const changed = claimedItems.length > 0 || (claimCurrency && currencyTotal(current.currency) > 0);
  return {
    ok: true,
    changed,
    empty: (
      built.items.length === 0
      && built.equipmentEnvelopes.length === 0
      && currencyTotal(built.currency) === 0
    ),
    mail: built.mail,
    claimed: {
      items: claimedItems,
      ordinaryItems: clone(ordinaryResult.items),
      equipmentEnvelopes: clone(claimedEnvelopes),
      currency: clone(claimedCurrency),
      schemaVersion: 1,
    },
    remaining: {
      items: clone(built.items),
      equipmentEnvelopes: clone(built.equipmentEnvelopes),
      currency: clone(built.currency),
      schemaVersion: 1,
    },
  };
}

module.exports = {
  MAIL_ATTACHMENT_SCHEMA_VERSION,
  buildMailAttachmentState,
  readMailAttachmentState,
  updateMailAttachmentState,
};
