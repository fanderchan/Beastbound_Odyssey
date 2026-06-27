extends RefCounted

const BalanceCatalogModel := preload("res://scripts/progression/balance_catalog_model.gd")
const BackpackModel := preload("res://scripts/progression/backpack_model.gd")

const DATA_PATH := "res://data/item_shops.json"
const DEFAULT_SHOP_ID := "firebud_item_shop"
const CURRENCY_STONE_COINS := "stoneCoins"
const CURRENCY_DIAMONDS := "diamonds"
static var data_cache_loaded: bool = false
static var data_cache: Dictionary = {}


static func shops() -> Array[Dictionary]:
	var parsed := _data()
	var raw_shops = parsed.get("shops", [])
	var result: Array[Dictionary] = []
	if raw_shops is Array:
		for value in raw_shops:
			if value is Dictionary and str((value as Dictionary).get("id", "")) != "":
				result.append(value as Dictionary)
	return result


static func shop_for_id(shop_id: String) -> Dictionary:
	for shop in shops():
		if str(shop.get("id", "")) == shop_id:
			return shop
	return {}


static func label_for(shop_id: String) -> String:
	var shop := shop_for_id(shop_id)
	return str(shop.get("label", "道具店")) if not shop.is_empty() else "道具店"


static func currency_for(shop_id: String) -> String:
	var shop := shop_for_id(shop_id)
	var raw_currency := str(shop.get("currency", CURRENCY_STONE_COINS))
	if raw_currency == CURRENCY_DIAMONDS or raw_currency == "diamond":
		return CURRENCY_DIAMONDS
	return CURRENCY_STONE_COINS


static func currency_label_for(shop_id: String) -> String:
	return currency_label(currency_for(shop_id))


static func currency_label(currency: String) -> String:
	match currency:
		CURRENCY_DIAMONDS:
			return "钻石"
	return "石币"


static func entries_for(shop_id: String) -> Array[Dictionary]:
	var shop := shop_for_id(shop_id)
	var raw_entries = shop.get("items", [])
	var result: Array[Dictionary] = []
	if raw_entries is Array:
		for value in raw_entries:
			if not (value is Dictionary):
				continue
			var entry := value as Dictionary
			var item_id := str(entry.get("itemId", ""))
			if item_id == "" or BackpackModel.item_for_id(item_id).is_empty():
				continue
			result.append(entry)
	return result


static func entry_for(shop_id: String, item_id: String) -> Dictionary:
	for entry in entries_for(shop_id):
		if str(entry.get("itemId", "")) == item_id:
			return entry
	return {}


static func buyable_entries_for(shop_id: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for entry in entries_for(shop_id):
		if is_buyable(shop_id, str(entry.get("itemId", ""))):
			result.append(entry)
	return result


static func is_buyable(shop_id: String, item_id: String) -> bool:
	var entry := entry_for(shop_id, item_id)
	return not entry.is_empty() and bool(entry.get("buyable", true)) and buy_price_for(shop_id, item_id) > 0


static func is_sellable(shop_id: String, item_id: String) -> bool:
	var entry := entry_for(shop_id, item_id)
	if entry.is_empty():
		return false
	return bool(entry.get("sellable", true)) and sell_price_for(shop_id, item_id) > 0


static func buy_price_for(shop_id: String, item_id: String) -> int:
	var entry := entry_for(shop_id, item_id)
	if entry.is_empty():
		return 0
	return maxi(0, int(entry.get("buyPrice", 0)))


static func sell_price_for(shop_id: String, item_id: String) -> int:
	var entry := entry_for(shop_id, item_id)
	if entry.is_empty():
		return 0
	if entry.has("sellPrice"):
		return maxi(0, int(entry.get("sellPrice", 0)))
	var buy_price := buy_price_for(shop_id, item_id)
	var sell_rate := BalanceCatalogModel.default_shop_sell_rate(0.5)
	return maxi(1, int(floor(float(buy_price) * sell_rate))) if buy_price > 0 else 0


static func price_line_for(shop_id: String, item_id: String) -> String:
	var label := currency_label_for(shop_id)
	return "购买单价: %d%s    出售单价: %d%s" % [
		buy_price_for(shop_id, item_id),
		label,
		sell_price_for(shop_id, item_id),
		label,
	]


static func _data() -> Dictionary:
	if data_cache_loaded:
		return data_cache
	data_cache_loaded = true
	if not FileAccess.file_exists(DATA_PATH):
		data_cache = {}
		return data_cache
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	data_cache = parsed as Dictionary if parsed is Dictionary else {}
	return data_cache
