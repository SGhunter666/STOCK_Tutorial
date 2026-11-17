## Fixed-income teaching engine: deterministic yields from the macro curve,
## semi-annual present-value pricing, purchases, sales, quarterly coupons and
## marking. Positions share the stock cash account.
class_name SmaBonds
extends RefCounted

const FACE := 1000.0
const COUPON_INTERVAL_DAYS := 63

const DEFS := [
	{"id": "gov2", "nameKey": "bond.gov2.name", "issuerKey": "bond.govIssuer",
		"kind": "government", "years": 2, "coupon": 2.4, "spreadBps": 0.0},
	{"id": "gov5", "nameKey": "bond.gov5.name", "issuerKey": "bond.govIssuer",
		"kind": "government", "years": 5, "coupon": 2.9, "spreadBps": 0.0},
	{"id": "gov10", "nameKey": "bond.gov10.name", "issuerKey": "bond.govIssuer",
		"kind": "government", "years": 10, "coupon": 3.3, "spreadBps": 0.0},
	{"id": "gov30", "nameKey": "bond.gov30.name", "issuerKey": "bond.govIssuer",
		"kind": "government", "years": 30, "coupon": 3.8, "spreadBps": 0.0},
	{"id": "corpA5", "nameKey": "bond.corpA5.name", "issuerKey": "bond.corpIssuer",
		"kind": "corporate", "years": 5, "coupon": 4.6, "spreadBps": 90.0,
		"rating": "A"},
	{"id": "corpBBB10", "nameKey": "bond.corpBBB10.name", "issuerKey": "bond.corpIssuer",
		"kind": "corporate", "years": 10, "coupon": 5.4, "spreadBps": 180.0,
		"rating": "BBB"},
	{"id": "corpHY5", "nameKey": "bond.corpHY5.name", "issuerKey": "bond.corpIssuer",
		"kind": "corporate", "years": 5, "coupon": 7.2, "spreadBps": 360.0,
		"rating": "BB"},
	{"id": "muni10", "nameKey": "bond.muni10.name", "issuerKey": "bond.muniIssuer",
		"kind": "municipal", "years": 10, "coupon": 3.0, "spreadBps": 55.0,
		"rating": "AA"},
]


static func bond_def(bond_id: String) -> Dictionary:
	for entry in DEFS:
		if String(entry["id"]) == bond_id:
			return entry
	return {}


## Government curve interpolation plus a credit spread.
static func bond_yield(bond: Dictionary, macro: Dictionary) -> float:
	if bond.is_empty() or macro.is_empty():
		return 0.0
	var two := float(macro.get("yield2", 0.0))
	var ten := float(macro.get("yield10", 0.0))
	var years := float(bond.get("years", 0))
	var base := two
	if years <= 2.0:
		base = two
	elif years >= 10.0:
		base = ten + (years - 10.0) * 0.035
	else:
		base = two + (ten - two) * ((years - 2.0) / 8.0)
	return maxf(0.01, base + float(bond.get("spreadBps", 0.0)) / 100.0)


## Semi-annual coupon bond present value per face unit.
static func bond_price(bond: Dictionary, macro: Dictionary) -> float:
	if bond.is_empty():
		return 0.0
	var yield_pct := bond_yield(bond, macro)
	var annual := yield_pct / 100.0
	var periods := maxi(1, int(round(float(bond.get("years", 1)) * 2.0)))
	var coupon := FACE * (float(bond.get("coupon", 0.0)) / 100.0) / 2.0
	var discount := 1.0 + annual / 2.0
	var price := 0.0
	for period in range(1, periods + 1):
		price += coupon / pow(discount, float(period))
	price += FACE / pow(discount, float(periods))
	return SmaFormat.round_to(price, 2)


static func quote_rows(macro: Dictionary) -> Array:
	var rows: Array = []
	for bond in DEFS:
		var row: Dictionary = bond.duplicate(true)
		row["yieldPct"] = SmaFormat.round_to(bond_yield(bond, macro), 2)
		row["price"] = bond_price(bond, macro)
		row["duration"] = int(bond.get("years", 0))
		rows.append(row)
	return rows


static func bond_value(account: Dictionary) -> float:
	var total := 0.0
	for position in account.get("bonds", []):
		total += float(position.get("qty", 0)) \
			* float(position.get("currentPrice", position.get("entryPrice", 0.0)))
	return SmaFormat.round_to(total, 2)


static func bond_unrealized(account: Dictionary) -> float:
	var total := 0.0
	for position in account.get("bonds", []):
		var value := float(position.get("qty", 0)) \
			* float(position.get("currentPrice", 0.0))
		total += value - float(position.get("costBasis", 0.0))
	return SmaFormat.round_to(total, 2)


static func buy(account: Dictionary, bond: Dictionary, macro: Dictionary, qty: int,
		fee: float, day: int) -> Dictionary:
	if bond.is_empty():
		return {"ok": false, "error": "bond.errorUnknown"}
	var quantity := int(floor(float(qty)))
	if quantity <= 0:
		return {"ok": false, "error": "error.qtyInvalid"}
	var price := bond_price(bond, macro)
	var safe_fee := maxf(0.0, fee)
	var cost := SmaFormat.round_to(float(quantity) * price + safe_fee, 2)
	if cost > float(account.get("cash", 0.0)) + 0.000000001:
		return {"ok": false, "error": "error.insufficientCash"}
	var bonds: Array = account.get("bonds", [])
	var existing_index := -1
	for index in bonds.size():
		if String(bonds[index].get("id", "")) == String(bond["id"]):
			existing_index = index
			break
	if existing_index >= 0:
		var position: Dictionary = bonds[existing_index]
		position["qty"] = int(position.get("qty", 0)) + quantity
		position["costBasis"] = SmaFormat.round_to(
			float(position.get("costBasis", 0.0)) + cost, 2)
		position["currentPrice"] = price
		bonds[existing_index] = position
	else:
		bonds.append({
			"id": String(bond["id"]),
			"qty": quantity,
			"costBasis": cost,
			"entryPrice": price,
			"currentPrice": price,
			"purchaseDay": day,
			"lastCouponDay": day,
			"couponRate": float(bond.get("coupon", 0.0)),
		})
	account["bonds"] = bonds
	account["cash"] = SmaFormat.round_to(float(account.get("cash", 0.0)) - cost, 2)
	account["fees"] = SmaFormat.round_to(float(account.get("fees", 0.0)) + safe_fee, 2)
	return {"ok": true, "price": price, "qty": quantity}


static func sell(account: Dictionary, bond_id: String, macro: Dictionary, qty: int,
		fee: float) -> Dictionary:
	var bonds: Array = account.get("bonds", [])
	var existing_index := -1
	for index in bonds.size():
		if String(bonds[index].get("id", "")) == bond_id:
			existing_index = index
			break
	if existing_index < 0:
		return {"ok": false, "error": "bond.errorNoPosition"}
	var position: Dictionary = bonds[existing_index]
	var held := int(position.get("qty", 0))
	var quantity := int(floor(float(qty)))
	if quantity <= 0:
		return {"ok": false, "error": "error.qtyInvalid"}
	if quantity > held:
		return {"ok": false, "error": "bond.errorInsufficient"}
	var bond := bond_def(bond_id)
	var price := bond_price(bond, macro)
	var safe_fee := maxf(0.0, fee)
	var proceeds := SmaFormat.round_to(float(quantity) * price - safe_fee, 2)
	var cost_portion := float(position.get("costBasis", 0.0)) * float(quantity) / float(held)
	var realized := SmaFormat.round_to(proceeds - cost_portion, 2)
	var remaining := held - quantity
	if remaining > 0:
		var next := position.duplicate(true)
		next["qty"] = remaining
		next["costBasis"] = SmaFormat.round_to(
			float(position.get("costBasis", 0.0)) - cost_portion, 2)
		next["currentPrice"] = price
		bonds[existing_index] = next
	else:
		bonds.remove_at(existing_index)
	account["bonds"] = bonds
	account["cash"] = SmaFormat.round_to(float(account.get("cash", 0.0)) + proceeds, 2)
	account["fees"] = SmaFormat.round_to(float(account.get("fees", 0.0)) + safe_fee, 2)
	return {"ok": true, "price": price, "qty": quantity, "realized": realized}


static func mark(account: Dictionary, macro: Dictionary) -> void:
	if account.get("bonds", []).is_empty():
		return
	for position in account["bonds"]:
		var bond := bond_def(String(position.get("id", "")))
		if not bond.is_empty():
			position["currentPrice"] = bond_price(bond, macro)


## Pays one quarterly coupon per position after 63 trading days.
static func apply_coupons(account: Dictionary, day: int) -> float:
	if account.get("bonds", []).is_empty():
		return 0.0
	var total := 0.0
	for position in account["bonds"]:
		var last := int(position.get("lastCouponDay", position.get("purchaseDay", 0)))
		if day - last < COUPON_INTERVAL_DAYS:
			continue
		var coupon := float(position.get("qty", 0)) * FACE \
			* float(position.get("couponRate", 0.0)) / 100.0 / 4.0
		total += coupon
		position["lastCouponDay"] = day
	if total <= 0.0:
		return 0.0
	account["cash"] = SmaFormat.round_to(float(account.get("cash", 0.0)) + total, 2)
	return SmaFormat.round_to(total, 2)
