## Commodity teaching engine. Prices are deterministic functions of the date,
## seed and macro backdrop; positions share the stock cash account.
class_name SmaCommodities
extends RefCounted

const DEFS := [
	{"id": "gold", "nameKey": "commodity.gold.name", "unitKey": "commodity.gold.unit",
		"kind": "metal", "base": 235.0, "amplitude": 0.05, "period": 170.0, "phase": 0.3},
	{"id": "silver", "nameKey": "commodity.silver.name", "unitKey": "commodity.silver.unit",
		"kind": "metal", "base": 28.0, "amplitude": 0.08, "period": 145.0, "phase": 0.9},
	{"id": "oil", "nameKey": "commodity.oil.name", "unitKey": "commodity.oil.unit",
		"kind": "energy", "base": 78.0, "amplitude": 0.11, "period": 95.0, "phase": 1.1},
	{"id": "copper", "nameKey": "commodity.copper.name", "unitKey": "commodity.copper.unit",
		"kind": "industrial", "base": 4.2, "amplitude": 0.07, "period": 130.0, "phase": 0.2},
	{"id": "natgas", "nameKey": "commodity.natgas.name", "unitKey": "commodity.natgas.unit",
		"kind": "energy", "base": 2.6, "amplitude": 0.16, "period": 80.0, "phase": 1.6},
]


static func definition(commodity_id: String) -> Dictionary:
	for entry in DEFS:
		if String(entry["id"]) == commodity_id:
			return entry
	return {}


static func _wave(day: float, period: float, phase: float) -> float:
	return sin((day / period) * SmaMacro.TAU_APPROX + phase)


static func price(definition_entry: Dictionary, day: int, seed: String,
		macro: Dictionary) -> float:
	if definition_entry.is_empty():
		return 0.0
	var phase := SmaMacro.seed_phase(seed)
	var real_rate := float(macro.get("realRate", 0.0)) if not macro.is_empty() else 0.0
	var growth := float(macro.get("growth", 2.1)) if not macro.is_empty() else 2.1
	var risk := float(macro.get("riskAppetite", 50)) if not macro.is_empty() else 50.0
	var tilt := 0.0
	if String(definition_entry["kind"]) == "metal":
		tilt = -(real_rate - 1.5) * 0.025 + ((risk - 50.0) / 100.0) * 0.02
	elif String(definition_entry["id"]) == "copper":
		tilt = (growth - 2.1) * 0.05 + ((risk - 50.0) / 100.0) * 0.03
	else:
		tilt = (growth - 2.1) * 0.03 + ((50.0 - risk) / 100.0) * 0.02
	var drift := _wave(day, float(definition_entry["period"]),
		phase + float(definition_entry["phase"])) * float(definition_entry["amplitude"])
	var raw := float(definition_entry["base"]) * (1.0 + drift + tilt)
	var digits := 3 if float(definition_entry["base"]) < 10.0 else 2
	return SmaFormat.round_to(maxf(0.01, raw), digits)


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


static func commodity_value(account: Dictionary) -> float:
	var total := 0.0
	for position in account.get("commodities", []):
		total += float(position.get("qty", 0)) \
			* float(position.get("currentPrice", position.get("entryPrice", 0.0)))
	return SmaFormat.round_to(total, 2)


static func commodity_unrealized(account: Dictionary) -> float:
	var total := 0.0
	for position in account.get("commodities", []):
		var value := float(position.get("qty", 0)) \
			* float(position.get("currentPrice", 0.0))
		total += value - float(position.get("costBasis", 0.0))
	return SmaFormat.round_to(total, 2)


static func buy(account: Dictionary, commodity_id: String, current_price: float,
		qty: int, fee: float, day: int) -> Dictionary:
	if definition(commodity_id).is_empty():
		return {"ok": false, "error": "commodity.errorUnknown"}
	var quantity := int(floor(float(qty)))
	if quantity <= 0:
		return {"ok": false, "error": "error.qtyInvalid"}
	if current_price <= 0.0:
		return {"ok": false, "error": "error.priceInvalid"}
	var safe_fee := maxf(0.0, fee)
	var cost := SmaFormat.round_to(float(quantity) * current_price + safe_fee, 2)
	if cost > float(account.get("cash", 0.0)) + 0.000000001:
		return {"ok": false, "error": "error.insufficientCash"}
	var positions: Array = account.get("commodities", [])
	var existing_index := -1
	for index in positions.size():
		if String(positions[index].get("id", "")) == commodity_id:
			existing_index = index
			break
	if existing_index >= 0:
		var position: Dictionary = positions[existing_index]
		position["qty"] = int(position.get("qty", 0)) + quantity
		position["costBasis"] = SmaFormat.round_to(
			float(position.get("costBasis", 0.0)) + cost, 2)
		position["currentPrice"] = current_price
		positions[existing_index] = position
	else:
		positions.append({
			"id": commodity_id,
			"qty": quantity,
			"costBasis": cost,
			"entryPrice": current_price,
			"currentPrice": current_price,
			"purchaseDay": day,
		})
	account["commodities"] = positions
	account["cash"] = SmaFormat.round_to(float(account.get("cash", 0.0)) - cost, 2)
	account["fees"] = SmaFormat.round_to(float(account.get("fees", 0.0)) + safe_fee, 2)
	return {"ok": true, "price": current_price, "qty": quantity}


static func sell(account: Dictionary, commodity_id: String, current_price: float,
		qty: int, fee: float) -> Dictionary:
	var positions: Array = account.get("commodities", [])
	var existing_index := -1
	for index in positions.size():
		if String(positions[index].get("id", "")) == commodity_id:
			existing_index = index
			break
	if existing_index < 0:
		return {"ok": false, "error": "commodity.errorNoPosition"}
	var position: Dictionary = positions[existing_index]
	var held := int(position.get("qty", 0))
	var quantity := int(floor(float(qty)))
	if quantity <= 0:
		return {"ok": false, "error": "error.qtyInvalid"}
	if quantity > held:
		return {"ok": false, "error": "commodity.errorInsufficient"}
	if current_price <= 0.0:
		return {"ok": false, "error": "error.priceInvalid"}
	var safe_fee := maxf(0.0, fee)
	var proceeds := SmaFormat.round_to(float(quantity) * current_price - safe_fee, 2)
	var cost_portion := float(position.get("costBasis", 0.0)) * float(quantity) / float(held)
	var realized := SmaFormat.round_to(proceeds - cost_portion, 2)
	var remaining := held - quantity
	if remaining > 0:
		var next := position.duplicate(true)
		next["qty"] = remaining
		next["costBasis"] = SmaFormat.round_to(
			float(position.get("costBasis", 0.0)) - cost_portion, 2)
		next["currentPrice"] = current_price
		positions[existing_index] = next
	else:
		positions.remove_at(existing_index)
	account["commodities"] = positions
	account["cash"] = SmaFormat.round_to(float(account.get("cash", 0.0)) + proceeds, 2)
	account["fees"] = SmaFormat.round_to(float(account.get("fees", 0.0)) + safe_fee, 2)
	return {"ok": true, "price": current_price, "qty": quantity, "realized": realized}


static func mark(account: Dictionary, prices: Dictionary) -> void:
	if account.get("commodities", []).is_empty():
		return
	for position in account["commodities"]:
		var commodity_id := String(position.get("id", ""))
		if prices.has(commodity_id):
			position["currentPrice"] = float(prices[commodity_id])
