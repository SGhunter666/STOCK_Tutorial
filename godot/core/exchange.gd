## Deterministic fictional exchange: 50 companies, market-maker ladder, simulated
## traders, player ledger, margin and short selling. The class is UI-free and
## fully serializable; every action is a method that mutates `state`.
##
## Options, futures, bonds, FX, commodities, crypto, news, macro and ETFs live
## in separate modules; this file only wires their state and settlement hooks.
class_name SmaExchange
extends RefCounted

const START_CASH := 100000.0
const FEE_BPS := 1.0
const SESSION_SECONDS := 23400
const TRADER_TYPES := ["noise", "momentum", "value"]
const SAVE_VERSION := 1
const MARKET_TRADE_LIMIT := 800
const ACCOUNT_TRADE_LIMIT := 500
const HISTORY_LIMIT := 400
const HISTORY_DAYS := 120

var state: Dictionary = {}
## Commission in basis points; sandbox difficulty changes it.
var fee_bps := FEE_BPS
## Player fills accumulated since the last clear. Game slices the new entries
## after each player action and clears them; never serialized.
var last_player_fills: Array = []
## Tickers whose market-maker ladder must be refreshed.
var _dirty_liquidity: Dictionary = {}
## Tickers whose resting orders must be re-matched against the ladder.
var _resting_dirty: Dictionary = {}
## Fast-path flags so an empty book of conditional/pending orders costs nothing
## per simulated second.
var _has_conditional := false
var _has_pending := false
var _cached_day := -1
var _cached_date := ""
var _cached_clock_second := -1
var _cached_clock := ""


func _init(seed_value: String = "sim-exchange-v1", cash: float = START_CASH,
		fee_bps_value: float = FEE_BPS) -> void:
	fee_bps = fee_bps_value
	var catalog := SmaCompanyCatalog.load_companies()
	var companies := {}
	for ticker in catalog.keys():
		companies[ticker] = _create_company_state(catalog[ticker], seed_value)
	var etf_instruments := SmaEtfs.instruments()
	for ticker in etf_instruments.keys():
		companies[ticker] = _create_company_state(etf_instruments[ticker], seed_value)
	var sector_factors := {}
	for sector in SmaCompanyCatalog.sectors():
		sector_factors[sector] = 0.0
	var rng := SmaRng.new(seed_value)
	state = {
		"seed": seed_value,
		"rngState": rng.get_state(),
		"dayIndex": 0,
		"second": 0,
		"nextOrderId": 1,
		"marketFactor": 0.0,
		"sectorFactors": sector_factors,
		"optionStyle": "european",
		"optionSettlements": [],
		"earlyAssignments": [],
		"etfTickers": SmaEtfs.tickers(),
		"companies": companies,
		"quotes": {},
		"orders": [],
		"trades": [],
		"news": [],
		"newsSeq": 1,
		"corporateActions": [],
		"rightsOfferings": [],
		"account": {
			"cash": cash,
			"initialCash": cash,
			"positions": {},
			"shorts": {},
			"realizedPnl": 0.0,
			"fees": 0.0,
			"trades": [],
			"dividends": [],
			"adjustments": [],
			"equityHistory": [{"day": 0, "equity": cash}],
			"margin": SmaMargin.create_state(),
			"options": [],
			"optionTrades": [],
			"optionRealized": 0.0,
			"optionSeq": 0,
			"futures": [],
			"futuresTrades": [],
			"futuresSeq": 0,
			"futuresRealized": 0.0,
			"bonds": [],
			"fx": [],
			"commodities": [],
			"crypto": [],
		},
		"stats": {"tradeCount": 0, "volume": 0, "seconds": 0},
	}
	for ticker in companies.keys():
		quote(ticker)
	record_equity_snapshot()


# ---------------------------------------------------------------------------
# Universe and quotes
# ---------------------------------------------------------------------------

func _create_company_state(company: Dictionary, seed_value: String) -> Dictionary:
	var ticker := String(company["ticker"])
	var price := float(company["price"])
	var mm_size := maxi(40, int(round(float(company["avgVolume"]) / 8000.0)))
	var book := SmaOrderBook.new(ticker)
	var half := maxf(0.01, price * float(company["spread"]) / 20000.0)
	book.set_market_maker(price - half, price + half, mm_size)
	var series := SmaMinuteSeries.create()
	series["daily"] = _seed_daily_history(ticker, price, seed_value)
	var prev_close := price
	if series["daily"].size() >= 2:
		prev_close = float(series["daily"][series["daily"].size() - 2]["c"])
	return {
		"company": company,
		"fairValue": price,
		"last": price,
		"prevClose": prev_close,
		"open": price,
		"high": price,
		"low": price,
		"volume": 0,
		"trades": 0,
		"inventory": 0.0,
		"ema": price,
		"mmSize": mm_size,
		"book": book,
		"series": series,
		"splitFactor": 1.0,
		"capitalFactor": 1.0,
		"haltedUntilDay": null,
		"delisted": false,
		"isEtf": bool(company.get("isEtf", false)),
	}


## Charts and optimisers need history before the first simulated session, so
## every instrument starts with deterministic daily bars ending at its price.
static func _seed_daily_history(ticker: String, price: float, seed_value: String) -> Array:
	var rng := SmaRng.new("%s|%s|history" % [seed_value, ticker])
	var bars: Array = []
	var cursor_price := price * (0.9 + rng.next() * 0.2)
	for index in HISTORY_DAYS:
		var drift := rng.normal() * 0.012
		var open_price := cursor_price
		var close_price := maxf(0.5, cursor_price * (1.0 + drift))
		var high := maxf(open_price, close_price) * (1.0 + absf(rng.normal()) * 0.004)
		var low := minf(open_price, close_price) * (1.0 - absf(rng.normal()) * 0.004)
		var day := SmaCalendar.iso_date(index - HISTORY_DAYS)
		bars.append({
			"d": day, "end": day,
			"o": open_price, "h": high, "l": low, "c": close_price,
			"v": int(100000 + rng.next() * 900000),
			"trades": 0, "finalized": true,
		})
		cursor_price = close_price
	var factor := price / maxf(0.01, cursor_price)
	for bar in bars:
		for key in ["o", "h", "l", "c"]:
			bar[key] = SmaFormat.round_to(float(bar[key]) * factor, 2)
	bars[bars.size() - 1]["c"] = price
	return bars


## Quotes are derived presentation data. They are computed on demand instead of
## every simulated second, which keeps a full-day fast-forward cheap.
func quote(ticker: String) -> Dictionary:
	var symbol := ticker.to_upper()
	var cs: Dictionary = state["companies"].get(symbol, {})
	if cs.is_empty():
		return {}
	var bid: Variant = cs["book"].best_bid()
	var ask: Variant = cs["book"].best_ask()
	var prev_close := float(cs["prevClose"])
	var change_pct := ((float(cs["last"]) - prev_close) / prev_close) * 100.0 if prev_close > 0.0 else 0.0
	var quote_data: Dictionary = state["quotes"].get(symbol, {})
	quote_data["ticker"] = symbol
	quote_data["last"] = SmaFormat.round_to(float(cs["last"]), 2)
	quote_data["bid"] = null if bid == null else SmaFormat.round_to(float(bid), 2)
	quote_data["ask"] = null if ask == null else SmaFormat.round_to(float(ask), 2)
	quote_data["open"] = SmaFormat.round_to(float(cs["open"]), 2)
	quote_data["high"] = SmaFormat.round_to(float(cs["high"]), 2)
	quote_data["low"] = SmaFormat.round_to(float(cs["low"]), 2)
	quote_data["volume"] = int(cs["volume"])
	quote_data["trades"] = int(cs["trades"])
	quote_data["changePct"] = SmaFormat.round_to(change_pct, 4)
	quote_data["fairValue"] = SmaFormat.round_to(float(cs["fairValue"]), 2)
	quote_data["source"] = "SIMULATED"
	state["quotes"][symbol] = quote_data
	return quote_data


func refresh_liquidity(ticker: String) -> void:
	var cs: Dictionary = state["companies"][ticker]
	var company: Dictionary = cs["company"]
	var avg_volume := maxf(1.0, float(company["avgVolume"]) * float(cs["splitFactor"]))
	var inventory_ratio := float(cs["inventory"]) / avg_volume
	var inventory_shift := clampf(inventory_ratio * float(company["impact"]) * 0.5, -0.2, 0.2)
	var mid := float(cs["fairValue"]) * (1.0 - inventory_shift)
	var half := maxf(0.01, mid * float(company["spread"]) / 20000.0)
	cs["book"].set_market_maker(maxf(0.01, mid - half), mid + half, float(cs["mmSize"]))


func _record_trade(ticker: String, price: float, qty: int, meta: Dictionary = {}) -> void:
	var cs: Dictionary = state["companies"][ticker]
	cs["last"] = SmaFormat.round_to(price, 4)
	cs["high"] = maxf(float(cs["high"]), float(cs["last"]))
	cs["low"] = minf(float(cs["low"]), float(cs["last"]))
	cs["volume"] = int(cs["volume"]) + qty
	cs["trades"] = int(cs["trades"]) + 1
	cs["ema"] = float(cs["ema"]) * 0.98 + float(cs["last"]) * 0.02
	var date := _date_text()
	var second := int(state["second"])
	SmaMinuteSeries.apply_trade(cs["series"], {
		"date": date, "second": second, "price": cs["last"], "qty": qty,
	})
	var trade := {
		"ticker": ticker, "price": cs["last"], "qty": qty,
		"day": int(state["dayIndex"]), "second": second,
		"date": date, "time": _clock_text(),
	}
	trade.merge(meta, true)
	state["trades"].append(trade)
	if state["trades"].size() > MARKET_TRADE_LIMIT + 200:
		state["trades"] = state["trades"].slice(state["trades"].size() - MARKET_TRADE_LIMIT)
	state["stats"]["tradeCount"] = int(state["stats"]["tradeCount"]) + 1
	state["stats"]["volume"] = float(state["stats"]["volume"]) + qty


# ---------------------------------------------------------------------------
# Order semantics
# ---------------------------------------------------------------------------

static func resolve_order_action(side: String, action: String = "") -> String:
	if ["openLong", "closeLong", "openShort", "closeShort"].has(action):
		return action
	if side == "short":
		return "openShort"
	if side == "cover":
		return "closeShort"
	if side == "sell":
		return "closeLong"
	if side == "buy":
		return "openLong"
	return ""


static func book_side_for_action(action: String) -> String:
	return "buy" if action == "openLong" or action == "closeShort" else "sell"


func action_for_order(order: Dictionary) -> String:
	return resolve_order_action(String(order.get("side", "")), String(order.get("action", "")))


func book_side_for_order(order: Dictionary) -> String:
	var explicit := String(order.get("bookSide", ""))
	if explicit == "buy" or explicit == "sell":
		return explicit
	return book_side_for_action(action_for_order(order))


func is_live_order(order: Dictionary) -> bool:
	if order.is_empty() or order.get("active", true) == false:
		return false
	return ["pending", "open", "partiallyFilled"].has(String(order.get("status", "")))


func is_trading_halted(ticker: String) -> bool:
	var cs: Dictionary = state["companies"].get(ticker.to_upper(), {})
	if cs.is_empty():
		return true
	if bool(cs.get("delisted", false)):
		return true
	var halted_until: Variant = cs.get("haltedUntilDay", null)
	if halted_until != null and int(state["dayIndex"]) <= int(halted_until):
		return true
	return false


func _reserved_quantity(ticker: String, action: String) -> int:
	var groups := {}
	for order in state["orders"]:
		if String(order.get("owner", "")) != "player" or String(order.get("ticker", "")) != ticker:
			continue
		if action_for_order(order) != action or not is_live_order(order):
			continue
		var remaining := int(order.get("qty", 0)) - int(order.get("filledQty", 0))
		if remaining <= 0:
			continue
		var key := String(order.get("ocoGroup", ""))
		if key.is_empty():
			key = String(order.get("id", ""))
		groups[key] = maxi(int(groups.get(key, 0)), remaining)
	var total := 0
	for qty in groups.values():
		total += int(qty)
	return total


func available_shares(ticker: String) -> int:
	var held := int(state["account"]["positions"].get(ticker, {}).get("qty", 0))
	return maxi(0, held - _reserved_quantity(ticker, "closeLong"))


func available_short_shares(ticker: String) -> int:
	var held := int(state["account"]["shorts"].get(ticker, {}).get("qty", 0))
	return maxi(0, held - _reserved_quantity(ticker, "closeShort"))


func _order_reserve_price(order: Dictionary) -> float:
	var ticker := String(order.get("ticker", ""))
	var quote_data := quote(ticker)
	var order_type := String(order.get("type", "market"))
	if order_type == "limit":
		return float(order.get("limitPrice", 0.0))
	if order_type == "stop" or order_type == "stopLimit":
		return float(order.get("stopPrice", 0.0))
	if order_type == "trailing":
		return float(quote_data.get("last", 0.0))
	return float(quote_data.get("ask", 0.0))


func available_cash() -> float:
	var groups := {}
	for order in state["orders"]:
		if String(order.get("owner", "")) != "player" or action_for_order(order) != "openLong":
			continue
		if not is_live_order(order):
			continue
		var remaining := int(order.get("qty", 0)) - int(order.get("filledQty", 0))
		if remaining <= 0:
			continue
		var price := _order_reserve_price(order)
		var value := remaining * price * (1.0 + fee_bps / 10000.0)
		var key := String(order.get("ocoGroup", ""))
		if key.is_empty():
			key = String(order.get("id", ""))
		groups[key] = maxf(float(groups.get(key, 0.0)), value)
	var reserved := 0.0
	for value in groups.values():
		reserved += float(value)
	return SmaFormat.round_to(float(state["account"]["cash"]) - reserved, 2)


# ---------------------------------------------------------------------------
# Order entry
# ---------------------------------------------------------------------------

func submit_order(params: Dictionary) -> Dictionary:
	var symbol := String(params.get("ticker", "")).to_upper()
	var cs: Dictionary = state["companies"].get(symbol, {})
	var quantity := int(floor(float(params.get("qty", 0))))
	var side := String(params.get("side", ""))
	var order_action := resolve_order_action(side, String(params.get("action", "")))
	var order_side := side if side == "short" or side == "cover" else (
		"sell" if side == "sell" else ("buy" if side == "buy" else ""))
	var order_owner := String(params.get("owner", "player"))
	if cs.is_empty() or order_action.is_empty() or order_side.is_empty() or quantity <= 0:
		return {"ok": false, "error": "order.invalid"}
	if bool(cs.get("delisted", false)):
		return {"ok": false, "error": "order.delisted"}
	if is_trading_halted(symbol):
		return {"ok": false, "error": "order.halted"}
	var order_type := String(params.get("type", "market"))
	if not ["limit", "stop", "stopLimit", "trailing"].has(order_type):
		order_type = "market"
	if order_type == "limit" and not _finite(params.get("limitPrice")):
		return {"ok": false, "error": "order.limit"}
	if (order_type == "stop" or order_type == "stopLimit") and not _finite(params.get("stopPrice")):
		return {"ok": false, "error": "order.stop"}
	if order_type == "stopLimit" and not _finite(params.get("stopLimitPrice")):
		return {"ok": false, "error": "order.stopLimit"}
	if order_type == "trailing":
		var trail := float(params.get("trailPct", 0.0))
		if not is_finite(trail) or trail <= 0.0 or trail >= 0.5:
			return {"ok": false, "error": "order.trail"}
	var book_side := book_side_for_action(order_action)
	var market_price: Variant = null
	var player_reference := 0.0
	if order_owner == "player":
		var quote_data := quote(symbol)
		player_reference = float(quote_data.get("ask") if book_side == "buy" else quote_data.get("bid"))
		if order_type == "market":
			market_price = quote_data.get("ask") if book_side == "buy" else quote_data.get("bid")
	elif order_type == "market":
		market_price = cs["book"].best_ask() if book_side == "buy" else cs["book"].best_bid()
	var reference_price := 0.0
	if order_type == "limit":
		reference_price = SmaFormat.round_to(float(params.get("limitPrice", 0.0)), 2)
	elif order_type == "stop" or order_type == "stopLimit":
		reference_price = SmaFormat.round_to(float(params.get("stopPrice", 0.0)), 2)
	elif order_type == "trailing":
		reference_price = SmaFormat.round_to(float(cs["last"]), 2)
	elif market_price != null:
		reference_price = float(market_price)
	if not is_finite(reference_price) or reference_price <= 0.0:
		return {"ok": false, "error": "order.noLiquidity"}
	if order_owner == "player":
		var fee := SmaFormat.round_to(quantity * reference_price * fee_bps / 10000.0, 2)
		if order_action == "openLong":
			if int(state["account"]["shorts"].get(symbol, {}).get("qty", 0)) > 0:
				return {"ok": false, "error": "order.shortPosition"}
			if not SmaMargin.can_open_position(state, order_action,
					quantity * reference_price, fee):
				return {"ok": false, "error": "order.insufficientMargin"}
		elif order_action == "openShort":
			if int(state["account"]["positions"].get(symbol, {}).get("qty", 0)) > 0:
				return {"ok": false, "error": "order.longPosition"}
			if not SmaMargin.can_open_position(state, order_action,
					quantity * reference_price, fee):
				return {"ok": false, "error": "order.insufficientMargin"}
		elif order_action == "closeLong":
			if not bool(params.get("skipAvailability", false)):
				if quantity > available_shares(symbol):
					return {"ok": false, "error": "order.insufficientShares"}
		elif order_action == "closeShort":
			if int(state["account"]["shorts"].get(symbol, {}).get("qty", 0)) <= 0:
				return {"ok": false, "error": "order.noShortPosition"}
			if not bool(params.get("skipAvailability", false)):
				if quantity > available_short_shares(symbol):
					return {"ok": false, "error": "order.insufficientShortShares"}
	var order := {
		"id": "O%d" % int(state["nextOrderId"]),
		"ticker": symbol,
		"side": order_side,
		"action": order_action,
		"bookSide": book_side,
		"type": order_type,
		"qty": quantity,
		"limitPrice": reference_price if order_type == "limit" else null,
		"stopPrice": reference_price if order_type == "stop" or order_type == "stopLimit" else null,
		"stopLimitPrice": SmaFormat.round_to(float(params.get("stopLimitPrice", 0.0)), 2)
			if order_type == "stopLimit" else null,
		"trailPct": float(params.get("trailPct", 0.0)) if order_type == "trailing" else null,
		"trailBest": reference_price if order_type == "trailing" else null,
		"refPrice": player_reference,
		"ocoGroup": String(params.get("ocoGroup", "")),
		"filledQty": 0,
		"avgPrice": 0.0,
		"remaining": quantity,
		"status": "open",
		"active": true,
		"owner": order_owner,
		"createdAt": {"day": int(state["dayIndex"]), "second": int(state["second"])},
		"expiresAt": null if order_owner == "player" else int(state["second"]) + 300,
		"fills": [],
		"reason": "",
	}
	if order_type == "trailing":
		order["stopPrice"] = SmaFormat.round_to(
			reference_price * (1.0 - float(order["trailPct"])) if book_side == "sell"
			else reference_price * (1.0 + float(order["trailPct"])), 2)
	state["nextOrderId"] = int(state["nextOrderId"]) + 1
	state["orders"].append(order)
	if bool(params.get("pending", false)):
		order["status"] = "pending"
		_has_pending = true
		return {"ok": true, "order": order}
	if ["stop", "stopLimit", "trailing"].has(order_type):
		_has_conditional = true
		return {"ok": true, "order": order}
	var match_input := {
		"id": String(order["id"]),
		"side": book_side,
		"type": order_type,
		"limitPrice": order["limitPrice"],
		"remaining": quantity,
	}
	var result: Dictionary = cs["book"].match_order(match_input)
	_apply_fills(order, result["fills"], true, false)
	if order["type"] == "market" and int(order["remaining"]) > 0 and String(order["reason"]).is_empty():
		order["reason"] = "insufficientLiquidity"
	return {"ok": true, "order": order}


func cancel_order(order_id: String, order_owner: String = "player") -> Dictionary:
	var order: Dictionary = {}
	for candidate in state["orders"]:
		if String(candidate.get("id", "")) == order_id and String(candidate.get("owner", "")) == order_owner:
			order = candidate
			break
	if order.is_empty():
		return {"ok": false, "error": "order.notFound"}
	if not ["pending", "open", "partiallyFilled"].has(String(order["status"])):
		return {"ok": false, "error": "order.notOpen"}
	state["companies"][order["ticker"]]["book"].remove_order(order_id)
	order["status"] = "cancelled"
	order["reason"] = "order.cancelled"
	order["active"] = false
	_cancel_oco_siblings(order)
	return {"ok": true, "order": order}


func _cancel_oco_siblings(order: Dictionary) -> void:
	var group := String(order.get("ocoGroup", ""))
	if group.is_empty():
		return
	for sibling in state["orders"]:
		if sibling == order or String(sibling.get("ocoGroup", "")) != group:
			continue
		if not is_live_order(sibling):
			continue
		var cs: Dictionary = state["companies"].get(String(sibling["ticker"]), {})
		if not cs.is_empty():
			cs["book"].remove_order(String(sibling["id"]))
		sibling["status"] = "cancelled"
		sibling["reason"] = "ocoTriggered"
		sibling["active"] = false


func submit_oco(params: Dictionary) -> Dictionary:
	var symbol := String(params.get("ticker", "")).to_upper()
	var cs: Dictionary = state["companies"].get(symbol, {})
	var quantity := int(floor(float(params.get("qty", 0))))
	var action := String(params.get("action", "closeLong"))
	if cs.is_empty() or quantity <= 0:
		return {"ok": false, "error": "order.invalid"}
	var take_profit := float(params.get("takeProfitPrice", 0.0))
	var stop := float(params.get("stopPrice", 0.0))
	if not is_finite(take_profit) or not is_finite(stop) or take_profit <= 0.0 or stop <= 0.0:
		return {"ok": false, "error": "order.oco"}
	var inverted := (stop <= take_profit) if action == "closeShort" else (stop >= take_profit)
	if inverted:
		return {"ok": false, "error": "order.oco"}
	var available := available_short_shares(symbol) if action == "closeShort" else available_shares(symbol)
	if quantity > available:
		return {"ok": false, "error": "order.insufficientShortShares"
			if action == "closeShort" else "order.insufficientShares"}
	var group := "OCO%d" % int(state["nextOrderId"])
	var first := submit_order({
		"ticker": symbol, "side": "cover" if action == "closeShort" else "sell",
		"action": action, "type": "limit", "qty": quantity,
		"limitPrice": take_profit, "ocoGroup": group,
	})
	if not bool(first["ok"]):
		return first
	if String(first["order"]["status"]) == "filled":
		return {"ok": true, "orders": [first["order"]], "ocoGroup": group}
	var second := submit_order({
		"ticker": symbol, "side": "cover" if action == "closeShort" else "sell",
		"action": action, "type": "stop", "qty": quantity,
		"stopPrice": stop, "ocoGroup": group, "skipAvailability": true,
	})
	if not bool(second["ok"]):
		cancel_order(String(first["order"]["id"]))
		return second
	return {"ok": true, "orders": [first["order"], second["order"]], "ocoGroup": group}


# ---------------------------------------------------------------------------
# Matching and ledger
# ---------------------------------------------------------------------------

func _apply_fills(order: Dictionary, fills: Array, rest: bool = false,
		keep_resting: bool = false) -> void:
	var action := action_for_order(order)
	for fill in fills:
		var qty := int(fill["qty"])
		var price := float(fill["price"])
		if String(order.get("owner", "")) == "player":
			var fee := SmaFormat.round_to(qty * price * fee_bps / 10000.0, 2)
			if action == "openLong" or action == "openShort":
				if not SmaMargin.can_open_position(state, action, qty * price, fee,
						String(order.get("id", ""))):
					order["reason"] = "insufficientMargin"
					break
			elif action == "closeLong":
				if qty > int(state["account"]["positions"].get(order["ticker"], {}).get("qty", 0)):
					order["reason"] = "insufficientShares"
					break
			elif action == "closeShort":
				if qty > int(state["account"]["shorts"].get(order["ticker"], {}).get("qty", 0)):
					order["reason"] = "insufficientShortShares"
					break
		var cs: Dictionary = state["companies"][order["ticker"]]
		if String(fill.get("counterparty", "")) == "mm":
			var inventory_delta := -qty if book_side_for_order(order) == "buy" else qty
			cs["inventory"] = float(cs["inventory"]) + inventory_delta
			_dirty_liquidity[String(order["ticker"])] = true
			_resting_dirty[String(order["ticker"])] = true
		_record_trade(String(order["ticker"]), price, qty,
			{"orderId": String(order.get("id", "")), "owner": String(order.get("owner", ""))})
		_apply_order_fill(order, fill)
		var counterpart_id := String(fill.get("orderId", ""))
		if not counterpart_id.is_empty():
			var counterpart := _find_order(counterpart_id)
			if not counterpart.is_empty():
				_apply_order_fill(counterpart, fill)
	var remaining := int(order.get("qty", 0)) - int(order.get("filledQty", 0))
	var blocked := ["insufficientCash", "insufficientShares", "insufficientMargin",
		"insufficientShortShares", "noShortPosition"].has(String(order.get("reason", "")))
	var can_rest := (rest or keep_resting) and String(order.get("type", "")) == "limit" and not blocked
	if remaining > 0 and can_rest:
		order["status"] = "partiallyFilled" if int(order.get("filledQty", 0)) > 0 else "open"
		order["remaining"] = remaining
		order["active"] = true
		if rest:
			state["companies"][order["ticker"]]["book"].add_resting({
				"id": String(order["id"]),
				"side": book_side_for_order(order),
				"price": float(order["limitPrice"]),
				"remaining": remaining,
				"owner": String(order.get("owner", "")),
				"action": String(order.get("action", "")),
			})
	elif remaining > 0:
		order["status"] = "partiallyFilled" if int(order.get("filledQty", 0)) > 0 else "cancelled"
		if String(order.get("reason", "")).is_empty():
			order["reason"] = "insufficientLiquidity"
		order["remaining"] = remaining
		order["active"] = false
		if keep_resting:
			state["companies"][order["ticker"]]["book"].remove_order(String(order["id"]))
	else:
		order["active"] = false
	if not String(order.get("ocoGroup", "")).is_empty():
		if ["filled", "cancelled", "rejected"].has(String(order.get("status", ""))):
			_cancel_oco_siblings(order)


func _apply_order_fill(order: Dictionary, fill: Dictionary) -> void:
	var qty := int(fill["qty"])
	if qty <= 0:
		return
	var price := float(fill["price"])
	var fee := 0.0
	if String(order.get("owner", "")) == "player":
		fee = SmaFormat.round_to(qty * price * fee_bps / 10000.0, 2)
		if not _apply_account_fill(order, qty, price, fee):
			return
	var filled_before := int(order.get("filledQty", 0))
	var filled_after := filled_before + qty
	order["filledQty"] = filled_after
	if filled_after > 0:
		order["avgPrice"] = SmaFormat.round_to(
			(float(order.get("avgPrice", 0.0)) * filled_before + qty * price) / filled_after, 4)
	else:
		order["avgPrice"] = 0.0
	order["fills"].append({"price": SmaFormat.round_to(price, 4), "qty": qty,
		"second": int(state["second"])})
	var remaining := int(order["qty"]) - filled_after
	order["remaining"] = remaining
	order["status"] = "filled" if remaining <= 0 else "partiallyFilled"


func _apply_account_fill(order: Dictionary, qty: int, price: float, fee: float) -> bool:
	var account: Dictionary = state["account"]
	var ticker := String(order["ticker"])
	var action := action_for_order(order)
	var gross := qty * price
	var realized := 0.0
	if action == "openLong":
		var position: Dictionary = account["positions"].get(ticker, {"qty": 0, "avgCost": 0.0})
		account["cash"] = float(account["cash"]) - gross - fee
		var next_qty := int(position["qty"]) + qty
		if next_qty > 0:
			position["avgCost"] = (float(position["avgCost"]) * int(position["qty"]) + gross) / next_qty
		else:
			position["avgCost"] = 0.0
		position["qty"] = next_qty
		account["positions"][ticker] = position
	elif action == "openShort":
		var short: Dictionary = account["shorts"].get(ticker,
			{"qty": 0, "avgPrice": 0.0, "openedDay": int(state["dayIndex"])})
		account["cash"] = float(account["cash"]) + gross - fee
		var next_qty := int(short["qty"]) + qty
		if next_qty > 0:
			short["avgPrice"] = (float(short["avgPrice"]) * int(short["qty"]) + gross) / next_qty
		else:
			short["avgPrice"] = 0.0
		short["qty"] = next_qty
		if not short.has("openedDay"):
			short["openedDay"] = int(state["dayIndex"])
		account["shorts"][ticker] = short
	elif action == "closeShort":
		var short: Dictionary = account["shorts"].get(ticker, {})
		if short.is_empty() or int(short.get("qty", 0)) < qty:
			order["status"] = "rejected"
			order["reason"] = "insufficientShortShares"
			return false
		account["cash"] = float(account["cash"]) - gross - fee
		realized = (float(short["avgPrice"]) - price) * qty
		account["realizedPnl"] = float(account["realizedPnl"]) + realized
		short["qty"] = int(short["qty"]) - qty
		if int(short["qty"]) <= 0:
			account["shorts"].erase(ticker)
	else:
		var position: Dictionary = account["positions"].get(ticker, {})
		if position.is_empty() or int(position.get("qty", 0)) < qty:
			order["status"] = "rejected"
			order["reason"] = "insufficientShares"
			return false
		account["cash"] = float(account["cash"]) + gross - fee
		realized = (price - float(position["avgCost"])) * qty
		account["realizedPnl"] = float(account["realizedPnl"]) + realized
		position["qty"] = int(position["qty"]) - qty
		if int(position["qty"]) <= 0:
			account["positions"].erase(ticker)
	account["fees"] = SmaFormat.round_to(float(account["fees"]) + fee, 2)
	var trade := {
		"ticker": ticker, "side": String(order.get("side", "")), "action": action,
		"qty": qty, "price": SmaFormat.round_to(price, 4), "fee": fee,
		"realized": SmaFormat.round_to(realized, 2), "orderId": String(order.get("id", "")),
		"day": int(state["dayIndex"]), "second": int(state["second"]),
		"date": _date_text(), "time": _clock_text(),
	}
	account["trades"].append(trade)
	if account["trades"].size() > ACCOUNT_TRADE_LIMIT:
		account["trades"] = account["trades"].slice(
			account["trades"].size() - ACCOUNT_TRADE_LIMIT)
	last_player_fills.append(trade.duplicate(true))
	return true


func _find_order(order_id: String) -> Dictionary:
	for order in state["orders"]:
		if String(order.get("id", "")) == order_id:
			return order
	return {}


# ---------------------------------------------------------------------------
# Conditional orders and resting liquidity
# ---------------------------------------------------------------------------

func _process_conditional_orders() -> void:
	if not _has_conditional:
		return
	var still_open := false
	for order in state["orders"]:
		if String(order.get("owner", "")) != "player":
			continue
		if not ["stop", "stopLimit", "trailing"].has(String(order.get("type", ""))):
			continue
		if String(order.get("status", "")) != "open" or order.get("active", true) == false:
			continue
		still_open = true
		if is_trading_halted(String(order["ticker"])):
			continue
		var quote_data := quote(String(order["ticker"]))
		var cs: Dictionary = state["companies"].get(String(order["ticker"]), {})
		if quote_data.is_empty() or cs.is_empty():
			continue
		var last := float(quote_data.get("last", 0.0))
		if not is_finite(last) or last <= 0.0:
			continue
		var side := book_side_for_order(order)
		if String(order["type"]) == "trailing":
			var best := float(order.get("trailBest", last))
			order["trailBest"] = maxf(best, last) if side == "sell" else minf(best, last)
			order["stopPrice"] = SmaFormat.round_to(
				float(order["trailBest"]) * (1.0 - float(order["trailPct"])) if side == "sell"
				else float(order["trailBest"]) * (1.0 + float(order["trailPct"])), 2)
		var triggered := last >= float(order["stopPrice"]) if side == "buy" else last <= float(order["stopPrice"])
		if not triggered:
			continue
		order["triggeredAt"] = {"day": int(state["dayIndex"]),
			"second": int(state["second"]), "price": SmaFormat.round_to(last, 2)}
		if String(order["type"]) == "stopLimit":
			order["triggeredFrom"] = "stopLimit"
			order["type"] = "limit"
			order["limitPrice"] = float(order["stopLimitPrice"])
		else:
			order["triggeredFrom"] = String(order["type"])
			order["type"] = "market"
			order["limitPrice"] = null
		var match_input: Dictionary = order.duplicate(true)
		match_input["side"] = side
		match_input["remaining"] = int(order["qty"]) - int(order.get("filledQty", 0))
		var result: Dictionary = cs["book"].match_order(match_input)
		_apply_fills(order, result["fills"], true, false)
		if String(order["type"]) == "market" and int(order["remaining"]) > 0:
			if String(order.get("reason", "")).is_empty():
				order["reason"] = "insufficientLiquidity"
			if String(order["status"]) == "open":
				order["status"] = "cancelled"
			order["active"] = false
	_has_conditional = still_open


func _activate_pending() -> void:
	if not _has_pending:
		return
	var still_pending := false
	for order in state["orders"]:
		if String(order.get("owner", "")) != "player" or String(order.get("status", "")) != "pending":
			continue
		still_pending = true
		var cs: Dictionary = state["companies"].get(String(order["ticker"]), {})
		if cs.is_empty():
			order["status"] = "rejected"
			order["reason"] = "order.invalid"
			order["active"] = false
			continue
		if is_trading_halted(String(order["ticker"])):
			continue
		order["status"] = "open"
		if ["stop", "stopLimit", "trailing"].has(String(order["type"])):
			continue
		var match_input: Dictionary = order.duplicate(true)
		match_input["side"] = book_side_for_order(order)
		match_input["remaining"] = int(order["qty"]) - int(order.get("filledQty", 0))
		var result: Dictionary = cs["book"].match_order(match_input)
		_apply_fills(order, result["fills"], true, false)
		if (String(order["status"]) == "open" or String(order["status"]) == "partiallyFilled"):
			if String(order["type"]) == "market" and int(order["remaining"]) > 0:
				if String(order.get("reason", "")).is_empty():
					order["reason"] = "insufficientLiquidity"
					order["status"] = "partiallyFilled" if int(order.get("filledQty", 0)) > 0 else "cancelled"
	_has_pending = still_pending


func _execute_resting() -> void:
	var tickers: Array = _resting_dirty.keys()
	_resting_dirty.clear()
	for ticker in tickers:
		var results: Array = state["companies"][ticker]["book"].match_resting()
		for outcome in results:
			var order := _find_order(String(outcome["order"]["id"]))
			if order.is_empty():
				continue
			_apply_fills(order, outcome["fills"], false, true)
	if int(state["second"]) % 5 == 0:
		for order in state["orders"]:
			if String(order.get("owner", "")) == "player":
				continue
			if not ["open", "partiallyFilled"].has(String(order.get("status", ""))):
				continue
			var expires: Variant = order.get("expiresAt", null)
			if expires != null and int(state["second"]) >= int(expires):
				state["companies"][order["ticker"]]["book"].remove_order(String(order["id"]))
				order["status"] = "cancelled"
				order["reason"] = "order.expired"
				order["active"] = false


func _prune_orders() -> void:
	if state["orders"].size() <= 500:
		return
	var keep_ids := {}
	for order in state["orders"]:
		if is_live_order(order):
			keep_ids[String(order["id"])] = true
	for trade in state["account"]["trades"]:
		keep_ids[String(trade.get("orderId", ""))] = true
	var player_done: Array = []
	var sim_done: Array = []
	for order in state["orders"]:
		if is_live_order(order):
			continue
		if String(order.get("owner", "")) == "player":
			player_done.append(order)
		else:
			sim_done.append(order)
	if player_done.size() > 500:
		player_done = player_done.slice(player_done.size() - 500)
	if sim_done.size() > 120:
		sim_done = sim_done.slice(sim_done.size() - 120)
	for order in player_done:
		keep_ids[String(order["id"])] = true
	for order in sim_done:
		keep_ids[String(order["id"])] = true
	var kept: Array = []
	for order in state["orders"]:
		if keep_ids.has(String(order["id"])):
			kept.append(order)
	state["orders"] = kept


# ---------------------------------------------------------------------------
# Simulated participants
# ---------------------------------------------------------------------------

func _update_factors(rng: SmaRng) -> void:
	state["marketFactor"] = float(state["marketFactor"]) * 0.92 + rng.normal() * 0.0009
	var factors: Dictionary = state["sectorFactors"]
	for sector in factors.keys():
		factors[sector] = float(factors[sector]) * 0.93 + rng.normal() * 0.0007
	for ticker in state["companies"].keys():
		var cs: Dictionary = state["companies"][ticker]
		if bool(cs.get("isEtf", false)) or is_trading_halted(ticker):
			continue
		var company: Dictionary = cs["company"]
		var sector_value := float(factors.get(String(company["sector"]), 0.0))
		var idio := rng.normal() * float(company["vol"]) * 0.012
		var drift := float(company["beta"]) * float(state["marketFactor"]) * 0.0012
		drift += float(company["sectorCorrelation"]) * sector_value * 0.0009 + idio
		var fair := float(cs["fairValue"]) * exp(drift)
		var base := float(company["price"])
		cs["fairValue"] = clampf(fair, base * 0.15, base * 6.0)
		_dirty_liquidity[ticker] = true
		_resting_dirty[ticker] = true


func _choose_simulated_order(ticker: String, rng: SmaRng) -> Variant:
	var cs: Dictionary = state["companies"][ticker]
	var roll := rng.next()
	if roll < 0.6:
		return {"side": "buy" if rng.next() < 0.5 else "sell",
			"type": "market", "qty": rng.rand_int(20, 320)}
	if roll < 0.85:
		var quote_data: Dictionary = quote(ticker)
		var side := "buy" if float(cs["last"]) >= float(cs["ema"]) else "sell"
		var last := float(cs["last"])
		var limit := maxf(float(quote_data.get("ask", last)), last * 1.0005)
		if side == "sell":
			limit = minf(float(quote_data.get("bid", last)), last * 0.9995)
		return {"side": side, "type": "limit", "qty": rng.rand_int(40, 500),
			"limitPrice": SmaFormat.round_to(limit, 2)}
	if float(cs["last"]) < float(cs["fairValue"]) * 0.985:
		return {"side": "buy", "type": "limit", "qty": rng.rand_int(80, 650),
			"limitPrice": SmaFormat.round_to(float(cs["fairValue"]) * 0.995, 2)}
	if float(cs["last"]) > float(cs["fairValue"]) * 1.015:
		return {"side": "sell", "type": "limit", "qty": rng.rand_int(80, 650),
			"limitPrice": SmaFormat.round_to(float(cs["fairValue"]) * 1.005, 2)}
	return null


func _run_simulated_traders(rng: SmaRng) -> void:
	var tickers: Array = state["companies"].keys()
	var count := 2 + rng.rand_int(0, 3)
	for index in count:
		var ticker := String(tickers[rng.rand_int(0, tickers.size() - 1)])
		if is_trading_halted(ticker):
			continue
		var intent: Variant = _choose_simulated_order(ticker, rng)
		if intent == null:
			continue
		submit_order({
			"ticker": ticker,
			"side": String(intent["side"]),
			"type": String(intent["type"]),
			"qty": int(intent["qty"]),
			"limitPrice": float(intent.get("limitPrice", 0.0)),
			"owner": "sim:%s" % TRADER_TYPES[rng.rand_int(0, TRADER_TYPES.size() - 1)],
		})


# ---------------------------------------------------------------------------
# Risk
# ---------------------------------------------------------------------------

func check_margin() -> Dictionary:
	var result := SmaMargin.evaluate_margin_call(state)
	if not bool(result["liquidate"]):
		return result
	for order in state["orders"]:
		if String(order.get("owner", "")) != "player" or not is_live_order(order):
			continue
		var cs: Dictionary = state["companies"].get(String(order["ticker"]), {})
		if not cs.is_empty():
			cs["book"].remove_order(String(order["id"]))
		order["status"] = "cancelled"
		order["reason"] = "marginCall"
		order["active"] = false
	for step in 12:
		var snapshot := SmaMargin.margin_snapshot(state)
		if float(snapshot["maintenanceExcess"]) >= 0.0 and float(snapshot["equity"]) > 0.0:
			break
		var target: Variant = SmaMargin.next_liquidation_target(state)
		if target == null:
			break
		var submitted := submit_order({
			"ticker": String(target["ticker"]),
			"side": "sell" if String(target["action"]) == "closeLong" else "cover",
			"action": String(target["action"]), "type": "market",
			"qty": int(target["qty"]), "owner": "player",
		})
		if not bool(submitted["ok"]) or int(submitted["order"].get("filledQty", 0)) <= 0:
			break
		SmaMargin.record_forced_liquidation(state, {
			"ticker": String(target["ticker"]),
			"action": String(target["action"]),
			"qty": int(submitted["order"].get("filledQty", 0)),
			"price": float(submitted["order"].get("avgPrice", 0.0)),
			"orderId": String(submitted["order"]["id"]),
		})
	var after := SmaMargin.margin_snapshot(state)
	if float(after["equity"]) >= float(after["maintenanceRequirement"]):
		SmaMargin.close_margin_call(state, "liquidated")
	elif state["account"]["margin"].get("call", null) != null:
		state["account"]["margin"]["call"]["dueDay"] = int(state["dayIndex"])
	return result


# ---------------------------------------------------------------------------
# Clock
# ---------------------------------------------------------------------------

func advance_second() -> void:
	last_player_fills = []
	var rng := SmaRng.new(String(state["seed"]))
	rng.set_state(state["rngState"])
	state["second"] = int(state["second"]) + 1
	state["stats"]["seconds"] = int(state["stats"]["seconds"]) + 1
	if int(state["second"]) >= SESSION_SECONDS:
		_close_session(rng)
		return
	if int(state["second"]) % 30 == 0:
		_update_factors(rng)
	_flush_liquidity()
	_process_conditional_orders()
	_activate_pending()
	_execute_resting()
	_run_simulated_traders(rng)
	_flush_liquidity()
	if int(state["second"]) % 10 == 0:
		check_margin()
	_prune_orders()
	state["rngState"] = rng.get_state()


## Applies pending ladder changes. Resting matches for the same tickers stay
## queued for _execute_resting so factors and inventory shifts are respected.
func _flush_liquidity() -> void:
	for ticker in _dirty_liquidity.keys():
		refresh_liquidity(String(ticker))
	_dirty_liquidity.clear()


func _date_text() -> String:
	var day := int(state["dayIndex"])
	if _cached_day != day:
		_cached_day = day
		_cached_date = SmaCalendar.iso_date(day)
	return _cached_date


func _clock_text() -> String:
	var second := int(state["second"])
	if _cached_clock_second != second:
		_cached_clock_second = second
		_cached_clock = SmaCalendar.session_clock(second)
	return _cached_clock


func _close_session(rng: SmaRng) -> void:
	var session_day := int(state["dayIndex"])
	var date := SmaCalendar.iso_date(session_day)
	for order in state["orders"]:
		if String(order.get("owner", "")) == "player":
			continue
		if not ["open", "partiallyFilled"].has(String(order.get("status", ""))):
			continue
		var cs: Dictionary = state["companies"].get(String(order["ticker"]), {})
		if not cs.is_empty():
			cs["book"].remove_order(String(order["id"]))
		order["status"] = "cancelled"
		order["reason"] = "sessionEnd"
		order["active"] = false
	for ticker in state["companies"].keys():
		var cs: Dictionary = state["companies"][ticker]
		SmaMinuteSeries.finalize_day(cs["series"], date)
		cs["prevClose"] = cs["last"]
		cs["open"] = cs["last"]
		cs["high"] = cs["last"]
		cs["low"] = cs["last"]
		cs["volume"] = 0
		cs["trades"] = 0
		cs["inventory"] = 0.0
	state["dayIndex"] = int(state["dayIndex"]) + 1
	state["second"] = 0
	state["corporateEvents"] = SmaCorporate.apply_session_open(state)
	state["newsToday"] = SmaNews.maybe_emit(state, rng)
	_pay_dividends()
	SmaEtfs.mark(state["companies"])
	state["optionSettlements"] = []
	state["earlyAssignments"] = []
	if not state["account"].get("options", []).is_empty():
		state["optionSettlements"] = SmaOptions.settle_expired(
			state["account"], _option_spots(), int(state["dayIndex"]))
		if option_style() == "american":
			state["earlyAssignments"] = SmaOptions.assign_early(
				state["account"], _option_spots(), int(state["dayIndex"]))
	if not state["account"].get("futures", []).is_empty():
		state["futuresVariation"] = SmaFutures.apply_variation(
			state["account"], _futures_spots(), session_day)
		state["futuresSettlements"] = SmaFutures.settle_expired(
			state["account"], _futures_spots(), int(state["dayIndex"]))
	var macro_context := SmaMacro.world(session_day, String(state["seed"]))
	SmaBonds.mark(state["account"], macro_context)
	var fx_mark := SmaFx.rates(session_day, String(state["seed"]), macro_context)
	SmaFx.mark(state["account"], fx_mark)
	var commodity_marks := {}
	for definition in SmaCommodities.DEFS:
		commodity_marks[String(definition["id"])] = SmaCommodities.price(
			definition, session_day, String(state["seed"]), macro_context)
	SmaCommodities.mark(state["account"], commodity_marks)
	var crypto_marks := {}
	for crypto_definition in SmaCrypto.DEFS:
		crypto_marks[String(crypto_definition["id"])] = SmaCrypto.price(
			crypto_definition, session_day, String(state["seed"]), macro_context)
	SmaCrypto.mark(state["account"], crypto_marks)
	state["bondCoupons"] = SmaBonds.apply_coupons(state["account"], session_day)
	for ticker in state["companies"].keys():
		refresh_liquidity(ticker)
	_dirty_liquidity.clear()
	_resting_dirty.clear()
	var last_accrual := int(state["account"]["margin"].get("lastAccrualDay", 0))
	SmaMargin.accrue_margin_charges(state, int(state["dayIndex"]) - last_accrual)
	check_margin()
	record_equity_snapshot()
	state["rngState"] = rng.get_state()


## Quarterly cash dividends on long positions; shorts pay them instead. Prices
## drop by the distribution, so total equity is unchanged at the open.
func _pay_dividends() -> void:
	var day := int(state["dayIndex"])
	if day <= 0 or day % SmaCalendar.QUARTER_DAYS != 0:
		return
	var account: Dictionary = state["account"]
	var dividends: Array = account.get("dividends", [])
	var quarter := int(day / SmaCalendar.QUARTER_DAYS) - 1
	for ticker in state["companies"].keys():
		var cs: Dictionary = state["companies"][ticker]
		if bool(cs.get("isEtf", false)) or bool(cs.get("delisted", false)):
			continue
		var company: Dictionary = cs["company"]
		var annual := float(company.get("financials", {}).get("dividendPerShare", 0.0))
		var split := maxf(0.0001, float(cs["splitFactor"]))
		var dps := annual / 4.0 / split
		if dps <= 0.0:
			continue
		var long_qty := int(account["positions"].get(ticker, {}).get("qty", 0))
		if long_qty > 0:
			var amount := SmaFormat.round_to(float(long_qty) * dps, 2)
			account["cash"] = SmaFormat.round_to(float(account["cash"]) + amount, 2)
			dividends.append({"ticker": ticker, "qty": long_qty,
				"dps": SmaFormat.round_to(dps, 4), "amount": amount,
				"quarter": quarter, "day": day})
		var short_qty := int(account["shorts"].get(ticker, {}).get("qty", 0))
		if short_qty > 0:
			var amount := SmaFormat.round_to(float(short_qty) * dps, 2)
			account["cash"] = SmaFormat.round_to(float(account["cash"]) - amount, 2)
			dividends.append({"ticker": ticker, "qty": short_qty,
				"dps": SmaFormat.round_to(dps, 4), "amount": -amount,
				"type": "short", "side": "short", "quarter": quarter, "day": day})
		var drop := minf(dps, maxf(0.0, float(cs["last"]) - 0.01))
		for field in ["last", "fairValue", "prevClose", "open", "high", "low", "ema"]:
			cs[field] = maxf(0.01, float(cs[field]) - drop)
	if dividends.size() > 300:
		dividends = dividends.slice(dividends.size() - 300)
	account["dividends"] = dividends


func advance_seconds(count: int = 1) -> void:
	for index in maxi(1, count):
		advance_second()


func clear_player_fills() -> void:
	last_player_fills.clear()


func advance_minute() -> void:
	advance_seconds(60)


## Completes the current session and rolls into the next trading day.
func advance_day() -> void:
	var remaining := maxi(1, SESSION_SECONDS - int(state["second"]))
	for index in remaining:
		advance_second()


# ---------------------------------------------------------------------------
# Read models
# ---------------------------------------------------------------------------

func equity() -> float:
	var account: Dictionary = state["account"]
	var value := float(account["cash"])
	for ticker in account["positions"].keys():
		var cs: Dictionary = state["companies"].get(ticker, {})
		value += int(account["positions"][ticker]["qty"]) * float(cs.get("last", 0.0))
	for ticker in account["shorts"].keys():
		var cs: Dictionary = state["companies"].get(ticker, {})
		value -= int(account["shorts"][ticker]["qty"]) * float(cs.get("last", 0.0))
	value += SmaOptions.option_value(account, _option_spots(), int(state["dayIndex"]))
	value += SmaFutures.unrealized_pnl(account, _futures_spots(), int(state["dayIndex"]))
	var day := int(state["dayIndex"])
	var macro := SmaMacro.world(day, String(state["seed"]))
	for position in account.get("bonds", []):
		var bond := SmaBonds.bond_def(String(position.get("id", "")))
		if not bond.is_empty():
			value += SmaBonds.bond_price(bond, macro) * float(position.get("qty", 0))
	var fx_rates := SmaFx.rates(day, String(state["seed"]), macro)
	for position in account.get("fx", []):
		var pair_id := String(position.get("id", ""))
		value += float(position.get("units", 0)) * float(fx_rates.get(pair_id, 0.0))
	for position in account.get("commodities", []):
		var definition: Dictionary = SmaCommodities.definition(
			String(position.get("id", "")))
		value += float(position.get("qty", 0)) * SmaCommodities.price(
			definition, day, String(state["seed"]), macro)
	for position in account.get("crypto", []):
		var crypto_def: Dictionary = SmaCrypto.definition(String(position.get("id", "")))
		value += float(position.get("units", 0.0)) * SmaCrypto.price(
			crypto_def, day, String(state["seed"]), macro)
	return SmaFormat.round_to(value, 2)


func _option_spots() -> Dictionary:
	var spots := {}
	for position in state["account"].get("options", []):
		var ticker := String(position.get("ticker", ""))
		if ticker == "" or spots.has(ticker):
			continue
		spots[ticker] = float(state["companies"].get(ticker, {}).get("last", 0.0))
	return spots


func _futures_spots() -> Dictionary:
	var spots := {}
	for position in state["account"].get("futures", []):
		var ticker := String(position.get("ticker", ""))
		if ticker == "" or spots.has(ticker):
			continue
		spots[ticker] = float(state["companies"].get(ticker, {}).get("last", 0.0))
	return spots


func record_equity_snapshot() -> void:
	var history: Array = state["account"]["equityHistory"]
	var point := {"day": int(state["dayIndex"]), "equity": equity()}
	if not history.is_empty() and int(history[-1]["day"]) == int(point["day"]):
		history[-1] = point
	else:
		history.append(point)
	if history.size() > HISTORY_LIMIT:
		history = history.slice(history.size() - HISTORY_LIMIT)
		state["account"]["equityHistory"] = history


func position_rows() -> Array:
	var rows: Array = []
	for ticker in state["account"]["positions"].keys():
		var position: Dictionary = state["account"]["positions"][ticker]
		var last := float(state["companies"].get(ticker, {}).get("last", 0.0))
		var qty := int(position["qty"])
		rows.append({
			"ticker": ticker,
			"name": String(state["companies"][ticker]["company"]["name"]),
			"qty": qty,
			"avgCost": SmaFormat.round_to(float(position["avgCost"]), 4),
			"last": last,
			"marketValue": SmaFormat.round_to(qty * last, 2),
			"unrealized": SmaFormat.round_to((last - float(position["avgCost"])) * qty, 2),
		})
	rows.sort_custom(func(a, b): return float(a["marketValue"]) > float(b["marketValue"]))
	return rows


func short_rows() -> Array:
	var rows: Array = []
	for ticker in state["account"]["shorts"].keys():
		var short: Dictionary = state["account"]["shorts"][ticker]
		var last := float(state["companies"].get(ticker, {}).get("last", 0.0))
		var qty := int(short["qty"])
		rows.append({
			"ticker": ticker,
			"name": String(state["companies"][ticker]["company"]["name"]),
			"qty": qty,
			"avgPrice": SmaFormat.round_to(float(short["avgPrice"]), 4),
			"last": last,
			"marketValue": SmaFormat.round_to(qty * last, 2),
			"unrealized": SmaFormat.round_to((float(short["avgPrice"]) - last) * qty, 2),
			"openedDay": int(short.get("openedDay", 0)),
		})
	rows.sort_custom(func(a, b): return float(a["marketValue"]) > float(b["marketValue"]))
	return rows


func open_order_rows(order_owner: String = "player") -> Array:
	var rows: Array = []
	for order in state["orders"]:
		if String(order.get("owner", "")) == order_owner and is_live_order(order):
			rows.append(order)
	return rows


func get_candles(ticker: String, timeframe: String = "1m") -> Array:
	var cs: Dictionary = state["companies"].get(ticker.to_upper(), {})
	if cs.is_empty():
		return []
	return SmaMinuteSeries.candles(cs["series"], timeframe, SmaCalendar.iso_date(int(state["dayIndex"])))


func get_book(ticker: String, level_count: int = 6) -> Dictionary:
	var cs: Dictionary = state["companies"].get(ticker.to_upper(), {})
	if cs.is_empty():
		return {"ticker": ticker, "bids": [], "asks": []}
	return cs["book"].snapshot(level_count)


func apply_cash_adjustment(amount: float, memo: String = "") -> void:
	if is_zero_approx(amount):
		return
	state["account"]["cash"] = SmaFormat.round_to(float(state["account"]["cash"]) + amount, 2)
	state["account"]["adjustments"].append({
		"day": int(state["dayIndex"]), "amount": SmaFormat.round_to(amount, 2), "memo": memo,
	})
	if state["account"]["adjustments"].size() > 120:
		state["account"]["adjustments"] = state["account"]["adjustments"].slice(
			state["account"]["adjustments"].size() - 120)
	record_equity_snapshot()


func company(ticker: String) -> Dictionary:
	return state["companies"].get(ticker.to_upper(), {}).get("company", {})


# ---------------------------------------------------------------------------
# Options desk
# ---------------------------------------------------------------------------

func option_chain(ticker: String) -> Dictionary:
	var symbol := ticker.to_upper()
	var company_data := company(symbol)
	if company_data.is_empty():
		return {}
	return SmaOptions.build_chain(company_data, symbol, quote(symbol), int(state["dayIndex"]))


## European settles only at expiry; American also allows deterministic early
## assignment for deep in-the-money short legs.
func option_style() -> String:
	return String(state.get("optionStyle", "european"))


func set_option_style(style: String) -> Dictionary:
	if not ["european", "american"].has(style):
		return {"ok": false, "error": "exchange.error.option.style"}
	if not state["account"].get("options", []).is_empty():
		return {"ok": false, "error": "exchange.error.option.styleLocked"}
	state["optionStyle"] = style
	return {"ok": true, "style": style}


func option_fee(contract: Dictionary, qty: int) -> float:
	var gross := float(contract.get("premium", 0.0)) * SmaOptions.CONTRACT_SIZE * maxi(0, qty)
	return SmaFormat.round_to(gross * fee_bps / 10000.0, 2)


func option_collateral() -> float:
	return SmaOptions.option_collateral(state["account"], _option_spots())


## Cash left for new option collateral after stock orders and existing shorts.
func available_option_cash() -> float:
	return maxf(0.0, SmaFormat.round_to(available_cash() - option_collateral(), 2))


## Shares not reserved by stock sells or already covering short calls.
func available_covered_shares(ticker: String) -> int:
	var symbol := ticker.to_upper()
	var short_calls := 0
	for position in state["account"].get("options", []):
		if String(position.get("ticker", "")) != symbol:
			continue
		if String(position.get("type", "")) != "call":
			continue
		var qty := int(position.get("qty", 0))
		if qty < 0:
			short_calls += -qty
	return maxi(0, available_shares(symbol) - short_calls * SmaOptions.CONTRACT_SIZE)


func buy_option(ticker: String, option_type: String, strike: float, expiry_day: int,
		qty: int) -> Dictionary:
	var chain := option_chain(ticker)
	var contract := SmaOptions.find_contract(chain, option_type, strike, expiry_day)
	if contract.is_empty():
		return {"ok": false, "error": "error.contractNotFound"}
	var fee := option_fee(contract, qty)
	var gross := float(contract.get("premium", 0.0)) * SmaOptions.CONTRACT_SIZE * maxi(0, qty)
	if gross + fee > available_cash() + 0.000000001:
		return {"ok": false, "error": "error.insufficientCash"}
	return SmaOptions.buy_option(state["account"], contract, qty, fee,
		int(state["dayIndex"]), int(state["second"]))


func sell_option(ticker: String, option_type: String, strike: float, expiry_day: int,
		qty: int) -> Dictionary:
	var chain := option_chain(ticker)
	var contract := SmaOptions.find_contract(chain, option_type, strike, expiry_day)
	if contract.is_empty():
		return {"ok": false, "error": "error.contractNotFound"}
	var quantity := int(floor(float(qty)))
	if quantity <= 0:
		return {"ok": false, "error": "error.qtyInvalid"}
	var cash_room := available_option_cash()
	if option_type == "put":
		if strike * SmaOptions.CONTRACT_SIZE * quantity > cash_room + 0.000000001:
			return {"ok": false, "error": "error.insufficientOptionCollateral"}
	else:
		var covered := available_covered_shares(ticker)
		var naked := maxi(0, quantity - int(floor(float(covered) / float(SmaOptions.CONTRACT_SIZE))))
		var spot := float(quote(ticker).get("last", 0.0))
		if float(naked) * spot * SmaOptions.CONTRACT_SIZE * 0.2 > cash_room + 0.000000001:
			return {"ok": false, "error": "error.insufficientOptionCollateral"}
	var fee := option_fee(contract, quantity)
	return SmaOptions.sell_option(state["account"], contract, quantity, fee,
		int(state["dayIndex"]), int(state["second"]))


## Apply several option legs atomically. Used by strategy presets; the account
## is restored if any leg fails.
func execute_option_legs(legs: Array) -> Dictionary:
	var snapshot: Dictionary = state["account"].duplicate(true)
	var trades: Array = []
	for leg in legs:
		var contract: Dictionary = leg["contract"]
		var quantity := int(leg.get("qty", 1))
		var fee := option_fee(contract, quantity)
		var result: Dictionary
		if String(leg.get("side", "buy")) == "sell":
			result = SmaOptions.sell_option(state["account"], contract, quantity, fee,
				int(state["dayIndex"]), int(state["second"]))
		else:
			result = SmaOptions.buy_option(state["account"], contract, quantity, fee,
				int(state["dayIndex"]), int(state["second"]))
		if not bool(result.get("ok", false)):
			state["account"] = snapshot
			return result
		trades.append(result["trade"])
	return {"ok": true, "trades": trades}


func close_option(key: String, qty: int) -> Dictionary:
	var position: Dictionary = {}
	for entry in state["account"].get("options", []):
		if String(entry.get("key", "")) == key:
			position = entry
			break
	if position.is_empty():
		return {"ok": false, "error": "error.noOptionPosition"}
	var held := int(position.get("qty", 0))
	var actual := mini(maxi(0, qty), absi(held))
	if actual <= 0:
		return {"ok": false, "error": "error.qtyInvalid"}
	var spot := float(state["companies"].get(String(position["ticker"]), {}).get("last", 0.0))
	var mark := SmaOptions.option_quote_value(position, spot, int(state["dayIndex"]))
	var fee := SmaFormat.round_to(float(mark["price"]) * SmaOptions.CONTRACT_SIZE
		* actual * fee_bps / 10000.0, 2)
	if held < 0:
		var cost := SmaFormat.round_to(float(mark["price"]) * SmaOptions.CONTRACT_SIZE
			* actual + fee, 2)
		if cost > available_cash() + 0.000000001:
			return {"ok": false, "error": "error.insufficientCash"}
	return SmaOptions.close_option(state["account"], key, qty, float(mark["price"]), fee,
		int(state["dayIndex"]), int(state["second"]))


## Physical exercise on expiry day; the contract pays its intrinsic value into
## delivered shares at the strike instead of cash.
func exercise_option(key: String, qty: int) -> Dictionary:
	var position: Dictionary = {}
	for entry in state["account"].get("options", []):
		if String(entry.get("key", "")) == key:
			position = entry
			break
	if position.is_empty():
		return {"ok": false, "error": "exchange.error.option.noPosition"}
	var spot := float(state["companies"].get(String(position["ticker"]), {}).get("last", 0.0))
	return SmaOptions.exercise_option(state["account"], key, qty, spot,
		int(state["dayIndex"]))


func option_rows() -> Array:
	return SmaOptions.option_rows(state["account"], _option_spots(), int(state["dayIndex"]))


# ---------------------------------------------------------------------------
# Futures desk
# ---------------------------------------------------------------------------

func futures_chain(ticker: String) -> Dictionary:
	var symbol := ticker.to_upper()
	var company_data := company(symbol)
	if company_data.is_empty():
		return {}
	return SmaFutures.build_chain(symbol, quote(symbol), int(state["dayIndex"]))


func futures_contract(ticker: String, expiry_days: int) -> Dictionary:
	return SmaFutures.find_contract(futures_chain(ticker), expiry_days)


func futures_fee(contract: Dictionary, qty: int) -> float:
	var gross := float(contract.get("price", 0.0)) * SmaFutures.MULTIPLIER * maxi(0, qty)
	return SmaFormat.round_to(gross * fee_bps / 10000.0, 2)


func futures_margin() -> float:
	return SmaFutures.futures_margin(state["account"])


func available_futures_cash() -> float:
	return maxf(0.0, SmaFormat.round_to(available_cash() - futures_margin(), 2))


func open_future(ticker: String, expiry_days: int, side: String, qty: int) -> Dictionary:
	var contract := futures_contract(ticker, expiry_days)
	if contract.is_empty():
		return {"ok": false, "error": "error.contractNotFound"}
	var quantity := int(floor(float(qty)))
	if quantity <= 0:
		return {"ok": false, "error": "error.qtyInvalid"}
	var margin := SmaFormat.round_to(float(contract.get("margin", 0.0)) * float(quantity), 2)
	if margin > available_futures_cash() + 0.000000001:
		return {"ok": false, "error": "error.insufficientFuturesMargin"}
	var fee := futures_fee(contract, quantity)
	return SmaFutures.open_future(state["account"], contract, side, quantity, fee,
		int(state["dayIndex"]), int(state["second"]))


func close_future(key: String, qty: int) -> Dictionary:
	var position: Dictionary = {}
	for entry in state["account"].get("futures", []):
		if String(entry.get("key", "")) == key:
			position = entry
			break
	if position.is_empty():
		return {"ok": false, "error": "error.noFuturesPosition"}
	var held := int(position.get("qty", 0))
	var actual := mini(maxi(0, qty), held)
	if actual <= 0:
		return {"ok": false, "error": "error.qtyInvalid"}
	var spot := float(state["companies"].get(String(position["ticker"]), {}).get("last", 0.0))
	var current := SmaFutures.current_price(position, spot, int(state["dayIndex"]))
	var fee := SmaFormat.round_to(current * SmaFutures.MULTIPLIER * float(actual)
		* fee_bps / 10000.0, 2)
	return SmaFutures.close_future(state["account"], key, qty, current, fee,
		int(state["dayIndex"]), int(state["second"]))


func futures_rows() -> Array:
	return SmaFutures.position_rows(state["account"], _futures_spots(), int(state["dayIndex"]))


# ---------------------------------------------------------------------------
# Multi-asset desk: bonds, FX, commodities and crypto
# ---------------------------------------------------------------------------

func macro_world() -> Dictionary:
	return SmaMacro.world(int(state["dayIndex"]), String(state["seed"]))


func news_items() -> Array:
	return state.get("news", [])


func news_today() -> Array:
	return state.get("newsToday", [])


func corporate_actions(limit: int = 8) -> Array:
	return SmaCorporate.recent_actions(state, limit)


func rights_offerings() -> Array:
	return SmaCorporate.open_rights(state, int(state["dayIndex"]))


func subscribe_rights(offering_id: String) -> Dictionary:
	return SmaCorporate.subscribe_rights(state, offering_id, int(state["dayIndex"]))


func decline_rights(offering_id: String) -> Dictionary:
	return SmaCorporate.decline_rights(state, offering_id)


func market_index() -> float:
	return _market_index_from("last")


func market_index_change() -> float:
	var current := _market_index_from("last")
	var previous := _market_index_from("prevClose")
	if previous <= 0.0:
		return 0.0
	return SmaFormat.round_to((current / previous - 1.0) * 100.0, 2)


func _market_index_from(field: String) -> float:
	var total := 0.0
	var count := 0
	for ticker in state["companies"].keys():
		var cs: Dictionary = state["companies"][ticker]
		var base := float(cs["company"].get("price", 0.0))
		if base <= 0.0:
			continue
		total += float(cs.get(field, base)) / base
		count += 1
	if count == 0:
		return 0.0
	return SmaFormat.round_to(1000.0 * total / float(count), 2)


func macro_calendar() -> Array:
	return SmaMacro.calendar(int(state["dayIndex"]), String(state["seed"]))


func global_markets() -> Array:
	return SmaMacro.global_markets(market_index(), market_index_change(),
		int(state["dayIndex"]), String(state["seed"]))


func bond_quotes() -> Array:
	return SmaBonds.quote_rows(macro_world())


func buy_bond(bond_id: String, qty: int) -> Dictionary:
	var bond := SmaBonds.bond_def(bond_id)
	if bond.is_empty():
		return {"ok": false, "error": "bond.errorUnknown"}
	var price := SmaBonds.bond_price(bond, macro_world())
	var fee := SmaFormat.round_to(price * float(maxi(0, qty)) * fee_bps / 10000.0, 2)
	return SmaBonds.buy(state["account"], bond, macro_world(), qty, fee,
		int(state["dayIndex"]))


func sell_bond(bond_id: String, qty: int) -> Dictionary:
	var macro := macro_world()
	var bond := SmaBonds.bond_def(bond_id)
	if bond.is_empty():
		return {"ok": false, "error": "bond.errorUnknown"}
	var price := SmaBonds.bond_price(bond, macro)
	var fee := SmaFormat.round_to(price * float(maxi(0, qty)) * fee_bps / 10000.0, 2)
	return SmaBonds.sell(state["account"], bond_id, macro, qty, fee)


func bond_rows() -> Array:
	var macro := macro_world()
	var rows: Array = []
	for position in state["account"].get("bonds", []):
		var bond := SmaBonds.bond_def(String(position.get("id", "")))
		var price := SmaBonds.bond_price(bond, macro)
		var qty := int(position.get("qty", 0))
		var value := price * float(qty)
		var basis := float(position.get("costBasis", 0.0))
		var row: Dictionary = position.duplicate(true)
		row["currentPrice"] = price
		row["value"] = SmaFormat.round_to(value, 2)
		row["pnl"] = SmaFormat.round_to(value - basis, 2)
		row["pnlPct"] = SmaFormat.round_to((value - basis) / basis * 100.0, 2) \
			if basis > 0.0 else 0.0
		rows.append(row)
	return rows


func fx_quotes() -> Array:
	var macro := macro_world()
	var previous_macro := SmaMacro.world(maxi(0, int(state["dayIndex"]) - 1),
		String(state["seed"]))
	var current := SmaFx.rates(int(state["dayIndex"]), String(state["seed"]), macro)
	var previous := SmaFx.rates(maxi(0, int(state["dayIndex"]) - 1),
		String(state["seed"]), previous_macro)
	var rows: Array = []
	for entry in SmaFx.PAIRS:
		var pair_id := String(entry["id"])
		var rate_value := float(current.get(pair_id, 0.0))
		var previous_value := float(previous.get(pair_id, rate_value))
		var row: Dictionary = entry.duplicate(true)
		row["rate"] = rate_value
		row["changePct"] = SmaFormat.round_to((rate_value / previous_value - 1.0) * 100.0, 2) \
			if previous_value > 0.0 else 0.0
		rows.append(row)
	return rows


func buy_fx(pair_id: String, units: int) -> Dictionary:
	var rates := SmaFx.rates(int(state["dayIndex"]), String(state["seed"]), macro_world())
	var rate_value := float(rates.get(pair_id, 0.0))
	var fee := SmaFormat.round_to(rate_value * float(maxi(0, units)) * fee_bps / 10000.0, 2)
	return SmaFx.buy(state["account"], pair_id, rates, units, fee, int(state["dayIndex"]))


func sell_fx(pair_id: String, units: int) -> Dictionary:
	var rates := SmaFx.rates(int(state["dayIndex"]), String(state["seed"]), macro_world())
	var rate_value := float(rates.get(pair_id, 0.0))
	var fee := SmaFormat.round_to(rate_value * float(maxi(0, units)) * fee_bps / 10000.0, 2)
	return SmaFx.sell(state["account"], pair_id, rates, units, fee)


func fx_rows() -> Array:
	var rates := SmaFx.rates(int(state["dayIndex"]), String(state["seed"]), macro_world())
	var rows: Array = []
	for position in state["account"].get("fx", []):
		var pair_id := String(position.get("id", ""))
		var rate_value := float(rates.get(pair_id, position.get("currentRate", 0.0)))
		var units := float(position.get("units", 0))
		var value := units * rate_value
		var basis := float(position.get("costBasis", 0.0))
		var row: Dictionary = position.duplicate(true)
		row["currentRate"] = rate_value
		row["value"] = SmaFormat.round_to(value, 2)
		row["pnl"] = SmaFormat.round_to(value - basis, 2)
		row["pnlPct"] = SmaFormat.round_to((value - basis) / basis * 100.0, 2) \
			if basis > 0.0 else 0.0
		rows.append(row)
	return rows


func commodity_quotes() -> Array:
	var day := int(state["dayIndex"])
	var macro := macro_world()
	var previous_macro := SmaMacro.world(maxi(0, day - 1), String(state["seed"]))
	return SmaCommodities.quotes(day, String(state["seed"]), macro, previous_macro)


func buy_commodity(commodity_id: String, qty: int) -> Dictionary:
	var definition := SmaCommodities.definition(commodity_id)
	if definition.is_empty():
		return {"ok": false, "error": "commodity.errorUnknown"}
	var current_price := SmaCommodities.price(definition, int(state["dayIndex"]),
		String(state["seed"]), macro_world())
	var fee := SmaFormat.round_to(current_price * float(maxi(0, qty)) * fee_bps / 10000.0, 2)
	return SmaCommodities.buy(state["account"], commodity_id, current_price, qty, fee,
		int(state["dayIndex"]))


func sell_commodity(commodity_id: String, qty: int) -> Dictionary:
	var definition := SmaCommodities.definition(commodity_id)
	if definition.is_empty():
		return {"ok": false, "error": "commodity.errorUnknown"}
	var current_price := SmaCommodities.price(definition, int(state["dayIndex"]),
		String(state["seed"]), macro_world())
	var fee := SmaFormat.round_to(current_price * float(maxi(0, qty)) * fee_bps / 10000.0, 2)
	return SmaCommodities.sell(state["account"], commodity_id, current_price, qty, fee)


func commodity_rows() -> Array:
	var rows: Array = []
	for position in state["account"].get("commodities", []):
		var definition := SmaCommodities.definition(String(position.get("id", "")))
		var current_price := SmaCommodities.price(definition, int(state["dayIndex"]),
			String(state["seed"]), macro_world())
		var qty := int(position.get("qty", 0))
		var value := current_price * float(qty)
		var basis := float(position.get("costBasis", 0.0))
		var row: Dictionary = position.duplicate(true)
		row["currentPrice"] = current_price
		row["value"] = SmaFormat.round_to(value, 2)
		row["pnl"] = SmaFormat.round_to(value - basis, 2)
		row["pnlPct"] = SmaFormat.round_to((value - basis) / basis * 100.0, 2) \
			if basis > 0.0 else 0.0
		rows.append(row)
	return rows


func crypto_quotes() -> Array:
	var day := int(state["dayIndex"])
	var macro := macro_world()
	var previous_macro := SmaMacro.world(maxi(0, day - 1), String(state["seed"]))
	return SmaCrypto.quotes(day, String(state["seed"]), macro, previous_macro)


func buy_crypto(crypto_id: String, units: float) -> Dictionary:
	var definition := SmaCrypto.definition(crypto_id)
	if definition.is_empty():
		return {"ok": false, "error": "crypto.errorUnknown"}
	var current_price := SmaCrypto.price(definition, int(state["dayIndex"]),
		String(state["seed"]), macro_world())
	var fee := SmaFormat.round_to(current_price * maxf(0.0, units) * fee_bps / 10000.0, 2)
	return SmaCrypto.buy(state["account"], crypto_id, current_price, units, fee,
		int(state["dayIndex"]))


func sell_crypto(crypto_id: String, units: float) -> Dictionary:
	var definition := SmaCrypto.definition(crypto_id)
	if definition.is_empty():
		return {"ok": false, "error": "crypto.errorUnknown"}
	var current_price := SmaCrypto.price(definition, int(state["dayIndex"]),
		String(state["seed"]), macro_world())
	var fee := SmaFormat.round_to(current_price * maxf(0.0, units) * fee_bps / 10000.0, 2)
	return SmaCrypto.sell(state["account"], crypto_id, current_price, units, fee)


func crypto_rows() -> Array:
	var rows: Array = []
	for position in state["account"].get("crypto", []):
		var definition := SmaCrypto.definition(String(position.get("id", "")))
		var current_price := SmaCrypto.price(definition, int(state["dayIndex"]),
			String(state["seed"]), macro_world())
		var units := float(position.get("units", 0.0))
		var value := current_price * units
		var basis := float(position.get("costBasis", 0.0))
		var row: Dictionary = position.duplicate(true)
		row["currentPrice"] = current_price
		row["value"] = SmaFormat.round_to(value, 2)
		row["pnl"] = SmaFormat.round_to(value - basis, 2)
		row["pnlPct"] = SmaFormat.round_to((value - basis) / basis * 100.0, 2) \
			if basis > 0.0 else 0.0
		rows.append(row)
	return rows


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

func to_dict() -> Dictionary:
	var companies := {}
	for ticker in state["companies"].keys():
		var cs: Dictionary = state["companies"][ticker]
		companies[ticker] = {
			"fairValue": cs["fairValue"],
			"last": cs["last"],
			"prevClose": cs["prevClose"],
			"open": cs["open"],
			"high": cs["high"],
			"low": cs["low"],
			"volume": cs["volume"],
			"trades": cs["trades"],
			"inventory": cs["inventory"],
			"ema": cs["ema"],
			"series": cs["series"],
			"splitFactor": cs["splitFactor"],
			"capitalFactor": cs["capitalFactor"],
			"haltedUntilDay": cs["haltedUntilDay"],
			"delisted": cs["delisted"],
			"book": cs["book"].to_dict(),
		}
	return {
		"version": SAVE_VERSION,
		"seed": state["seed"],
		"rngState": state["rngState"],
		"feeBps": fee_bps,
		"dayIndex": state["dayIndex"],
		"second": state["second"],
		"nextOrderId": state["nextOrderId"],
		"marketFactor": state["marketFactor"],
		"sectorFactors": state["sectorFactors"],
		"optionStyle": state.get("optionStyle", "european"),
		"etfTickers": state.get("etfTickers", SmaEtfs.tickers()),
		"companies": companies,
		"orders": state["orders"],
		"trades": state["trades"],
		"news": state.get("news", []),
		"newsSeq": int(state.get("newsSeq", 1)),
		"corporateActions": state.get("corporateActions", []),
		"rightsOfferings": state.get("rightsOfferings", []),
		"account": state["account"],
		"stats": state["stats"],
	}


static func from_dict(data: Dictionary) -> SmaExchange:
	if int(data.get("version", 0)) != SAVE_VERSION or typeof(data.get("companies")) != TYPE_DICTIONARY:
		return null
	var seed_value := String(data.get("seed", "sim-exchange-v1"))
	var cash := float(data.get("account", {}).get("cash", START_CASH))
	var engine := SmaExchange.new(seed_value, cash)
	engine.fee_bps = float(data.get("feeBps", FEE_BPS))
	engine.state["quotes"] = {}
	engine._dirty_liquidity.clear()
	engine._resting_dirty.clear()
	engine._has_conditional = false
	engine._has_pending = false
	engine.state["rngState"] = data.get("rngState", engine.state["rngState"])
	engine.state["dayIndex"] = int(data.get("dayIndex", 0))
	engine.state["second"] = int(data.get("second", 0))
	engine.state["nextOrderId"] = int(data.get("nextOrderId", 1))
	engine.state["marketFactor"] = float(data.get("marketFactor", 0.0))
	engine.state["optionStyle"] = "american" \
		if String(data.get("optionStyle", "european")) == "american" else "european"
	var factors: Dictionary = data.get("sectorFactors", {})
	for sector in factors.keys():
		if engine.state["sectorFactors"].has(sector):
			engine.state["sectorFactors"][sector] = float(factors[sector])
	engine.state["orders"] = data.get("orders", []).duplicate(true)
	engine.state["trades"] = data.get("trades", []).duplicate(true)
	engine.state["news"] = data.get("news", []).duplicate(true)
	engine.state["newsSeq"] = int(data.get("newsSeq", 1))
	engine.state["corporateActions"] = data.get("corporateActions", []).duplicate(true)
	engine.state["rightsOfferings"] = data.get("rightsOfferings", []).duplicate(true)
	var saved_account: Dictionary = data.get("account", {}).duplicate(true)
	var defaults: Dictionary = engine.state["account"]
	for key in defaults.keys():
		if not saved_account.has(key):
			saved_account[key] = defaults[key]
	engine.state["account"] = SmaMargin.normalize_account(saved_account)
	engine.state["stats"] = data.get("stats", engine.state["stats"]).duplicate(true)
	var saved_companies: Dictionary = data["companies"]
	for ticker in engine.state["companies"].keys():
		var cs: Dictionary = engine.state["companies"][ticker]
		var saved: Dictionary = saved_companies.get(ticker, {})
		if saved.is_empty():
			continue
		for key in ["fairValue", "last", "prevClose", "open", "high", "low",
				"volume", "trades", "inventory", "ema", "splitFactor",
				"capitalFactor", "haltedUntilDay", "delisted"]:
			if saved.has(key):
				cs[key] = saved[key]
		cs["series"] = saved.get("series", SmaMinuteSeries.create())
		var book := SmaOrderBook.new(ticker)
		var book_data: Dictionary = saved.get("book", {})
		if book_data.is_empty():
			engine.refresh_liquidity(ticker)
		else:
			book.restore(book_data)
			cs["book"] = book
	for order in engine.state["orders"]:
		if not engine.is_live_order(order):
			continue
		if String(order.get("status", "")) == "pending":
			engine._has_pending = true
		elif ["stop", "stopLimit", "trailing"].has(String(order.get("type", ""))):
			engine._has_conditional = true
		if String(order.get("type", "")) != "limit":
			continue
		var cs: Dictionary = engine.state["companies"].get(String(order["ticker"]), {})
		if cs.is_empty():
			continue
		cs["book"].add_resting({
			"id": String(order["id"]),
			"side": engine.book_side_for_order(order),
			"price": float(order.get("limitPrice", 0.0)),
			"remaining": int(order.get("qty", 0)) - int(order.get("filledQty", 0)),
			"owner": String(order.get("owner", "")),
			"action": String(order.get("action", "")),
		})
	return engine


static func _finite(value: Variant) -> bool:
	if value == null:
		return false
	var number := float(value)
	return is_finite(number)
