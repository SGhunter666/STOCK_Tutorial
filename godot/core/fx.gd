## Synthetic FX teaching engine. Quotes are USD per one foreign unit, derived
## deterministically from the macro seed; positions are marked in USD.
class_name SmaFx
extends RefCounted

const PAIRS := [
	{"id": "EURUSD", "base": 1.08, "period": 180.0, "phase": 0.2,
		"nameKey": "fx.EURUSD.name"},
	{"id": "GBPUSD", "base": 1.27, "period": 210.0, "phase": 0.9,
		"nameKey": "fx.GBPUSD.name"},
	{"id": "AUDUSD", "base": 0.66, "period": 160.0, "phase": 1.4,
		"nameKey": "fx.AUDUSD.name"},
	{"id": "CADUSD", "base": 0.74, "period": 190.0, "phase": 0.5,
		"nameKey": "fx.CADUSD.name"},
]


static func pair(pair_id: String) -> Dictionary:
	for entry in PAIRS:
		if String(entry["id"]) == pair_id:
			return entry
	return {}


static func _wave(day: float, period: float, phase: float) -> float:
	return sin((day / period) * SmaMacro.TAU_APPROX + phase)


static func rate(pair_id: String, day: int, seed: String, macro: Dictionary) -> float:
	var entry := pair(pair_id)
	if entry.is_empty():
		return 0.0
	var phase := SmaMacro.seed_phase(seed)
	var dollar_tilt := 0.0
	if not macro.is_empty():
		dollar_tilt = -(float(macro.get("realRate", 0.0)) - 1.5) * 0.008
	var value := float(entry["base"]) * (1.0
		+ _wave(day, float(entry["period"]), phase + float(entry["phase"])) * 0.075
		+ dollar_tilt)
	return SmaFormat.round_to(maxf(0.01, value), 4)


static func rates(day: int, seed: String, macro: Dictionary) -> Dictionary:
	var result := {}
	for entry in PAIRS:
		result[String(entry["id"])] = rate(String(entry["id"]), day, seed, macro)
	return result


static func fx_value(account: Dictionary, current_rates: Dictionary = {}) -> float:
	var total := 0.0
	for position in account.get("fx", []):
		var pair_id := String(position.get("id", ""))
		var rate_value := float(current_rates.get(pair_id,
			position.get("currentRate", position.get("entryRate", 0.0))))
		total += float(position.get("units", 0)) * rate_value
	return SmaFormat.round_to(total, 2)


static func fx_unrealized(account: Dictionary, current_rates: Dictionary = {}) -> float:
	var total := 0.0
	for position in account.get("fx", []):
		var pair_id := String(position.get("id", ""))
		var rate_value := float(current_rates.get(pair_id,
			position.get("currentRate", position.get("entryRate", 0.0))))
		total += float(position.get("units", 0)) * rate_value \
			- float(position.get("costBasis", 0.0))
	return SmaFormat.round_to(total, 2)


static func buy(account: Dictionary, pair_id: String, current_rates: Dictionary,
		units: int, fee: float, day: int) -> Dictionary:
	var entry := pair(pair_id)
	if entry.is_empty():
		return {"ok": false, "error": "fx.errorUnknown"}
	var quantity := int(floor(float(units)))
	if quantity <= 0:
		return {"ok": false, "error": "error.qtyInvalid"}
	var rate_value := float(current_rates.get(pair_id, 0.0))
	if rate_value <= 0.0:
		return {"ok": false, "error": "error.priceInvalid"}
	var safe_fee := maxf(0.0, fee)
	var cost := SmaFormat.round_to(float(quantity) * rate_value + safe_fee, 2)
	if cost > float(account.get("cash", 0.0)) + 0.000000001:
		return {"ok": false, "error": "error.insufficientCash"}
	var positions: Array = account.get("fx", [])
	var existing_index := -1
	for index in positions.size():
		if String(positions[index].get("id", "")) == pair_id:
			existing_index = index
			break
	if existing_index >= 0:
		var position: Dictionary = positions[existing_index]
		position["units"] = int(position.get("units", 0)) + quantity
		position["costBasis"] = SmaFormat.round_to(
			float(position.get("costBasis", 0.0)) + cost, 2)
		position["currentRate"] = rate_value
		positions[existing_index] = position
	else:
		positions.append({
			"id": pair_id,
			"units": quantity,
			"costBasis": cost,
			"entryRate": rate_value,
			"currentRate": rate_value,
			"purchaseDay": day,
		})
	account["fx"] = positions
	account["cash"] = SmaFormat.round_to(float(account.get("cash", 0.0)) - cost, 2)
	account["fees"] = SmaFormat.round_to(float(account.get("fees", 0.0)) + safe_fee, 2)
	return {"ok": true, "rate": rate_value, "units": quantity}


static func sell(account: Dictionary, pair_id: String, current_rates: Dictionary,
		units: int, fee: float) -> Dictionary:
	var positions: Array = account.get("fx", [])
	var existing_index := -1
	for index in positions.size():
		if String(positions[index].get("id", "")) == pair_id:
			existing_index = index
			break
	if existing_index < 0:
		return {"ok": false, "error": "fx.errorNoPosition"}
	var position: Dictionary = positions[existing_index]
	var held := int(position.get("units", 0))
	var quantity := int(floor(float(units)))
	if quantity <= 0:
		return {"ok": false, "error": "error.qtyInvalid"}
	if quantity > held:
		return {"ok": false, "error": "fx.errorInsufficient"}
	var rate_value := float(current_rates.get(pair_id, 0.0))
	if rate_value <= 0.0:
		return {"ok": false, "error": "error.priceInvalid"}
	var safe_fee := maxf(0.0, fee)
	var proceeds := SmaFormat.round_to(float(quantity) * rate_value - safe_fee, 2)
	var cost_portion := float(position.get("costBasis", 0.0)) * float(quantity) / float(held)
	var realized := SmaFormat.round_to(proceeds - cost_portion, 2)
	var remaining := held - quantity
	if remaining > 0:
		var next := position.duplicate(true)
		next["units"] = remaining
		next["costBasis"] = SmaFormat.round_to(
			float(position.get("costBasis", 0.0)) - cost_portion, 2)
		next["currentRate"] = rate_value
		positions[existing_index] = next
	else:
		positions.remove_at(existing_index)
	account["fx"] = positions
	account["cash"] = SmaFormat.round_to(float(account.get("cash", 0.0)) + proceeds, 2)
	account["fees"] = SmaFormat.round_to(float(account.get("fees", 0.0)) + safe_fee, 2)
	return {"ok": true, "rate": rate_value, "units": quantity, "realized": realized}


static func mark(account: Dictionary, current_rates: Dictionary) -> void:
	if account.get("fx", []).is_empty():
		return
	for position in account["fx"]:
		var pair_id := String(position.get("id", ""))
		if current_rates.has(pair_id):
			position["currentRate"] = float(current_rates[pair_id])
