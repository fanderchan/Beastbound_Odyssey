extends RefCounted
class_name CommerceServiceIdentityPresenter

const InteractionModel := preload("res://scripts/world/interaction_model.gd")
const ShopCatalogModel := preload("res://scripts/progression/shop_catalog_model.gd")

const ITEM_SHOP_APPEARANCE_ID := "npc_item_shopkeeper_f_v1"
const EQUIPMENT_SHOP_APPEARANCE_ID := "npc_equipment_artisan_m_v1"
const DIAMOND_SHOP_APPEARANCE_ID := "npc_diamond_merchant_m_v1"
const BANK_APPEARANCE_ID := "npc_bank_keeper_f_v1"


static func shop_identity(
	shop_id: String,
	map_data: Dictionary,
	preferred_interaction: Dictionary = {}
) -> Dictionary:
	var normalized_shop_id := shop_id.strip_edges()
	if (
		not preferred_interaction.is_empty()
		and str(preferred_interaction.get("shopId", "")).strip_edges()
			== normalized_shop_id
	):
		return _identity_from_interaction(
			preferred_interaction,
			_fallback_shop_identity(normalized_shop_id)
		)
	for value in InteractionModel.interaction_points(map_data):
		if not (value is Dictionary):
			continue
		var interaction := value as Dictionary
		if str(interaction.get("shopId", "")).strip_edges() != normalized_shop_id:
			continue
		return _identity_from_interaction(
			interaction,
			_fallback_shop_identity(normalized_shop_id)
		)
	return _fallback_shop_identity(normalized_shop_id)


static func bank_identity(
	map_data: Dictionary,
	preferred_interaction: Dictionary = {}
) -> Dictionary:
	if (
		not preferred_interaction.is_empty()
		and InteractionModel.facility_type_for(preferred_interaction)
			== InteractionModel.FACILITY_BANK
	):
		return _identity_from_interaction(
			preferred_interaction,
			_fallback_bank_identity()
		)
	for value in InteractionModel.interaction_points(map_data):
		if not (value is Dictionary):
			continue
		var interaction := value as Dictionary
		if InteractionModel.facility_type_for(interaction) != InteractionModel.FACILITY_BANK:
			continue
		return _identity_from_interaction(interaction, _fallback_bank_identity())
	return _fallback_bank_identity()


static func _fallback_shop_identity(shop_id: String) -> Dictionary:
	if shop_id == "firebud_equipment_shop":
		return _identity(
			ShopCatalogModel.label_for(shop_id),
			"装备供应",
			"武器、防具与修理",
			EQUIPMENT_SHOP_APPEARANCE_ID,
			"neutral"
		)
	if shop_id == "firebud_diamond_shop":
		return _identity(
			ShopCatalogModel.label_for(shop_id),
			"珍品供应",
			"钻石商品与珍稀物资",
			DIAMOND_SHOP_APPEARANCE_ID,
			"neutral"
		)
	if shop_id.begins_with("manor_"):
		return _identity(
			ShopCatalogModel.label_for(shop_id),
			"家族道具场",
			"庄园成员专属供应",
			ITEM_SHOP_APPEARANCE_ID,
			"neutral"
		)
	return _identity(
		ShopCatalogModel.label_for(shop_id),
		"旅途补给",
		"药品、捕捉工具与杂货",
		ITEM_SHOP_APPEARANCE_ID,
		"neutral"
	)


static func _fallback_bank_identity() -> Dictionary:
	return _identity(
		"银行服务",
		"银行",
		"石币与物品保管",
		"",
		"neutral"
	)


static func _identity_from_interaction(
	interaction: Dictionary,
	fallback: Dictionary
) -> Dictionary:
	var result := fallback.duplicate(true)
	var display_name := str(interaction.get("name", "")).strip_edges()
	var role_label := str(interaction.get("roleLabel", "")).strip_edges()
	var appearance_id := str(interaction.get("appearanceId", "")).strip_edges()
	if display_name != "":
		result["displayName"] = display_name
	if role_label != "":
		result["roleLabel"] = role_label
	if appearance_id != "":
		result["appearanceId"] = appearance_id
	result["npcId"] = str(interaction.get("id", "")).strip_edges()
	result["personalName"] = str(interaction.get("personalName", "")).strip_edges()
	return result


static func _identity(
	display_name: String,
	role_label: String,
	duty_label: String,
	appearance_id: String,
	portrait_state: String
) -> Dictionary:
	return {
		"npcId": "",
		"displayName": display_name,
		"roleLabel": role_label,
		"dutyLabel": duty_label,
		"appearanceId": appearance_id,
		"portraitState": portrait_state,
	}
