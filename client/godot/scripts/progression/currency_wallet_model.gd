extends RefCounted

const CURRENCY_STONE_COINS := "stoneCoins"
const CURRENCY_DIAMONDS := "diamonds"
const BINDING_UNBOUND := "unbound"
const BINDING_BOUND := "bound"
const FIELD_STONE_COINS := "stoneCoins"
const FIELD_BOUND_STONE_COINS := "boundStoneCoins"
const FIELD_DIAMONDS := "diamonds"
const FIELD_BOUND_DIAMONDS := "boundDiamonds"
const STONE_COIN_LIMIT := 10000000


static func field_key(currency: String, binding: String = BINDING_UNBOUND) -> String:
	match currency:
		CURRENCY_STONE_COINS:
			return FIELD_BOUND_STONE_COINS if binding == BINDING_BOUND else (FIELD_STONE_COINS if binding == BINDING_UNBOUND else "")
		CURRENCY_DIAMONDS:
			return FIELD_BOUND_DIAMONDS if binding == BINDING_BOUND else (FIELD_DIAMONDS if binding == BINDING_UNBOUND else "")
	return ""


static func balance(profile: Dictionary, currency: String, binding: String = BINDING_UNBOUND) -> int:
	var key := field_key(currency, binding)
	if key == "":
		return 0
	var amount := maxi(0, int(profile.get(key, 0)))
	return mini(amount, STONE_COIN_LIMIT) if currency == CURRENCY_STONE_COINS else amount


static func transferable_balance(profile: Dictionary, currency: String) -> int:
	return balance(profile, currency, BINDING_UNBOUND)


static func total_balance(profile: Dictionary, currency: String) -> int:
	return transferable_balance(profile, currency) + balance(profile, currency, BINDING_BOUND)


static func with_balance(profile: Dictionary, currency: String, binding: String, amount: int) -> Dictionary:
	var key := field_key(currency, binding)
	if key == "":
		return profile.duplicate(true)
	var next := profile.duplicate(true)
	var normalized_amount := maxi(0, amount)
	next[key] = mini(normalized_amount, STONE_COIN_LIMIT) if currency == CURRENCY_STONE_COINS else normalized_amount
	return next


static func materialize_fields(profile: Dictionary) -> Dictionary:
	var next := profile.duplicate(true)
	for currency in [CURRENCY_STONE_COINS, CURRENCY_DIAMONDS]:
		for binding in [BINDING_UNBOUND, BINDING_BOUND]:
			var key := field_key(currency, binding)
			next[key] = balance(profile, currency, binding)
	return next


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var legacy := materialize_fields({FIELD_STONE_COINS: 120, FIELD_DIAMONDS: 9})
	_expect(int(legacy.get(FIELD_STONE_COINS, -1)) == 120, "旧石币没有保持为非绑定", errors)
	_expect(int(legacy.get(FIELD_DIAMONDS, -1)) == 9, "旧钻石没有保持为非绑定", errors)
	_expect(int(legacy.get(FIELD_BOUND_STONE_COINS, -1)) == 0, "旧档绑定石币没有补零", errors)
	_expect(int(legacy.get(FIELD_BOUND_DIAMONDS, -1)) == 0, "旧档绑定钻石没有补零", errors)
	var split := {
		FIELD_STONE_COINS: 20,
		FIELD_BOUND_STONE_COINS: 80,
		FIELD_DIAMONDS: 3,
		FIELD_BOUND_DIAMONDS: 7,
	}
	_expect(transferable_balance(split, CURRENCY_STONE_COINS) == 20, "绑定石币被算入可交易余额", errors)
	_expect(total_balance(split, CURRENCY_STONE_COINS) == 100, "石币总额计算错误", errors)
	_expect(transferable_balance(split, CURRENCY_DIAMONDS) == 3, "绑定钻石被算入可交易余额", errors)
	_expect(total_balance(split, CURRENCY_DIAMONDS) == 10, "钻石总额计算错误", errors)
	var changed := with_balance(split, CURRENCY_STONE_COINS, BINDING_UNBOUND, 5)
	_expect(int(changed.get(FIELD_STONE_COINS, -1)) == 5, "非绑定石币写入失败", errors)
	_expect(int(changed.get(FIELD_BOUND_STONE_COINS, -1)) == 80, "非绑定写入改动了绑定石币", errors)
	return errors


static func _expect(condition: bool, message: String, errors: Array[String]) -> void:
	if not condition:
		errors.append(message)
