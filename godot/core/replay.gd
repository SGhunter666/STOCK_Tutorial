## Read-only portfolio replay. It rebuilds stock positions and stock exposure at
## any past day from the trade ledger, combines that with the recorded equity
## curve and the historical daily closes, and lists that day's events. Options
## and futures are reflected in equity but not reconstructed contract by contract.
class_name SmaReplay
extends RefCounted


static func max_day(state: Dictionary) -> int:
	return maxi(0, int(state.get("dayIndex", 0)))


static func equity_curve(state: Dictionary) -> Array:
	var curve: Array = []
	for entry in state["account"].get("equityHistory", []):
		curve.append({"day": int(entry.get("day", 0)),
			"equity": float(entry.get("equity", 0.0))})
	curve.sort_custom(func(a, b): return int(a["day"]) < int(b["day"]))
	return curve


static func _equity_at(curve: Array, day: int, fallback: float) -> float:
	var value := fallback
	for entry in curve:
		if int(entry["day"]) > day:
			break
		value = float(entry["equity"])
	return value


static func _close_at(state: Dictionary, ticker: String, day: int) -> float:
	var date := SmaCalendar.iso_date(day)
	var cs: Dictionary = state["companies"].get(ticker, {})
	if cs.is_empty():
		return 0.0
	for bar in cs.get("series", {}).get("daily", []):
		if String(bar.get("d", "")) == date:
			return float(bar.get("c", 0.0))
	return float(cs.get("last", cs.get("fairValue", 0.0)))


static func _apply_trade(positions: Dictionary, trade: Dictionary) -> void:
	var ticker := String(trade.get("ticker", ""))
	var action := String(trade.get("action", ""))
	var side := String(trade.get("side", ""))
	var qty := int(trade.get("qty", 0))
	var price := float(trade.get("price", 0.0))
	if action == "":
		if side == "buy":
			action = "openLong"
		elif side == "sell":
			action = "closeLong"
		elif side == "short":
			action = "openShort"
		elif side == "cover":
			action = "closeShort"
	if qty <= 0 or price <= 0.0:
		return
	if action == "openLong":
		var position: Dictionary = positions.get(ticker, {"qty": 0, "avgCost": 0.0})
		var total := float(position["avgCost"]) * float(position["qty"]) + float(qty) * price
		position["qty"] = int(position["qty"]) + qty
		position["avgCost"] = total / float(maxi(1, int(position["qty"])))
		positions[ticker] = position
	elif action == "closeLong":
		if not positions.has(ticker):
			return
		var position: Dictionary = positions[ticker]
		position["qty"] = maxi(0, int(position["qty"]) - qty)
		if int(position["qty"]) <= 0:
			positions.erase(ticker)
		else:
			positions[ticker] = position
	elif action == "openShort":
		var short: Dictionary = positions.get(ticker, {"qty": 0, "avgPrice": 0.0,
			"short": true})
		var total := float(short["avgPrice"]) * float(short["qty"]) + float(qty) * price
		short["qty"] = int(short["qty"]) + qty
		short["avgPrice"] = total / float(maxi(1, int(short["qty"])))
		short["short"] = true
		positions[ticker] = short
	elif action == "closeShort":
		if not positions.has(ticker):
			return
		var short: Dictionary = positions[ticker]
		short["qty"] = maxi(0, int(short["qty"]) - qty)
		if int(short["qty"]) <= 0:
			positions.erase(ticker)
		else:
			positions[ticker] = short


static func snapshot(state: Dictionary, day: int) -> Dictionary:
	var curve := equity_curve(state)
	var current_equity := float(state["account"].get("cash", 0.0))
	var equity := _equity_at(curve, day, current_equity)
	var previous_equity := _equity_at(curve, maxi(0, day - 1), equity)
	var positions: Dictionary = {}
	var trades_today: Array = []
	var dividends_today: Array = []
	for trade in state["account"].get("trades", []):
		var trade_day := int(trade.get("day", 0))
		if trade_day > day:
			continue
		_apply_trade(positions, trade)
		if trade_day == day:
			trades_today.append(trade)
	for dividend in state["account"].get("dividends", []):
		if int(dividend.get("day", 0)) == day:
			dividends_today.append(dividend)
	var rows: Array = []
	var long_value := 0.0
	var short_value := 0.0
	for ticker in positions.keys():
		var position: Dictionary = positions[ticker]
		var close := _close_at(state, String(ticker), day)
		var qty := int(position.get("qty", 0))
		var value := float(qty) * close
		if bool(position.get("short", false)):
			short_value += absf(value)
		else:
			long_value += value
		rows.append({
			"ticker": String(ticker), "qty": qty,
			"avgCost": float(position.get("avgCost", position.get("avgPrice", 0.0))),
			"close": close, "value": SmaFormat.round_to(value, 2),
			"short": bool(position.get("short", false)),
			"pnl": SmaFormat.round_to(value - float(position.get("avgCost",
				position.get("avgPrice", 0.0))) * float(qty), 2),
		})
	rows.sort_custom(func(a, b): return absf(float(a["value"])) > absf(float(b["value"])))
	var events: Array = []
	for trade in trades_today:
		events.append({"kind": "stock", "ticker": String(trade.get("ticker", "")),
			"side": String(trade.get("side", "")), "qty": int(trade.get("qty", 0)),
			"amount": SmaFormat.round_to(float(trade.get("qty", 0))
				* float(trade.get("price", 0.0)), 2)})
	for dividend in dividends_today:
		events.append({"kind": "dividend", "ticker": String(dividend.get("ticker", "")),
			"amount": float(dividend.get("amount", 0.0))})
	for action in state.get("corporateActions", []):
		if int(action.get("day", -1)) == day:
			events.append({"kind": "corporate", "ticker": String(action.get("ticker", "")),
				"action": String(action.get("type", "")),
				"amount": float(action.get("amount", 0.0))})
	var curve_to_day: Array = []
	for entry in curve:
		if int(entry["day"]) > day:
			break
		curve_to_day.append(entry)
	return {
		"day": day, "equity": SmaFormat.round_to(equity, 2),
		"dailyPnl": SmaFormat.round_to(equity - previous_equity, 2),
		"longValue": SmaFormat.round_to(long_value, 2),
		"shortValue": SmaFormat.round_to(short_value, 2),
		"stockValue": SmaFormat.round_to(long_value - short_value, 2),
		"positions": rows, "events": events,
		"curve": curve_to_day,
		"tradeCount": trades_today.size(),
	}
