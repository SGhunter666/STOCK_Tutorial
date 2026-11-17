## Crypto teaching engine with fractional units. Quotes are deterministic and
## more volatile than equities, driven by macro risk appetite and long cycles.
class_name SmaCrypto
extends RefCounted

const UNIT_PRECISION := 1000000.0

const DEFS := [
	{"id": "BTC", "nameKey": "crypto.BTC.name", "base": 68000.0,
		"amplitude": 0.22, "period": 72.0, "phase": 0.4},
	{"id": "ETH", "nameKey": "crypto.ETH.name", "base": 3500.0,
		"amplitude": 0.26, "period": 64.0, "phase": 1.2},
	{"id": "SOL", "nameKey": "crypto.SOL.name", "base": 160.0,
		"amplitude": 0.32, "period": 58.0, "phase": 2.1},
]


static func definition(crypto_id: String) -> Dictionary:
	for entry in DEFS:
		if String(entry["id"]) == crypto_id:
			return entry
	return {}


static func _wave(day: float, period: float, phase: float) -> float:
	return sin((day / period) * SmaMacro.TAU_APPROX + phase)


static func price(definition_entry: Dictionary, day: int, seed: String,
		macro: Dictionary) -> float:
	if definition_entry.is_empty():
		return 0.0
	var phase := SmaMacro.seed_phase(seed)
	var risk := float(macro.get("riskAppetite", 50)) if not macro.is_empty() else 50.0
	var real_rate := float(macro.get("realRate", 0.0)) if not macro.is_empty() else 0.0
	var period := float(definition_entry["period"])
	var drift := _wave(day, period, phase + float(definition_entry["phase"])) \
		* float(definition_entry["amplitude"])
	drift += _wave(day, period * 2.6, phase + float(definition_entry["phase"]) * 1.7) \
		* float(definition_entry["amplitude"]) * 0.45
	var tilt := ((risk - 50.0) / 100.0) * 0.18 - maxf(0.0, real_rate - 1.5) * 0.03
	return SmaFormat.round_to(maxf(0.01, float(definition_entry["base"]) * (1.0 + drift + tilt)), 2)


static func quotes(day: int, seed: String, macro: Dictionary,
		previous_macro: Dictionary) -> Array:
	var rows: Array = []
	for entry in DEFS:
		var current := price(entry, day, seed, macro)
		var previous := price(entry, day - 1, seed, previous_macro)
		var row: Dictionary = entry.duplicate(true)
		row["price"] = current
		row["previousPrice"] = previous
		row["changePct"] = SmaFormat.round_to((current / previous - 1.0) * 100.0, 2) \
			if previous > 0.0 else 0.0
		rows.append(row)
	return rows


static func crypto_value(account: Dictionary) -> float:
	var total := 0.0
	for position in account.get("crypto", []):
		total += float(position.get("units", 0.0)) \
			* float(position.get("currentPrice", position.get("entryPrice", 0.0)))
	return SmaFormat.round_to(total, 2)


static func crypto_unrealized(account: Dictionary) -> float:
	var total := 0.0
	for position in account.get("crypto", []):
		var value := float(position.get("units", 0.0)) \
			* float(position.get("currentPrice", 0.0))
		total += value - float(position.get("costBasis", 0.0))
	return SmaFormat.round_to(total, 2)


static func _valid_units(value: float) -> float:
	if not is_finite(value) or value <= 0.0:
		return 0.0
	var rounded := roundf(value * UNIT_PRECISION) / UNIT_PRECISION
	return rounded if rounded > 0.0 else 0.0


static func buy(account: Dictionary, crypto_id: String, current_price: float,
		units: float, fee: float, day: int) -> Dictionary:
	if definition(crypto_id).is_empty():
		return {"ok": false, "error": "crypto.errorUnknown"}
	var quantity := _valid_units(units)
	if quantity <= 0.0:
		return {"ok": false, "error": "crypto.errorQtyInvalid"}
	if current_price <= 0.0:
		return {"ok": false, "error": "error.priceInvalid"}
	var safe_fee := maxf(0.0, fee)
	var cost := SmaFormat.round_to(quantity * current_price + safe_fee, 2)
	if cost > float(account.get("cash", 0.0)) + 0.000000001:
		return {"ok": false, "error": "error.insufficientCash"}
	var positions: Array = account.get("crypto", [])
	var existing_index := -1
	for index in positions.size():
		if String(positions[index].get("id", "")) == crypto_id:
			existing_index = index
			break
	if existing_index >= 0:
		var position: Dictionary = positions[existing_index]
		position["units"] = _valid_units(float(position.get("units", 0.0)) + quantity)
		position["costBasis"] = SmaFormat.round_to(
			float(position.get("costBasis", 0.0)) + cost, 2)
		position["currentPrice"] = current_price
		positions[existing_index] = position
	else:
		positions.append({
			"id": crypto_id,
			"units": quantity,
			"costBasis": cost,
			"entryPrice": current_price,
			"currentPrice": current_price,
			"purchaseDay": day,
		})
	account["crypto"] = positions
	account["cash"] = SmaFormat.round_to(float(account.get("cash", 0.0)) - cost, 2)
	account["fees"] = SmaFormat.round_to(float(account.get("fees", 0.0)) + safe_fee, 2)
	return {"ok": true, "price": current_price, "units": quantity}


static func sell(account: Dictionary, crypto_id: String, current_price: float,
		units: float, fee: float) -> Dictionary:
	var positions: Array = account.get("crypto", [])
	var existing_index := -1
	for index in positions.size():
		if String(positions[index].get("id", "")) == crypto_id:
			existing_index = index
			break
	if existing_index < 0:
		return {"ok": false, "error": "crypto.errorNoPosition"}
	var position: Dictionary = positions[existing_index]
	var held := float(position.get("units", 0.0))
	var quantity := _valid_units(units)
	if quantity <= 0.0:
		return {"ok": false, "error": "crypto.errorQtyInvalid"}
	if quantity > held + 0.000000001:
		return {"ok": false, "error": "crypto.errorInsufficient"}
	if current_price <= 0.0:
		return {"ok": false, "error": "error.priceInvalid"}
	var safe_fee := maxf(0.0, fee)
	var proceeds := SmaFormat.round_to(quantity * current_price - safe_fee, 2)
	var cost_portion := float(position.get("costBasis", 0.0)) * quantity / held
	var realized := SmaFormat.round_to(proceeds - cost_portion, 2)
	var remaining := _valid_units(held - quantity)
	if remaining > 0.000000001:
		var next := position.duplicate(true)
		next["units"] = remaining
		next["costBasis"] = SmaFormat.round_to(maxf(0.0,
			float(position.get("costBasis", 0.0)) - cost_portion), 2)
		next["currentPrice"] = current_price
		positions[existing_index] = next
	else:
		positions.remove_at(existing_index)
	account["crypto"] = positions
	account["cash"] = SmaFormat.round_to(float(account.get("cash", 0.0)) + proceeds, 2)
	account["fees"] = SmaFormat.round_to(float(account.get("fees", 0.0)) + safe_fee, 2)
	return {"ok": true, "price": current_price, "units": quantity, "realized": realized}


static func mark(account: Dictionary, prices: Dictionary) -> void:
	if account.get("crypto", []).is_empty():
		return
	for position in account["crypto"]:
		var crypto_id := String(position.get("id", ""))
		if prices.has(crypto_id):
			position["currentPrice"] = float(prices[crypto_id])
