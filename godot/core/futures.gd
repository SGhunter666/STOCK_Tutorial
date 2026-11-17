## Single-stock futures with daily variation margin and cash settlement. Opening
## a contract reserves margin instead of deducting it; each session close moves
## the change since the previous settlement price into cash.
class_name SmaFutures
extends RefCounted

const MULTIPLIER := 100
const MARGIN_RATE := 0.15
const EXPIRY_DAYS := [30, 60, 90]
const CARRY_RATE := 0.04
const TRADE_LIMIT := 160
const EPSILON := 0.000000001


static func create_account_state() -> Dictionary:
	return {
		"futures": [],
		"futuresTrades": [],
		"futuresSeq": 0,
		"futuresRealized": 0.0,
	}


# ---------------------------------------------------------------------------
# Pricing and contracts
# ---------------------------------------------------------------------------

static func futures_price(spot: float, days: int) -> float:
	var carry := 1.0 + CARRY_RATE * maxf(0.0, float(days)) / 365.0
	return SmaFormat.round_to(maxf(0.01, spot * carry), 2)


static func build_chain(ticker: String, quote: Dictionary, day: int) -> Dictionary:
	var spot := maxf(0.01, float(quote.get("last", 0.0)))
	var expiries: Array = []
	for days in EXPIRY_DAYS:
		var price := futures_price(spot, int(days))
		expiries.append({
			"ticker": ticker,
			"days": int(days),
			"expiryDay": day + int(days),
			"price": price,
			"basis": SmaFormat.round_to(price - spot, 2),
			"margin": SmaFormat.round_to(price * MULTIPLIER * MARGIN_RATE, 2),
			"spot": spot,
		})
	return {"ticker": ticker, "spot": spot, "expiries": expiries}


static func find_contract(chain: Dictionary, expiry_days: int) -> Dictionary:
	for entry in chain.get("expiries", []):
		if int(entry.get("days", 0)) == expiry_days:
			return entry
	return {}


static func future_key(contract: Dictionary, side: String) -> String:
	return "%s:%d:%s" % [
		String(contract.get("ticker", "")),
		int(contract.get("expiryDay", 0)),
		side,
	]


static func current_price(position: Dictionary, spot: float, day: int) -> float:
	var remaining := maxi(0, int(position.get("expiryDay", 0)) - day)
	return futures_price(spot, remaining)


static func futures_margin(account: Dictionary) -> float:
	var total := 0.0
	for position in account.get("futures", []):
		total += float(position.get("marginPerContract", 0.0)) \
			* float(absi(int(position.get("qty", 0))))
	return SmaFormat.round_to(total, 2)


# ---------------------------------------------------------------------------
# Account operations
# ---------------------------------------------------------------------------

static func _push_trade(account: Dictionary, trade: Dictionary) -> Dictionary:
	trade["id"] = int(account.get("futuresSeq", 0))
	account["futuresSeq"] = int(account.get("futuresSeq", 0)) + 1
	var trades: Array = account.get("futuresTrades", [])
	trades.push_front(trade)
	if trades.size() > TRADE_LIMIT:
		trades.resize(TRADE_LIMIT)
	account["futuresTrades"] = trades
	return trade


static func open_future(account: Dictionary, contract: Dictionary, side: String,
		qty: int, fee: float, day: int, tick: int) -> Dictionary:
	var quantity := int(floor(float(qty)))
	if quantity <= 0:
		return {"ok": false, "error": "error.qtyInvalid"}
	var price := float(contract.get("price", 0.0))
	if price <= 0.0:
		return {"ok": false, "error": "error.priceInvalid"}
	if side != "short":
		side = "long"
	var safe_fee := maxf(0.0, fee)
	var signed := -1 if side == "short" else 1
	var key := future_key(contract, side)
	var futures: Array = account.get("futures", [])
	var existing_index := -1
	for index in futures.size():
		if String(futures[index].get("key", "")) == key:
			existing_index = index
			break
	var margin_per := float(contract.get("margin", 0.0))
	if existing_index >= 0:
		var position: Dictionary = futures[existing_index]
		var held := int(position.get("qty", 0))
		var next_qty := held + quantity
		var entry := (float(position.get("entryPrice", 0.0)) * float(held)
			+ price * float(quantity)) / float(next_qty)
		position["qty"] = next_qty
		position["entryPrice"] = SmaFormat.round_to(entry, 2)
		position["marginPerContract"] = margin_per
		position["currentPrice"] = price
		position["fees"] = SmaFormat.round_to(float(position.get("fees", 0.0)) + safe_fee, 2)
		futures[existing_index] = position
	else:
		futures.append({
			"key": key,
			"ticker": String(contract.get("ticker", "")),
			"expiryDay": int(contract.get("expiryDay", 0)),
			"side": side,
			"signed": signed,
			"qty": quantity,
			"entryPrice": price,
			"currentPrice": price,
			"settlementPrice": price,
			"marginPerContract": margin_per,
			"openedDay": day,
			"fees": safe_fee,
		})
	account["futures"] = futures
	account["cash"] = SmaFormat.round_to(float(account.get("cash", 0.0)) - safe_fee, 2)
	account["fees"] = SmaFormat.round_to(float(account.get("fees", 0.0)) + safe_fee, 2)
	var trade := _push_trade(account, {
		"action": "open",
		"ticker": String(contract.get("ticker", "")),
		"side": side,
		"qty": quantity,
		"price": price,
		"expiryDay": int(contract.get("expiryDay", 0)),
		"margin": SmaFormat.round_to(margin_per * float(quantity), 2),
		"fee": safe_fee,
		"realized": 0.0,
		"day": day,
		"tick": tick,
	})
	return {"ok": true, "trade": trade}


## Unrealised P&L since the previous settlement, used by equity and by the
## daily variation-margin step.
static func unrealized_pnl(account: Dictionary, spots: Dictionary, day: int) -> float:
	var total := 0.0
	for position in account.get("futures", []):
		var ticker := String(position.get("ticker", ""))
		var spot := float(spots.get(ticker, position.get("currentPrice", 0.0)))
		var current := current_price(position, spot, day)
		total += (current - float(position.get("settlementPrice", 0.0))) \
			* float(int(position.get("signed", 1))) * float(int(position.get("qty", 0))) \
			* MULTIPLIER
	return SmaFormat.round_to(total, 2)


## Move the unrealised P&L into cash and reset every settlement price.
static func apply_variation(account: Dictionary, spots: Dictionary, day: int) -> float:
	var variation := unrealized_pnl(account, spots, day)
	if is_zero_approx(variation):
		return 0.0
	for position in account.get("futures", []):
		var ticker := String(position.get("ticker", ""))
		var spot := float(spots.get(ticker, position.get("currentPrice", 0.0)))
		position["currentPrice"] = current_price(position, spot, day)
		position["settlementPrice"] = position["currentPrice"]
	account["cash"] = SmaFormat.round_to(float(account.get("cash", 0.0)) + variation, 2)
	return variation


static func close_future(account: Dictionary, key: String, qty: int, current: float,
		fee: float, day: int, tick: int) -> Dictionary:
	var futures: Array = account.get("futures", [])
	var existing_index := -1
	for index in futures.size():
		if String(futures[index].get("key", "")) == key:
			existing_index = index
			break
	if existing_index < 0:
		return {"ok": false, "error": "error.noFuturesPosition"}
	var position: Dictionary = futures[existing_index]
	var quantity := int(floor(float(qty)))
	var held := int(position.get("qty", 0))
	if quantity <= 0:
		return {"ok": false, "error": "error.qtyInvalid"}
	if quantity > held:
		return {"ok": false, "error": "error.insufficientContracts"}
	var safe_fee := maxf(0.0, fee)
	var signed := int(position.get("signed", 1))
	var price := maxf(0.01, current)
	var variation := SmaFormat.round_to(
		(price - float(position.get("settlementPrice", 0.0))) * float(signed)
		* float(quantity) * MULTIPLIER, 2)
	var realized := SmaFormat.round_to(
		(price - float(position.get("entryPrice", 0.0))) * float(signed)
		* float(quantity) * MULTIPLIER - safe_fee, 2)
	var remaining := held - quantity
	if remaining > 0:
		var next := position.duplicate(true)
		next["qty"] = remaining
		next["currentPrice"] = price
		next["settlementPrice"] = price
		futures[existing_index] = next
	else:
		futures.remove_at(existing_index)
	account["futures"] = futures
	account["cash"] = SmaFormat.round_to(
		float(account.get("cash", 0.0)) + variation - safe_fee, 2)
	account["fees"] = SmaFormat.round_to(float(account.get("fees", 0.0)) + safe_fee, 2)
	account["futuresRealized"] = SmaFormat.round_to(
		float(account.get("futuresRealized", 0.0)) + realized, 2)
	var trade := _push_trade(account, {
		"action": "close",
		"ticker": String(position.get("ticker", "")),
		"side": String(position.get("side", "long")),
		"qty": quantity,
		"price": price,
		"expiryDay": int(position.get("expiryDay", 0)),
		"margin": 0.0,
		"fee": safe_fee,
		"realized": realized,
		"day": day,
		"tick": tick,
	})
	return {"ok": true, "trade": trade, "realized": realized}


## Cash-settle every contract whose expiry day has been reached. Any variation
## since the previous settlement is already in cash.
static func settle_expired(account: Dictionary, spots: Dictionary, day: int) -> Array:
	var futures: Array = account.get("futures", [])
	if futures.is_empty():
		return []
	var keep: Array = []
	var settlements: Array = []
	var cash := float(account.get("cash", 0.0))
	var realized_total := float(account.get("futuresRealized", 0.0))
	for position in futures:
		if int(position.get("expiryDay", 0)) > day:
			keep.append(position)
			continue
		var ticker := String(position.get("ticker", ""))
		var final_price := float(spots.get(ticker, position.get("currentPrice", 0.0)))
		var quantity := int(position.get("qty", 0))
		var signed := int(position.get("signed", 1))
		var variation := SmaFormat.round_to(
			(final_price - float(position.get("settlementPrice", 0.0))) * float(signed)
			* float(quantity) * MULTIPLIER, 2)
		var realized := SmaFormat.round_to(
			(final_price - float(position.get("entryPrice", 0.0))) * float(signed)
			* float(quantity) * MULTIPLIER - float(position.get("fees", 0.0)), 2)
		cash = SmaFormat.round_to(cash + variation, 2)
		realized_total = SmaFormat.round_to(realized_total + realized, 2)
		settlements.append({
			"ticker": ticker,
			"side": String(position.get("side", "long")),
			"qty": quantity,
			"entryPrice": float(position.get("entryPrice", 0.0)),
			"finalPrice": final_price,
			"expiryDay": int(position.get("expiryDay", 0)),
			"variation": variation,
			"realized": realized,
		})
		_push_trade(account, {
			"action": "expire",
			"ticker": ticker,
			"side": String(position.get("side", "long")),
			"qty": quantity,
			"price": final_price,
			"expiryDay": int(position.get("expiryDay", 0)),
			"margin": 0.0,
			"fee": 0.0,
			"realized": realized,
			"day": day,
		})
	account["futures"] = keep
	account["cash"] = cash
	account["futuresRealized"] = realized_total
	return settlements


# ---------------------------------------------------------------------------
# Read models
# ---------------------------------------------------------------------------

static func position_rows(account: Dictionary, spots: Dictionary, day: int) -> Array:
	var rows: Array = []
	for position in account.get("futures", []):
		var ticker := String(position.get("ticker", ""))
		var spot := float(spots.get(ticker, position.get("currentPrice", 0.0)))
		var current := current_price(position, spot, day)
		var quantity := int(position.get("qty", 0))
		var signed := int(position.get("signed", 1))
		var unrealized := SmaFormat.round_to(
			(current - float(position.get("entryPrice", 0.0))) * float(signed)
			* float(quantity) * MULTIPLIER, 2)
		var row: Dictionary = position.duplicate(true)
		row["currentPrice"] = current
		row["unrealized"] = unrealized
		row["margin"] = SmaFormat.round_to(
			float(position.get("marginPerContract", 0.0)) * float(quantity), 2)
		row["notional"] = SmaFormat.round_to(current * float(quantity) * MULTIPLIER, 2)
		row["daysLeft"] = maxi(0, int(position.get("expiryDay", 0)) - day)
		rows.append(row)
	rows.sort_custom(func(a, b): return int(a["expiryDay"]) < int(b["expiryDay"]))
	return rows
