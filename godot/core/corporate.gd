## Deterministic corporate-action calendar for the simulated exchange: stock
## splits, trading halts, rights issues, buybacks, secondary offerings, mergers,
## spin-offs and a single delisting. Actions mutate market state and the player
## ledger but never invent a new company identity.
class_name SmaCorporate
extends RefCounted

const QUARTER_DAYS := 63
const CAPITAL_OFFSET := 20
const STRUCTURAL_OFFSET := 45
const HALT_OFFSET := 10
const RIGHTS_OFFSET := 25
const BANKRUPTCY_OFFSET := 55
const ACTION_LIMIT := 300

const SPLITS := {
	"APLA": [{"quarter": 6, "ratio": 4.0}],
	"NVDO": [{"quarter": 3, "ratio": 2.0}],
	"TSLO": [{"quarter": 4, "ratio": 3.0}],
	"METO": [{"quarter": 5, "ratio": 2.0}],
	"NCRT": [{"quarter": 2, "ratio": 2.0}],
	"VCFD": [{"quarter": 6, "ratio": 2.0}],
	"QVAL": [{"quarter": 5, "ratio": 0.5}],
}

const CAPITAL := {
	"APLA": [{"quarter": 1, "type": "buyback", "ratio": 0.02},
		{"quarter": 5, "type": "buyback", "ratio": 0.02}],
	"MSFY": [{"quarter": 2, "type": "buyback", "ratio": 0.015},
		{"quarter": 6, "type": "buyback", "ratio": 0.015}],
	"JGCH": [{"quarter": 3, "type": "buyback", "ratio": 0.02}],
	"TSLO": [{"quarter": 2, "type": "offering", "ratio": 0.10},
		{"quarter": 6, "type": "offering", "ratio": 0.08}],
	"QVAL": [{"quarter": 1, "type": "offering", "ratio": 0.15},
		{"quarter": 4, "type": "offering", "ratio": 0.12}],
	"NCRT": [{"quarter": 3, "type": "offering", "ratio": 0.08}],
	"HLXB": [{"quarter": 2, "type": "offering", "ratio": 0.12}],
	"NGLB": [{"quarter": 1, "type": "offering", "ratio": 0.18},
		{"quarter": 5, "type": "offering", "ratio": 0.15}],
}

const STRUCTURAL := {
	"APLA": [{"quarter": 2, "type": "merger", "revenueShare": 0.02}],
	"EMBO": [{"quarter": 2, "type": "merger", "revenueShare": 0.03}],
	"MSFY": [{"quarter": 3, "type": "spinoff", "assetShare": 0.10}],
	"NCRT": [{"quarter": 4, "type": "spinoff", "assetShare": 0.12}],
	"JGCH": [{"quarter": 5, "type": "merger", "revenueShare": 0.015}],
}

const HALTS := {
	"NGLB": [{"quarter": 1, "duration": 3}],
	"VCFD": [{"quarter": 2, "duration": 2}],
	"TDFU": [{"quarter": 3, "duration": 4}],
}

const RIGHTS := {
	"NGLB": [{"quarter": 2, "ratio": 0.20, "discount": 0.85, "duration": 5}],
	"QVAL": [{"quarter": 3, "ratio": 0.25, "discount": 0.80, "duration": 5}],
}

const BANKRUPTCY := {"TDFU": [{"quarter": 4}]}


static func _quarter_for(day: int, offset: int) -> int:
	if day < QUARTER_DAYS + offset:
		return -1
	if (day - offset) % QUARTER_DAYS != 0:
		return -1
	return int((day - offset) / QUARTER_DAYS)


static func _event(state: Dictionary, event: Dictionary) -> void:
	var actions: Array = state.get("corporateActions", [])
	actions.push_front(event)
	state["corporateActions"] = actions.slice(0, ACTION_LIMIT)


static func _shock(state: Dictionary, ticker: String, impact: float) -> void:
	var cs: Dictionary = state["companies"].get(ticker, {})
	if cs.is_empty():
		return
	var base := float(cs["company"].get("price", cs["fairValue"]))
	cs["fairValue"] = clampf(float(cs["fairValue"]) * (1.0 + impact),
		base * 0.15, base * 6.0)
	cs["last"] = maxf(0.01, float(cs["last"]) * (1.0 + impact))
	state["quotes"].erase(ticker)


## Applies every action scheduled for the new session. Returns the events that
## the UI can surface as toasts or timeline rows.
static func apply_session_open(state: Dictionary) -> Array:
	var day := int(state["dayIndex"])
	var events: Array = []
	if day > 0 and day % QUARTER_DAYS == 0:
		events.append_array(_apply_splits(state, int(day / QUARTER_DAYS), day))
	var halt_quarter := _quarter_for(day, HALT_OFFSET)
	if halt_quarter >= 0:
		events.append_array(_apply_halts(state, halt_quarter, day))
	var rights_quarter := _quarter_for(day, RIGHTS_OFFSET)
	if rights_quarter >= 0:
		events.append_array(_apply_rights(state, rights_quarter, day))
	var capital_quarter := _quarter_for(day, CAPITAL_OFFSET)
	if capital_quarter >= 0:
		events.append_array(_apply_capital(state, capital_quarter, day))
	var structural_quarter := _quarter_for(day, STRUCTURAL_OFFSET)
	if structural_quarter >= 0:
		events.append_array(_apply_structural(state, structural_quarter, day))
	var bankruptcy_quarter := _quarter_for(day, BANKRUPTCY_OFFSET)
	if bankruptcy_quarter >= 0:
		events.append_array(_apply_bankruptcy(state, bankruptcy_quarter, day))
	expire_rights(state, day)
	return events


static func _apply_splits(state: Dictionary, quarter: int, day: int) -> Array:
	var events: Array = []
	var account: Dictionary = state["account"]
	for ticker in SPLITS.keys():
		for split in SPLITS[ticker]:
			if int(split["quarter"]) != quarter:
				continue
			var ratio := float(split["ratio"])
			if ratio <= 0.0 or ratio == 1.0:
				continue
			var cs: Dictionary = state["companies"].get(String(ticker), {})
			if cs.is_empty():
				continue
			cs["splitFactor"] = float(cs.get("splitFactor", 1.0)) * ratio
			for field in ["last", "fairValue", "prevClose", "open", "high", "low", "ema"]:
				cs[field] = maxf(0.01, float(cs[field]) / ratio)
			var series: Dictionary = cs.get("series", {})
			for bar in series.get("daily", []):
				for field in ["o", "h", "l", "c"]:
					bar[field] = maxf(0.01, float(bar[field]) / ratio)
				bar["v"] = int(roundf(float(bar.get("v", 0)) * ratio))
			if account["positions"].has(ticker):
				var position: Dictionary = account["positions"][ticker]
				position["qty"] = int(roundf(float(position.get("qty", 0)) * ratio))
				position["avgCost"] = float(position.get("avgCost", 0.0)) / ratio
				account["positions"][ticker] = position
			if account["shorts"].has(ticker):
				var short: Dictionary = account["shorts"][ticker]
				short["qty"] = int(roundf(float(short.get("qty", 0)) * ratio))
				short["avgPrice"] = float(short.get("avgPrice", 0.0)) / ratio
				account["shorts"][ticker] = short
			for option in account.get("options", []):
				if String(option.get("ticker", "")) != ticker:
					continue
				option["qty"] = int(roundf(float(option.get("qty", 0)) * ratio))
				option["strike"] = SmaFormat.round_to(
					float(option.get("strike", 0.0)) / ratio, 2)
				option["premium"] = float(option.get("premium", 0.0)) / ratio
				option["currentValue"] = float(option.get("currentValue", 0.0)) / ratio
				option["key"] = SmaOptions.option_key(option)
			for future in account.get("futures", []):
				if String(future.get("ticker", "")) != ticker:
					continue
				future["qty"] = int(roundf(float(future.get("qty", 0)) * ratio))
				for field in ["entryPrice", "settlementPrice", "currentPrice"]:
					if future.has(field):
						future[field] = float(future[field]) / ratio
			for order in state.get("orders", []):
				if String(order.get("ticker", "")) != ticker:
					continue
				order["qty"] = int(roundf(float(order.get("qty", 0)) * ratio))
				order["filledQty"] = int(roundf(float(order.get("filledQty", 0)) * ratio))
				for field in ["limitPrice", "stopPrice", "stopLimitPrice", "trailBest"]:
					if order.has(field) and order[field] != null:
						order[field] = SmaFormat.round_to(float(order[field]) / ratio, 2)
			var event := {"type": "split", "ticker": String(ticker), "ratio": ratio,
				"day": day, "impact": 0.0}
			_event(state, event)
			events.append(event)
	return events


static func _apply_halts(state: Dictionary, quarter: int, day: int) -> Array:
	var events: Array = []
	for ticker in HALTS.keys():
		for halt in HALTS[ticker]:
			if int(halt["quarter"]) != quarter:
				continue
			var cs: Dictionary = state["companies"].get(String(ticker), {})
			if cs.is_empty():
				continue
			var duration := maxi(1, int(halt["duration"]))
			cs["haltedUntilDay"] = day + duration - 1
			var event := {"type": "halt", "ticker": String(ticker), "day": day,
				"duration": duration}
			_event(state, event)
			events.append(event)
	return events


static func _apply_rights(state: Dictionary, quarter: int, day: int) -> Array:
	var events: Array = []
	var account: Dictionary = state["account"]
	for ticker in RIGHTS.keys():
		for terms in RIGHTS[ticker]:
			if int(terms["quarter"]) != quarter:
				continue
			var held := int(account["positions"].get(ticker, {}).get("qty", 0))
			if held <= 0:
				continue
			var cs: Dictionary = state["companies"].get(String(ticker), {})
			if cs.is_empty():
				continue
			var ratio := float(terms["ratio"])
			var price := SmaFormat.round_to(float(cs["last"]) * float(terms["discount"]), 2)
			var duration := maxi(1, int(terms["duration"]))
			var offering := {
				"id": "rights-%s-%d" % [ticker, quarter],
				"ticker": String(ticker), "quarter": quarter,
				"ratio": ratio, "price": price, "day": day,
				"deadlineDay": day + duration, "status": "open",
				"entitled": int(floor(float(held) * ratio)),
			}
			var offerings: Array = state.get("rightsOfferings", [])
			offerings.push_front(offering)
			state["rightsOfferings"] = offerings
			var event := {"type": "rights", "ticker": String(ticker), "day": day,
				"price": price, "ratio": ratio, "qty": int(offering["entitled"])}
			_event(state, event)
			events.append(event)
	return events


static func _apply_capital(state: Dictionary, quarter: int, day: int) -> Array:
	var events: Array = []
	for ticker in CAPITAL.keys():
		for action in CAPITAL[ticker]:
			if int(action["quarter"]) != quarter:
				continue
			var ratio := float(action["ratio"])
			var kind := String(action["type"])
			var impact := ratio * (1.4 if kind == "buyback" else -1.2)
			_shock(state, String(ticker), impact)
			var event := {"type": kind, "ticker": String(ticker), "day": day,
				"ratio": ratio, "impact": impact}
			_event(state, event)
			events.append(event)
	return events


static func _apply_structural(state: Dictionary, quarter: int, day: int) -> Array:
	var events: Array = []
	for ticker in STRUCTURAL.keys():
		for action in STRUCTURAL[ticker]:
			if int(action["quarter"]) != quarter:
				continue
			var kind := String(action["type"])
			if kind == "merger":
				var impact := float(action.get("revenueShare", 0.02))
				_shock(state, String(ticker), impact)
				var event := {"type": "merger", "ticker": String(ticker),
					"day": day, "impact": impact}
				_event(state, event)
				events.append(event)
			else:
				var asset_share := float(action.get("assetShare", 0.1))
				var company := SmaCompanyCatalog.get_company(String(ticker))
				var shares := maxf(1.0, float(company.get("sharesOutstanding", 1.0)))
				var assets := float(company.get("financials", {}).get("totalAssets", 0.0))
				var dps := SmaFormat.round_to(assets * asset_share * 0.9 / shares, 4)
				var amount := _pay_special(state, String(ticker), dps, quarter, day)
				var impact := -asset_share * 0.3
				_shock(state, String(ticker), impact)
				var event := {"type": "spinoff", "ticker": String(ticker),
					"day": day, "impact": impact, "dps": dps, "amount": amount}
				_event(state, event)
				events.append(event)
	return events


static func _pay_special(state: Dictionary, ticker: String, dps: float,
		quarter: int, day: int) -> float:
	if dps <= 0.0:
		return 0.0
	var account: Dictionary = state["account"]
	var dividends: Array = account.get("dividends", [])
	var total := 0.0
	var long_qty := int(account["positions"].get(ticker, {}).get("qty", 0))
	if long_qty > 0:
		var amount := SmaFormat.round_to(float(long_qty) * dps, 2)
		account["cash"] = SmaFormat.round_to(float(account["cash"]) + amount, 2)
		dividends.append({"ticker": ticker, "qty": long_qty, "dps": dps,
			"amount": amount, "type": "special", "quarter": quarter, "day": day})
		total += amount
	var short_qty := int(account["shorts"].get(ticker, {}).get("qty", 0))
	if short_qty > 0:
		var amount := SmaFormat.round_to(float(short_qty) * dps, 2)
		account["cash"] = SmaFormat.round_to(float(account["cash"]) - amount, 2)
		dividends.append({"ticker": ticker, "qty": short_qty, "dps": dps,
			"amount": -amount, "type": "special", "side": "short",
			"quarter": quarter, "day": day})
		total -= amount
	if dividends.size() > 300:
		dividends = dividends.slice(dividends.size() - 300)
	account["dividends"] = dividends
	return SmaFormat.round_to(total, 2)


static func _apply_bankruptcy(state: Dictionary, quarter: int, day: int) -> Array:
	var events: Array = []
	for ticker in BANKRUPTCY.keys():
		for action in BANKRUPTCY[ticker]:
			if int(action["quarter"]) != quarter:
				continue
			var cs: Dictionary = state["companies"].get(String(ticker), {})
			if cs.is_empty() or bool(cs.get("delisted", false)):
				continue
			var price := float(cs["last"])
			var account: Dictionary = state["account"]
			var long_qty := int(account["positions"].get(ticker, {}).get("qty", 0))
			if long_qty > 0:
				account["cash"] = SmaFormat.round_to(
					float(account["cash"]) + float(long_qty) * price, 2)
				account["realizedPnl"] = SmaFormat.round_to(
					float(account["realizedPnl"]) + (price
					- float(account["positions"][ticker].get("avgCost", 0.0)))
					* float(long_qty), 2)
				account["positions"].erase(ticker)
			var short_qty := int(account["shorts"].get(ticker, {}).get("qty", 0))
			if short_qty > 0:
				account["cash"] = SmaFormat.round_to(
					float(account["cash"]) - float(short_qty) * price, 2)
				account["realizedPnl"] = SmaFormat.round_to(
					float(account["realizedPnl"]) + (float(account["shorts"][ticker].get(
					"avgPrice", 0.0)) - price) * float(short_qty), 2)
				account["shorts"].erase(ticker)
			cs["delisted"] = true
			cs["haltedUntilDay"] = day
			var event := {"type": "delisting", "ticker": String(ticker), "day": day}
			_event(state, event)
			events.append(event)
	return events


static func expire_rights(state: Dictionary, day: int) -> void:
	var offerings: Array = state.get("rightsOfferings", [])
	for offering in offerings:
		if String(offering.get("status", "")) == "open" \
				and day > int(offering.get("deadlineDay", 0)):
			offering["status"] = "expired"
	state["rightsOfferings"] = offerings


static func open_rights(state: Dictionary, day: int) -> Array:
	var rows: Array = []
	for offering in state.get("rightsOfferings", []):
		if String(offering.get("status", "")) != "open":
			continue
		if day > int(offering.get("deadlineDay", 0)):
			continue
		rows.append(offering)
	return rows


static func subscribe_rights(state: Dictionary, offering_id: String,
		day: int) -> Dictionary:
	var account: Dictionary = state["account"]
	for offering in state.get("rightsOfferings", []):
		if String(offering.get("id", "")) != offering_id:
			continue
		if String(offering.get("status", "")) != "open" \
				or day > int(offering.get("deadlineDay", 0)):
			return {"ok": false, "error": "corporate.errorClosed"}
		var qty := int(offering.get("entitled", 0))
		var price := float(offering.get("price", 0.0))
		var cost := SmaFormat.round_to(float(qty) * price, 2)
		if qty <= 0:
			return {"ok": false, "error": "corporate.errorNoEntitlement"}
		if cost > float(account["cash"]) + 0.000001:
			return {"ok": false, "error": "error.insufficientCash"}
		var ticker := String(offering["ticker"])
		var position: Dictionary = account["positions"].get(ticker,
			{"qty": 0, "avgCost": 0.0})
		var total_cost := float(position["avgCost"]) * float(position["qty"]) + cost
		position["qty"] = int(position["qty"]) + qty
		position["avgCost"] = total_cost / float(maxi(1, int(position["qty"])))
		account["positions"][ticker] = position
		account["cash"] = SmaFormat.round_to(float(account["cash"]) - cost, 2)
		account["trades"].append({"ticker": ticker, "side": "buy",
			"action": "rights", "qty": qty, "price": price, "fee": 0.0,
			"day": day, "second": 0, "realized": 0.0})
		if account["trades"].size() > 500:
			account["trades"] = account["trades"].slice(account["trades"].size() - 500)
		offering["status"] = "subscribed"
		return {"ok": true, "qty": qty, "cost": cost}
	return {"ok": false, "error": "corporate.errorUnknown"}


static func decline_rights(state: Dictionary, offering_id: String) -> Dictionary:
	for offering in state.get("rightsOfferings", []):
		if String(offering.get("id", "")) == offering_id \
				and String(offering.get("status", "")) == "open":
			offering["status"] = "declined"
			return {"ok": true}
	return {"ok": false, "error": "corporate.errorUnknown"}


static func recent_actions(state: Dictionary, limit: int = 8) -> Array:
	return state.get("corporateActions", []).slice(0, limit)
