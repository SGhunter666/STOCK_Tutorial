## Margin, short selling, financing and forced liquidation. Pure functions that
## read exchange state; execution stays in SmaExchange. Collateral for options
## and futures is owned by their own modules and folded into equity separately.
class_name SmaMargin
extends RefCounted

const INITIAL_LONG := 0.5
const INITIAL_SHORT := 0.5
const MAINTENANCE_LONG := 0.25
const MAINTENANCE_SHORT := 0.3
const MARGIN_INTEREST_RATE := 0.065
const BORROW_FEE_RATE := 0.03
const ACCRUAL_DAYS := 252.0
const CALL_GRACE_DAYS := 1


static func _round2(value: float) -> float:
	return roundf(value * 100.0) / 100.0


static func create_state() -> Dictionary:
	return {
		"accruedInterest": 0.0,
		"accruedBorrowFees": 0.0,
		"lastAccrualDay": 0,
		"call": null,
		"calls": [],
		"charges": [],
		"forcedLiquidations": [],
	}


## Adds margin fields to older saves without touching existing data.
static func normalize_account(account: Dictionary) -> Dictionary:
	if not account.has("shorts") or typeof(account["shorts"]) != TYPE_DICTIONARY:
		account["shorts"] = {}
	if not account.has("margin") or typeof(account["margin"]) != TYPE_DICTIONARY:
		account["margin"] = create_state()
	var margin: Dictionary = account["margin"]
	for key in ["accruedInterest", "accruedBorrowFees"]:
		if not margin.has(key) or not is_finite(float(margin[key])):
			margin[key] = 0.0
	if not margin.has("lastAccrualDay") or not is_finite(float(margin["lastAccrualDay"])):
		margin["lastAccrualDay"] = 0
	if not margin.has("call"):
		margin["call"] = null
	for key in ["calls", "charges", "forcedLiquidations"]:
		if not margin.has(key) or typeof(margin[key]) != TYPE_ARRAY:
			margin[key] = []
	var shorts: Dictionary = account["shorts"]
	for ticker in shorts.keys():
		var short: Dictionary = shorts[ticker]
		var qty := int(floor(float(short.get("qty", 0))))
		if qty <= 0:
			shorts.erase(ticker)
			continue
		short["qty"] = qty
		short["avgPrice"] = float(short.get("avgPrice", 0.0))
		short["openedDay"] = int(short.get("openedDay", 0))
	return account


static func is_live_order(order: Dictionary) -> bool:
	if order.is_empty() or order.get("active", true) == false:
		return false
	if String(order.get("status", "")) == "pending":
		return true
	if String(order.get("type", "")) != "limit":
		return false
	return ["open", "partiallyFilled"].has(String(order.get("status", "")))


static func _order_price(state: Dictionary, order: Dictionary) -> float:
	if String(order.get("type", "")) == "limit":
		return float(order.get("limitPrice", 0.0))
	var companies: Dictionary = state.get("companies", {})
	var ticker := String(order.get("ticker", ""))
	return float(companies.get(ticker, {}).get("last", 0.0))


## Initial-margin requirement still reserved by working player orders.
static func reserved_requirement(state: Dictionary, exclude_order_id: String = "") -> float:
	var total := 0.0
	for order in state.get("orders", []):
		if String(order.get("owner", "")) != "player" or not is_live_order(order):
			continue
		if String(order.get("id", "")) == exclude_order_id:
			continue
		var action := String(order.get("action", "openLong"))
		var ratio := 0.0
		if action == "openShort":
			ratio = INITIAL_SHORT
		elif action == "openLong":
			ratio = INITIAL_LONG
		if ratio <= 0.0:
			continue
		var remaining := int(order.get("qty", 0)) - int(order.get("filledQty", 0))
		var price := _order_price(state, order)
		if remaining > 0 and price > 0.0:
			total += remaining * price * ratio
	return _round2(total)


static func _long_short_values(state: Dictionary) -> Array:
	var long_value := 0.0
	var short_value := 0.0
	var companies: Dictionary = state.get("companies", {})
	var positions: Dictionary = state.get("account", {}).get("positions", {})
	for ticker in positions.keys():
		var position: Dictionary = positions[ticker]
		if int(position.get("qty", 0)) <= 0:
			continue
		long_value += int(position["qty"]) * float(companies.get(ticker, {}).get("last", 0.0))
	var shorts: Dictionary = state.get("account", {}).get("shorts", {})
	for ticker in shorts.keys():
		var short: Dictionary = shorts[ticker]
		if int(short.get("qty", 0)) <= 0:
			continue
		short_value += int(short["qty"]) * float(companies.get(ticker, {}).get("last", 0.0))
	return [long_value, short_value]


static func margin_snapshot(state: Dictionary, exclude_order_id: String = "") -> Dictionary:
	var account: Dictionary = state.get("account", {})
	var values := _long_short_values(state)
	var long_value: float = values[0]
	var short_value: float = values[1]
	var cash := float(account.get("cash", 0.0))
	var equity := _round2(cash + long_value - short_value)
	var base_initial := INITIAL_LONG * long_value + INITIAL_SHORT * short_value
	var reserved := reserved_requirement(state, exclude_order_id)
	var initial_requirement := _round2(base_initial + reserved)
	var maintenance_requirement := _round2(
		MAINTENANCE_LONG * long_value + MAINTENANCE_SHORT * short_value)
	var maintenance_excess := _round2(equity - maintenance_requirement)
	var margin: Dictionary = account.get("margin", {})
	var open_call: Variant = margin.get("call", null) if account.has("margin") else null
	var status := "ok"
	if equity <= 0.0:
		status = "liquidation"
	elif maintenance_excess < 0.0:
		status = "call"
	return {
		"cash": _round2(cash),
		"longMarketValue": _round2(long_value),
		"shortMarketValue": _round2(short_value),
		"equity": equity,
		"baseInitialRequirement": _round2(base_initial),
		"reservedRequirement": reserved,
		"initialRequirement": initial_requirement,
		"maintenanceRequirement": maintenance_requirement,
		"maintenanceExcess": maintenance_excess,
		"buyingPower": _round2(maxf(0.0, (equity - initial_requirement) / INITIAL_LONG)),
		"shortPower": _round2(maxf(0.0, (equity - initial_requirement) / INITIAL_SHORT)),
		"borrowedCash": _round2(maxf(0.0, -cash)),
		"accruedInterest": _round2(float(margin.get("accruedInterest", 0.0))),
		"accruedBorrowFees": _round2(float(margin.get("accruedBorrowFees", 0.0))),
		"status": status,
		"call": open_call,
	}


## True when a new opening trade leaves enough initial margin.
static func can_open_position(state: Dictionary, action: String, gross: float,
		fee: float = 0.0, exclude_order_id: String = "") -> bool:
	var snapshot := margin_snapshot(state, exclude_order_id)
	var ratio := INITIAL_SHORT if action == "openShort" else INITIAL_LONG
	var required := float(snapshot["initialRequirement"]) + ratio * gross + 1e-9
	return float(snapshot["equity"]) - fee >= required


## Charges interest on debit cash and a borrow fee on short market value.
static func accrue_margin_charges(state: Dictionary, days: int = 1) -> Dictionary:
	var account: Dictionary = state.get("account", {})
	var margin: Dictionary = account["margin"]
	var elapsed := maxi(0, days)
	if elapsed <= 0:
		return {"interest": 0.0, "borrowFee": 0.0, "total": 0.0}
	var snapshot := margin_snapshot(state)
	var interest_base := maxf(0.0, -float(account.get("cash", 0.0)))
	var interest := _round2(interest_base * MARGIN_INTEREST_RATE * elapsed / ACCRUAL_DAYS)
	var borrow_fee := _round2(float(snapshot["shortMarketValue"]) * BORROW_FEE_RATE
		* elapsed / ACCRUAL_DAYS)
	var total := _round2(interest + borrow_fee)
	if interest > 0.0:
		margin["accruedInterest"] = _round2(float(margin["accruedInterest"]) + interest)
		margin["charges"].append({"day": state.get("dayIndex", 0), "type": "interest",
			"amount": -interest, "basis": _round2(interest_base)})
	if borrow_fee > 0.0:
		margin["accruedBorrowFees"] = _round2(float(margin["accruedBorrowFees"]) + borrow_fee)
		margin["charges"].append({"day": state.get("dayIndex", 0), "type": "borrowFee",
			"amount": -borrow_fee, "basis": snapshot["shortMarketValue"]})
	if total > 0.0:
		account["cash"] = _round2(float(account["cash"]) - total)
	if margin["charges"].size() > 240:
		margin["charges"] = margin["charges"].slice(margin["charges"].size() - 240)
	margin["lastAccrualDay"] = state.get("dayIndex", 0)
	return {"interest": interest, "borrowFee": borrow_fee, "total": total}


## Raises or clears a margin call. Equity at or below zero liquidates at once;
## otherwise the player gets the configured grace period.
static func evaluate_margin_call(state: Dictionary) -> Dictionary:
	var account: Dictionary = state.get("account", {})
	var margin: Dictionary = account["margin"]
	var snapshot := margin_snapshot(state)
	if float(snapshot["equity"]) >= float(snapshot["maintenanceRequirement"]):
		var open_call: Variant = margin.get("call", null)
		if open_call != null and String(open_call.get("status", "")) == "open":
			open_call["status"] = "met"
			open_call["closedDay"] = state.get("dayIndex", 0)
			open_call["closedSecond"] = state.get("second", 0)
			for historic in margin["calls"]:
				if String(historic.get("id", "")) == String(open_call.get("id", "")):
					historic.merge(open_call, true)
					break
			margin["call"] = null
		return {"status": "ok", "snapshot": snapshot, "liquidate": false, "call": null}
	var current_call: Variant = margin.get("call", null)
	if current_call == null or String(current_call.get("status", "")) != "open":
		var grace := 0 if float(snapshot["equity"]) <= 0.0 else CALL_GRACE_DAYS
		var due_day := int(state.get("dayIndex", 0)) + grace
		current_call = {
			"id": "M%d" % (margin["calls"].size() + 1),
			"day": state.get("dayIndex", 0),
			"second": state.get("second", 0),
			"dueDay": due_day,
			"deficit": _round2(-float(snapshot["maintenanceExcess"])),
			"status": "open",
		}
		margin["call"] = current_call
		margin["calls"].append(current_call.duplicate(true))
		if margin["calls"].size() > 60:
			margin["calls"] = margin["calls"].slice(margin["calls"].size() - 60)
	else:
		current_call["deficit"] = _round2(-float(snapshot["maintenanceExcess"]))
	var liquidate := float(snapshot["equity"]) <= 0.0 or int(state.get("dayIndex", 0)) >= int(current_call["dueDay"])
	return {
		"status": "liquidation" if liquidate else "call",
		"snapshot": snapshot, "liquidate": liquidate, "call": current_call,
	}


## Largest position that can be closed to restore maintenance margin.
static func next_liquidation_target(state: Dictionary) -> Variant:
	var snapshot := margin_snapshot(state)
	if float(snapshot["maintenanceExcess"]) >= 0.0:
		return null
	var companies: Dictionary = state.get("companies", {})
	var candidates: Array = []
	var positions: Dictionary = state["account"].get("positions", {})
	for ticker in positions.keys():
		var position: Dictionary = positions[ticker]
		if int(position.get("qty", 0)) <= 0:
			continue
		candidates.append({"ticker": ticker, "action": "closeLong",
			"qty": int(position["qty"]),
			"value": int(position["qty"]) * float(companies.get(ticker, {}).get("last", 0.0))})
	var shorts: Dictionary = state["account"].get("shorts", {})
	for ticker in shorts.keys():
		var short: Dictionary = shorts[ticker]
		if int(short.get("qty", 0)) <= 0:
			continue
		candidates.append({"ticker": ticker, "action": "closeShort",
			"qty": int(short["qty"]),
			"value": int(short["qty"]) * float(companies.get(ticker, {}).get("last", 0.0))})
	if candidates.is_empty():
		return null
	candidates.sort_custom(func(a, b): return float(a["value"]) > float(b["value"]))
	return candidates[0]


static func record_forced_liquidation(state: Dictionary, entry: Dictionary) -> void:
	var account: Dictionary = state["account"]
	var margin: Dictionary = account["margin"]
	var reason := "maintenance" if margin.get("call", null) != null else "negativeEquity"
	var record := {"day": state.get("dayIndex", 0), "second": state.get("second", 0),
		"reason": reason}
	record.merge(entry, true)
	margin["forcedLiquidations"].append(record)
	if margin["forcedLiquidations"].size() > 120:
		margin["forcedLiquidations"] = margin["forcedLiquidations"].slice(
			margin["forcedLiquidations"].size() - 120)


static func close_margin_call(state: Dictionary, status: String = "liquidated") -> void:
	var account: Dictionary = state["account"]
	var margin: Dictionary = account["margin"]
	var call: Variant = margin.get("call", null)
	if call == null:
		return
	call["status"] = status
	call["closedDay"] = state.get("dayIndex", 0)
	call["closedSecond"] = state.get("second", 0)
	for historic in margin["calls"]:
		if String(historic.get("id", "")) == String(call.get("id", "")):
			historic.merge(call, true)
			break
	margin["call"] = null
