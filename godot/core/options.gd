## European options for the teaching exchange: Black-Scholes pricing, deterministic
## chains, long and short positions, collateral and cash settlement at expiry.
## Short options receive premium up front and post collateral instead of paying
## the premium, which is what the stage seven lessons teach.
class_name SmaOptions
extends RefCounted

const CONTRACT_SIZE := 100
const RISK_FREE_RATE := 0.04
const TRADING_DAYS := 252
const EXPIRY_DAYS := [30, 60, 90]
const TRADE_LIMIT := 160


static func create_account_state() -> Dictionary:
	return {
		"options": [],
		"optionTrades": [],
		"optionRealized": 0.0,
		"optionSeq": 0,
	}


# ---------------------------------------------------------------------------
# Pricing
# ---------------------------------------------------------------------------

static func norm_cdf(value: float) -> float:
	var sign := 1.0 if value >= 0.0 else -1.0
	var z := absf(value) / sqrt(2.0)
	var t := 1.0 / (1.0 + 0.3275911 * z)
	var poly := ((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t \
		- 0.284496736) * t + 0.254829592
	var erf := 1.0 - poly * t * exp(-z * z)
	return 0.5 * (1.0 + sign * erf)


static func norm_pdf(value: float) -> float:
	return exp(-0.5 * value * value) / sqrt(TAU)


static func black_scholes(params: Dictionary) -> Dictionary:
	var option_type := String(params.get("type", "call"))
	var is_call := option_type == "call"
	var spot := maxf(0.01, float(params.get("spot", 0.0)))
	var strike := maxf(0.01, float(params.get("strike", 0.0)))
	var vol := maxf(0.0001, float(params.get("vol", 0.0)))
	var years := maxf(0.0, float(params.get("years", 0.0)))
	var rate := float(params.get("rate", RISK_FREE_RATE))
	var intrinsic := maxf(0.0, spot - strike) if is_call else maxf(0.0, strike - spot)
	if years <= 0.0:
		return {
			"price": SmaFormat.round_to(intrinsic, 2),
			"intrinsic": SmaFormat.round_to(intrinsic, 2),
			"timeValue": 0.0,
			"delta": (1.0 if spot >= strike else 0.0) if is_call \
				else (-1.0 if spot <= strike else 0.0),
			"gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0,
		}
	var sqrt_t := sqrt(years)
	var d1 := (log(spot / strike) + (rate + 0.5 * vol * vol) * years) / (vol * sqrt_t)
	var d2 := d1 - vol * sqrt_t
	var discount := exp(-rate * years)
	var nd1 := norm_cdf(d1)
	var nd2 := norm_cdf(d2)
	var pdf := norm_pdf(d1)
	var price := spot * nd1 - strike * discount * nd2 if is_call \
		else strike * discount * norm_cdf(-d2) - spot * norm_cdf(-d1)
	var delta := nd1 if is_call else nd1 - 1.0
	var gamma := pdf / (spot * vol * sqrt_t)
	var theta := (-spot * pdf * vol / (2.0 * sqrt_t) \
		- rate * strike * discount * nd2) if is_call else \
		(-spot * pdf * vol / (2.0 * sqrt_t) \
		+ rate * strike * discount * norm_cdf(-d2))
	var vega := spot * pdf * sqrt_t / 100.0
	var rho := (1.0 if is_call else -1.0) * strike * years * discount \
		* (nd2 if is_call else norm_cdf(-d2)) / 100.0
	return {
		"price": SmaFormat.round_to(maxf(0.01, price), 2),
		"intrinsic": SmaFormat.round_to(intrinsic, 2),
		"timeValue": SmaFormat.round_to(maxf(0.0, price - intrinsic), 2),
		"delta": delta,
		"gamma": gamma,
		"theta": theta / TRADING_DAYS,
		"vega": vega,
		"rho": rho,
	}


static func payoff_at_expiry(params: Dictionary) -> Dictionary:
	var is_call := String(params.get("type", "call")) == "call"
	var spot := maxf(0.0, float(params.get("spot", 0.0)))
	var strike := maxf(0.0, float(params.get("strike", 0.0)))
	var premium := maxf(0.0, float(params.get("premium", 0.0)))
	var quantity := maxi(0, int(params.get("qty", 1)))
	var intrinsic := maxf(0.0, spot - strike) if is_call else maxf(0.0, strike - spot)
	var gross := intrinsic * CONTRACT_SIZE * quantity
	var cost := premium * CONTRACT_SIZE * quantity
	return {
		"intrinsic": intrinsic,
		"gross": gross,
		"cost": cost,
		"pnl": gross - cost,
		"breakeven": strike + premium if is_call else strike - premium,
		"maxLoss": cost,
	}


# ---------------------------------------------------------------------------
# Deterministic chains
# ---------------------------------------------------------------------------

static func annual_volatility(company: Dictionary) -> float:
	var daily := float(company.get("vol", company.get("dailyVol", 0.03)))
	return clampf(daily * sqrt(float(TRADING_DAYS)), 0.12, 1.2)


static func smile_vol(base_vol: float, spot: float, strike: float) -> float:
	var moneyness := absf(log(maxf(0.01, strike) / maxf(0.01, spot)))
	return maxf(0.1, base_vol * (1.0 + 0.18 * moneyness))


static func strike_step(spot: float) -> float:
	if spot < 20.0:
		return 1.0
	if spot < 60.0:
		return 2.5
	if spot < 150.0:
		return 5.0
	return 10.0


static func strike_grid(spot: float, levels: int = 3) -> Array:
	var step := strike_step(spot)
	var base := floorf(spot / step) * step
	var strikes: Array = []
	for index in range(-levels, levels + 1):
		var strike := SmaFormat.round_to(base + index * step, 2)
		if strike > 0.0:
			strikes.append(strike)
	strikes.sort()
	return strikes


static func build_chain(company: Dictionary, ticker: String, quote: Dictionary,
		day: int) -> Dictionary:
	var spot := maxf(0.01, float(quote.get("last", company.get("price", 0.0))))
	var base_vol := annual_volatility(company)
	var strikes := strike_grid(spot)
	var expiries: Array = []
	for days in EXPIRY_DAYS:
		expiries.append({"days": int(days), "expiryDay": day + int(days)})
	var contracts: Array = []
	for expiry in expiries:
		var years := float(expiry["days"]) / float(TRADING_DAYS)
		for strike in strikes:
			var vol := smile_vol(base_vol, spot, float(strike))
			for option_type in ["call", "put"]:
				var greeks := black_scholes({
					"type": option_type, "spot": spot, "strike": strike,
					"years": years, "vol": vol, "rate": RISK_FREE_RATE,
				})
				contracts.append({
					"ticker": ticker,
					"type": option_type,
					"strike": float(strike),
					"expiryDay": int(expiry["expiryDay"]),
					"days": int(expiry["days"]),
					"vol": vol,
					"premium": greeks["price"],
					"intrinsic": greeks["intrinsic"],
					"timeValue": greeks["timeValue"],
					"delta": greeks["delta"],
					"gamma": greeks["gamma"],
					"theta": greeks["theta"],
					"vega": greeks["vega"],
					"rho": greeks["rho"],
					"spot": spot,
					"contractSize": CONTRACT_SIZE,
				})
	return {
		"ticker": ticker, "spot": spot, "vol": base_vol,
		"expiries": expiries, "strikes": strikes, "contracts": contracts,
	}


static func find_contract(chain: Dictionary, option_type: String, strike: float,
		expiry_day: int) -> Dictionary:
	for contract in chain.get("contracts", []):
		if String(contract.get("type", "")) == option_type \
				and absf(float(contract.get("strike", 0.0)) - strike) < 0.000001 \
				and int(contract.get("expiryDay", 0)) == expiry_day:
			return contract
	return {}


static func chain_rows(chain: Dictionary, expiry_day: int) -> Array:
	var rows: Array = []
	for strike in chain.get("strikes", []):
		rows.append({
			"strike": float(strike),
			"call": find_contract(chain, "call", float(strike), expiry_day),
			"put": find_contract(chain, "put", float(strike), expiry_day),
		})
	return rows


# ---------------------------------------------------------------------------
# Account operations
# ---------------------------------------------------------------------------

static func option_key(contract: Dictionary) -> String:
	return "%s:%s:%.2f:%d" % [
		String(contract.get("ticker", "")),
		String(contract.get("type", "")),
		float(contract.get("strike", 0.0)),
		int(contract.get("expiryDay", 0)),
	]


static func _push_trade(account: Dictionary, trade: Dictionary) -> Dictionary:
	trade["id"] = int(account.get("optionSeq", 0))
	account["optionSeq"] = int(account.get("optionSeq", 0)) + 1
	var trades: Array = account.get("optionTrades", [])
	trades.push_front(trade)
	if trades.size() > TRADE_LIMIT:
		trades.resize(TRADE_LIMIT)
	account["optionTrades"] = trades
	return trade


static func buy_option(account: Dictionary, contract: Dictionary, qty: int,
		fee: float, day: int, tick: int) -> Dictionary:
	var quantity := int(floor(float(qty)))
	if quantity <= 0:
		return {"ok": false, "error": "error.qtyInvalid"}
	var premium := float(contract.get("premium", 0.0))
	if premium <= 0.0:
		return {"ok": false, "error": "error.priceInvalid"}
	var safe_fee := maxf(0.0, fee)
	var gross := premium * CONTRACT_SIZE * quantity
	var cost := SmaFormat.round_to(gross + safe_fee, 2)
	if cost > float(account.get("cash", 0.0)) + 0.000000001:
		return {"ok": false, "error": "error.insufficientCash"}
	var key := option_key(contract)
	var options: Array = account.get("options", [])
	var existing_index := -1
	for index in options.size():
		if String(options[index].get("key", "")) == key:
			existing_index = index
			break
	if existing_index >= 0 and int(options[existing_index].get("qty", 0)) < 0:
		return {"ok": false, "error": "error.optionIsShort"}
	var position: Dictionary
	if existing_index >= 0:
		position = options[existing_index].duplicate(true)
		var next_qty := int(position["qty"]) + quantity
		var next_basis := SmaFormat.round_to(float(position["costBasis"]) + cost, 2)
		position["qty"] = next_qty
		position["costBasis"] = next_basis
		position["premium"] = next_basis / float(next_qty * CONTRACT_SIZE)
		position["currentValue"] = premium
		position["delta"] = contract.get("delta", 0.0)
		position["theta"] = contract.get("theta", 0.0)
		options[existing_index] = position
	else:
		position = {
			"key": key,
			"ticker": String(contract.get("ticker", "")),
			"type": String(contract.get("type", "call")),
			"strike": float(contract.get("strike", 0.0)),
			"expiryDay": int(contract.get("expiryDay", 0)),
			"qty": quantity,
			"costBasis": cost,
			"premium": cost / float(quantity * CONTRACT_SIZE),
			"currentValue": premium,
			"vol": float(contract.get("vol", 0.3)),
			"delta": contract.get("delta", 0.0),
			"theta": contract.get("theta", 0.0),
			"openedDay": day,
			"contractSize": CONTRACT_SIZE,
		}
		options.append(position)
	account["options"] = options
	account["cash"] = SmaFormat.round_to(float(account.get("cash", 0.0)) - cost, 2)
	account["fees"] = SmaFormat.round_to(float(account.get("fees", 0.0)) + safe_fee, 2)
	var trade := _push_trade(account, {
		"side": "buy",
		"ticker": String(contract.get("ticker", "")),
		"optionType": String(contract.get("type", "call")),
		"strike": float(contract.get("strike", 0.0)),
		"expiryDay": int(contract.get("expiryDay", 0)),
		"qty": quantity,
		"premium": premium,
		"fee": safe_fee,
		"gross": SmaFormat.round_to(gross, 2),
		"cash": -cost,
		"realized": 0.0,
		"day": day,
		"tick": tick,
	})
	return {"ok": true, "trade": trade}


## Open or add to a short option position. Premium is received up front; the
## exchange validates collateral before calling this, so the account only
## records the resulting position and cash flow.
static func sell_option(account: Dictionary, contract: Dictionary, qty: int,
		fee: float, day: int, tick: int) -> Dictionary:
	var quantity := int(floor(float(qty)))
	if quantity <= 0:
		return {"ok": false, "error": "error.qtyInvalid"}
	var premium := float(contract.get("premium", 0.0))
	if premium <= 0.0:
		return {"ok": false, "error": "error.priceInvalid"}
	var safe_fee := maxf(0.0, fee)
	var gross := premium * CONTRACT_SIZE * quantity
	var proceeds := SmaFormat.round_to(gross - safe_fee, 2)
	var key := option_key(contract)
	var options: Array = account.get("options", [])
	var existing_index := -1
	for index in options.size():
		if String(options[index].get("key", "")) == key:
			existing_index = index
			break
	if existing_index >= 0 and int(options[existing_index].get("qty", 0)) > 0:
		return {"ok": false, "error": "error.optionIsLong"}
	var position: Dictionary
	if existing_index >= 0:
		position = options[existing_index].duplicate(true)
		var next_qty := int(position["qty"]) - quantity
		var next_basis := SmaFormat.round_to(float(position["costBasis"]) + proceeds, 2)
		position["qty"] = next_qty
		position["costBasis"] = next_basis
		position["premium"] = next_basis / float(absi(next_qty) * CONTRACT_SIZE)
		position["currentValue"] = premium
		position["delta"] = contract.get("delta", 0.0)
		position["theta"] = contract.get("theta", 0.0)
		options[existing_index] = position
	else:
		position = {
			"key": key,
			"ticker": String(contract.get("ticker", "")),
			"type": String(contract.get("type", "call")),
			"strike": float(contract.get("strike", 0.0)),
			"expiryDay": int(contract.get("expiryDay", 0)),
			"qty": -quantity,
			"costBasis": proceeds,
			"premium": proceeds / float(quantity * CONTRACT_SIZE),
			"currentValue": premium,
			"vol": float(contract.get("vol", 0.3)),
			"delta": contract.get("delta", 0.0),
			"theta": contract.get("theta", 0.0),
			"openedDay": day,
			"contractSize": CONTRACT_SIZE,
		}
		options.append(position)
	account["options"] = options
	account["cash"] = SmaFormat.round_to(float(account.get("cash", 0.0)) + proceeds, 2)
	account["fees"] = SmaFormat.round_to(float(account.get("fees", 0.0)) + safe_fee, 2)
	var trade := _push_trade(account, {
		"side": "sell",
		"ticker": String(contract.get("ticker", "")),
		"optionType": String(contract.get("type", "call")),
		"strike": float(contract.get("strike", 0.0)),
		"expiryDay": int(contract.get("expiryDay", 0)),
		"qty": quantity,
		"premium": premium,
		"fee": safe_fee,
		"gross": SmaFormat.round_to(gross, 2),
		"cash": proceeds,
		"realized": 0.0,
		"day": day,
		"tick": tick,
	})
	return {"ok": true, "trade": trade}


static func close_option(account: Dictionary, key: String, qty: int,
		current_value: float, fee: float, day: int, tick: int) -> Dictionary:
	var options: Array = account.get("options", [])
	var existing_index := -1
	for index in options.size():
		if String(options[index].get("key", "")) == key:
			existing_index = index
			break
	if existing_index < 0:
		return {"ok": false, "error": "error.noOptionPosition"}
	var position: Dictionary = options[existing_index]
	var quantity := int(floor(float(qty)))
	var held := int(position.get("qty", 0))
	var is_long := held > 0
	var held_count := absi(held)
	if quantity <= 0:
		return {"ok": false, "error": "error.qtyInvalid"}
	if quantity > held_count:
		return {"ok": false, "error": "error.insufficientContracts"}
	var safe_fee := maxf(0.0, fee)
	var unit_basis := float(position.get("costBasis", 0.0)) / float(held_count)
	var basis_part := SmaFormat.round_to(unit_basis * quantity, 2)
	var gross := SmaFormat.round_to(maxf(0.0, current_value) * CONTRACT_SIZE * quantity, 2)
	var proceeds := SmaFormat.round_to(gross - safe_fee, 2) if is_long else 0.0
	var cost := 0.0 if is_long else SmaFormat.round_to(gross + safe_fee, 2)
	if not is_long and cost > float(account.get("cash", 0.0)) + 0.000000001:
		return {"ok": false, "error": "error.insufficientCash"}
	var realized := SmaFormat.round_to(proceeds - basis_part, 2) if is_long \
		else SmaFormat.round_to(basis_part - cost, 2)
	var remaining := held - quantity if is_long else held + quantity
	if remaining != 0:
		var next := position.duplicate(true)
		next["qty"] = remaining
		next["costBasis"] = SmaFormat.round_to(float(position["costBasis"]) - basis_part, 2)
		options[existing_index] = next
	else:
		options.remove_at(existing_index)
	account["options"] = options
	account["cash"] = SmaFormat.round_to(
		float(account.get("cash", 0.0)) + (proceeds if is_long else -cost), 2)
	account["fees"] = SmaFormat.round_to(float(account.get("fees", 0.0)) + safe_fee, 2)
	account["optionRealized"] = SmaFormat.round_to(
		float(account.get("optionRealized", 0.0)) + realized, 2)
	var trade := _push_trade(account, {
		"side": "close" if is_long else "buyToClose",
		"ticker": String(position.get("ticker", "")),
		"optionType": String(position.get("type", "call")),
		"strike": float(position.get("strike", 0.0)),
		"expiryDay": int(position.get("expiryDay", 0)),
		"qty": quantity,
		"premium": maxf(0.0, current_value),
		"fee": safe_fee,
		"gross": gross,
		"cash": proceeds if is_long else -cost,
		"realized": realized,
		"day": day,
		"tick": tick,
	})
	return {"ok": true, "trade": trade, "realized": realized}


# ---------------------------------------------------------------------------
# Read models and settlement
# ---------------------------------------------------------------------------

static func option_quote_value(position: Dictionary, spot: float, day: int) -> Dictionary:
	var years := maxf(0.0, float(int(position.get("expiryDay", 0)) - day) / float(TRADING_DAYS))
	return black_scholes({
		"type": String(position.get("type", "call")),
		"spot": spot,
		"strike": float(position.get("strike", 0.0)),
		"years": years,
		"vol": float(position.get("vol", 0.3)),
	})


static func option_rows(account: Dictionary, spots: Dictionary, day: int) -> Array:
	var rows: Array = []
	for position in account.get("options", []):
		var ticker := String(position.get("ticker", ""))
		var spot := float(spots.get(ticker, position.get("currentValue", 0.0)))
		var mark := option_quote_value(position, spot, day)
		var signed_qty := int(position.get("qty", 0))
		var quantity := absi(signed_qty)
		var value := float(mark["price"]) * CONTRACT_SIZE * signed_qty
		var basis := float(position.get("costBasis", 0.0))
		var pnl := value - basis if signed_qty > 0 else basis + value
		var row: Dictionary = position.duplicate(true)
		row["currentValue"] = mark["price"]
		row["delta"] = mark["delta"]
		row["theta"] = mark["theta"]
		row["intrinsic"] = mark["intrinsic"]
		row["absQty"] = quantity
		row["value"] = SmaFormat.round_to(value, 2)
		row["pnl"] = SmaFormat.round_to(pnl, 2)
		row["pnlPct"] = SmaFormat.round_to(pnl / basis * 100.0, 2) if basis > 0.0 else 0.0
		row["daysLeft"] = maxi(0, int(position.get("expiryDay", 0)) - day)
		row["side"] = "long" if signed_qty > 0 else "short"
		rows.append(row)
	rows.sort_custom(func(a, b): return int(a["expiryDay"]) < int(b["expiryDay"]))
	return rows


static func option_value(account: Dictionary, spots: Dictionary, day: int) -> float:
	var total := 0.0
	for position in account.get("options", []):
		var ticker := String(position.get("ticker", ""))
		var spot := float(spots.get(ticker, position.get("currentValue", 0.0)))
		var mark := option_quote_value(position, spot, day)
		total += float(mark["price"]) * CONTRACT_SIZE * int(position.get("qty", 0))
	return SmaFormat.round_to(total, 2)


## Delivers stock at an option strike. Positive quantity buys shares (long call,
## short put); negative quantity sells or shorts them (long put, short call).
## Existing opposite positions are closed first, then any remainder opens a new
## leg. Returns realised stock P&L from the lots that were closed.
static func _deliver_shares(account: Dictionary, ticker: String, signed_qty: int,
		price: float, day: int, source: String) -> float:
	if signed_qty == 0:
		return 0.0
	if not account.has("positions"):
		account["positions"] = {}
	if not account.has("shorts"):
		account["shorts"] = {}
	if not account.has("trades"):
		account["trades"] = []
	account["cash"] = SmaFormat.round_to(
		float(account.get("cash", 0.0)) - float(signed_qty) * price, 2)
	var remaining := signed_qty
	var realized := 0.0
	if remaining > 0:
		var short: Dictionary = account["shorts"].get(ticker, {})
		var held := int(short.get("qty", 0))
		if held > 0:
			var close_qty := mini(held, remaining)
			realized += (float(short.get("avgPrice", price)) - price) * float(close_qty)
			short["qty"] = held - close_qty
			remaining -= close_qty
			if int(short["qty"]) <= 0:
				account["shorts"].erase(ticker)
			else:
				account["shorts"][ticker] = short
		if remaining > 0:
			var position: Dictionary = account["positions"].get(ticker,
				{"qty": 0, "avgCost": 0.0})
			var next_qty := int(position.get("qty", 0)) + remaining
			position["avgCost"] = (float(position.get("avgCost", 0.0))
				* float(int(position.get("qty", 0))) + price * float(remaining)) \
				/ float(next_qty)
			position["qty"] = next_qty
			account["positions"][ticker] = position
	else:
		var position: Dictionary = account["positions"].get(ticker, {})
		var held := int(position.get("qty", 0))
		if held > 0:
			var close_qty := mini(held, -remaining)
			realized += (price - float(position.get("avgCost", price))) * float(close_qty)
			position["qty"] = held - close_qty
			remaining += close_qty
			if int(position["qty"]) <= 0:
				account["positions"].erase(ticker)
			else:
				account["positions"][ticker] = position
		if remaining < 0:
			var short: Dictionary = account["shorts"].get(ticker,
				{"qty": 0, "avgPrice": 0.0, "openedDay": day})
			var next_qty := int(short.get("qty", 0)) - remaining
			short["avgPrice"] = (float(short.get("avgPrice", 0.0))
				* float(int(short.get("qty", 0))) + price * float(-remaining)) \
				/ float(next_qty)
			short["qty"] = next_qty
			if not short.has("openedDay"):
				short["openedDay"] = day
			account["shorts"][ticker] = short
	account["realizedPnl"] = SmaFormat.round_to(
		float(account.get("realizedPnl", 0.0)) + realized, 2)
	var trades: Array = account["trades"]
	trades.append({
		"ticker": ticker, "side": "buy" if signed_qty > 0 else "sell",
		"action": source, "qty": absi(signed_qty),
		"price": SmaFormat.round_to(price, 4), "fee": 0.0,
		"realized": SmaFormat.round_to(realized, 2),
		"orderId": "%s-%s-%d" % [source.to_upper(), ticker, day],
		"day": day, "second": 0, "date": SmaCalendar.iso_date(day), "time": "",
		"source": source,
	})
	if trades.size() > 500:
		trades = trades.slice(trades.size() - 500)
	account["trades"] = trades
	return realized


## Settles every contract past expiry. In-the-money legs deliver stock at the
## strike when the account can fund or source the shares; otherwise the payoff
## falls back to intrinsic-value cash settlement.
static func settle_expired(account: Dictionary, spots: Dictionary, day: int) -> Array:
	var options: Array = account.get("options", [])
	if options.is_empty():
		return []
	var keep: Array = []
	var settlements: Array = []
	var realized_total := float(account.get("optionRealized", 0.0))
	for position in options:
		if int(position.get("expiryDay", 0)) > day:
			keep.append(position)
			continue
		var ticker := String(position.get("ticker", ""))
		var spot := float(spots.get(ticker, position.get("currentValue", 0.0)))
		var is_call := String(position.get("type", "call")) == "call"
		var strike := float(position.get("strike", 0.0))
		var intrinsic := maxf(0.0, spot - strike) if is_call \
			else maxf(0.0, strike - spot)
		var signed_qty := int(position.get("qty", 0))
		var is_long := signed_qty > 0
		var quantity := absi(signed_qty)
		var basis := float(position.get("costBasis", 0.0))
		var gross := SmaFormat.round_to(intrinsic * CONTRACT_SIZE * quantity, 2)
		var realized := SmaFormat.round_to(gross - basis, 2) if is_long \
			else SmaFormat.round_to(basis - gross, 2)
		var cash_change := 0.0
		var shares := 0
		var delivery := "none"
		var delivered := false
		if intrinsic > 0.0:
			shares = quantity * CONTRACT_SIZE
			var signed_shares := shares if is_call == is_long else -shares
			var can_deliver := true
			if is_long and is_call:
				can_deliver = float(account.get("cash", 0.0)) >= strike * float(shares)
			elif is_long:
				can_deliver = int(account.get("positions", {}).get(ticker, {})
					.get("qty", 0)) >= shares
			elif not is_call:
				can_deliver = float(account.get("cash", 0.0)) >= strike * float(shares)
			if can_deliver:
				_deliver_shares(account, ticker, signed_shares, strike, day,
					"exercise" if is_long else "assignment")
				cash_change = SmaFormat.round_to(-float(signed_shares) * strike, 2)
				delivery = "shares"
				delivered = true
		if not delivered:
			cash_change = gross if is_long else -gross
			account["cash"] = SmaFormat.round_to(
				float(account.get("cash", 0.0)) + cash_change, 2)
			delivery = "cash" if intrinsic > 0.0 else "none"
		realized_total = SmaFormat.round_to(realized_total + realized, 2)
		settlements.append({
			"ticker": ticker,
			"optionType": String(position.get("type", "call")),
			"strike": strike,
			"expiryDay": int(position.get("expiryDay", 0)),
			"qty": signed_qty,
			"spot": spot,
			"intrinsic": SmaFormat.round_to(intrinsic, 2),
			"proceeds": cash_change,
			"cashDelta": cash_change,
			"realized": realized,
			"delivery": delivery,
			"shares": shares if delivered else 0,
		})
		_push_trade(account, {
			"side": "exercise" if delivered and is_long
				else ("assigned" if not is_long else "expire"),
			"ticker": ticker,
			"optionType": String(position.get("type", "call")),
			"strike": strike,
			"expiryDay": int(position.get("expiryDay", 0)),
			"qty": quantity,
			"premium": SmaFormat.round_to(intrinsic, 2),
			"fee": 0.0,
			"gross": gross,
			"cash": cash_change,
			"amount": cash_change,
			"realized": realized,
			"delivery": delivery,
			"shares": shares if delivered else 0,
			"day": day,
			"spot": spot,
		})
	account["options"] = keep
	account["optionRealized"] = realized_total
	return settlements


## Deterministic American-style assignment: a short leg at least 5% in the
## money with three or fewer sessions left is assigned at the next open.
static func assign_early(account: Dictionary, spots: Dictionary, day: int,
		days_limit: int = 3, moneyness: float = 0.05) -> Array:
	var options: Array = account.get("options", [])
	if options.is_empty():
		return []
	var keep: Array = []
	var assignments: Array = []
	for position in options:
		var signed_qty := int(position.get("qty", 0))
		var expiry_day := int(position.get("expiryDay", 0))
		var days_left := expiry_day - day
		if signed_qty >= 0 or days_left <= 0 or days_left > days_limit:
			keep.append(position)
			continue
		var ticker := String(position.get("ticker", ""))
		var spot := float(spots.get(ticker, 0.0))
		var strike := float(position.get("strike", 0.0))
		var is_call := String(position.get("type", "call")) == "call"
		var in_the_money := spot >= strike * (1.0 + moneyness) if is_call \
			else spot <= strike * (1.0 - moneyness)
		if spot <= 0.0 or strike <= 0.0 or not in_the_money:
			keep.append(position)
			continue
		var quantity := -signed_qty
		var shares := quantity * CONTRACT_SIZE
		var signed_shares := -shares if is_call else shares
		if not is_call and float(account.get("cash", 0.0)) < strike * float(shares):
			keep.append(position)
			continue
		var basis := float(position.get("costBasis", 0.0))
		_deliver_shares(account, ticker, signed_shares, strike, day, "assignment")
		account["optionRealized"] = SmaFormat.round_to(
			float(account.get("optionRealized", 0.0)) + basis, 2)
		var intrinsic := maxf(0.0, spot - strike) if is_call \
			else maxf(0.0, strike - spot)
		assignments.append({
			"ticker": ticker, "optionType": String(position.get("type", "call")),
			"strike": strike, "expiryDay": expiry_day, "contracts": quantity,
			"shares": shares, "spot": spot,
			"intrinsic": SmaFormat.round_to(intrinsic, 2),
			"cashDelta": SmaFormat.round_to(-float(signed_shares) * strike, 2),
			"realized": SmaFormat.round_to(basis, 2), "day": day,
		})
		_push_trade(account, {
			"side": "assignedEarly", "ticker": ticker,
			"optionType": String(position.get("type", "call")),
			"strike": strike, "expiryDay": expiry_day, "qty": quantity,
			"premium": SmaFormat.round_to(intrinsic, 2), "fee": 0.0,
			"gross": 0.0, "cash": 0.0, "amount": 0.0,
			"realized": SmaFormat.round_to(basis, 2),
			"delivery": "shares", "shares": shares,
			"day": day, "spot": spot,
		})
	account["options"] = keep
	return assignments


## Exercises a long contract on its expiry day, delivering stock at the strike.
static func exercise_option(account: Dictionary, key: String, qty: int,
		spot: float, day: int) -> Dictionary:
	var options: Array = account.get("options", [])
	var index := -1
	for cursor in options.size():
		if String(options[cursor].get("key", "")) == key:
			index = cursor
			break
	if index < 0:
		return {"ok": false, "error": "exchange.error.option.noPosition"}
	var position: Dictionary = options[index]
	var held := int(position.get("qty", 0))
	if held <= 0:
		return {"ok": false, "error": "exchange.error.option.notLong"}
	if int(position.get("expiryDay", 0)) != day:
		return {"ok": false, "error": "exchange.error.option.notExpiryDay"}
	var quantity := mini(int(floor(float(qty))), held)
	if quantity <= 0:
		return {"ok": false, "error": "exchange.error.option.invalid"}
	var ticker := String(position.get("ticker", ""))
	var strike := float(position.get("strike", 0.0))
	var is_call := String(position.get("type", "call")) == "call"
	var intrinsic := maxf(0.0, spot - strike) if is_call else maxf(0.0, strike - spot)
	if intrinsic <= 0.0:
		return {"ok": false, "error": "exchange.error.option.notInTheMoney"}
	var shares := quantity * CONTRACT_SIZE
	if is_call and float(account.get("cash", 0.0)) < strike * float(shares):
		return {"ok": false, "error": "exchange.error.option.insufficientCash"}
	if not is_call and int(account.get("positions", {}).get(ticker, {})
			.get("qty", 0)) < shares:
		return {"ok": false, "error": "exchange.error.option.insufficientShares"}
	var basis_part := SmaFormat.round_to(
		float(position.get("costBasis", 0.0)) * float(quantity) / float(held), 2)
	_deliver_shares(account, ticker, shares if is_call else -shares,
		strike, day, "exercise")
	var gross := SmaFormat.round_to(intrinsic * CONTRACT_SIZE * float(quantity), 2)
	var realized := SmaFormat.round_to(gross - basis_part, 2)
	account["optionRealized"] = SmaFormat.round_to(
		float(account.get("optionRealized", 0.0)) + realized, 2)
	var remaining := held - quantity
	if remaining > 0:
		var next := position.duplicate(true)
		next["qty"] = remaining
		next["costBasis"] = SmaFormat.round_to(
			float(position["costBasis"]) - basis_part, 2)
		options[index] = next
	else:
		options.remove_at(index)
	account["options"] = options
	_push_trade(account, {
		"side": "exercise", "ticker": ticker,
		"optionType": String(position.get("type", "call")),
		"strike": strike, "expiryDay": int(position.get("expiryDay", 0)),
		"qty": quantity, "premium": SmaFormat.round_to(intrinsic, 2), "fee": 0.0,
		"gross": gross, "cash": 0.0, "amount": 0.0,
		"realized": realized, "delivery": "shares", "shares": shares,
		"day": day, "spot": spot,
	})
	return {
		"ok": true, "shares": shares, "realized": realized, "quantity": quantity,
		"cashDelta": SmaFormat.round_to(
			-strike * float(shares) if is_call else strike * float(shares), 2),
	}


# ---------------------------------------------------------------------------
# Collateral
# ---------------------------------------------------------------------------

## Cash collateral required by short options. Covered calls use stock or long
## calls as cover; cash-secured puts use the strike; uncovered calls need 20% of
## notional. Long options need no collateral.
static func option_collateral(account: Dictionary, spots: Dictionary) -> float:
	var positions: Array = account.get("options", [])
	if positions.is_empty():
		return 0.0
	var collateral := 0.0
	var tickers := {}
	for position in positions:
		tickers[String(position.get("ticker", ""))] = true
	for ticker in tickers.keys():
		var spot := float(spots.get(ticker, 0.0))
		var short_calls := 0
		var long_calls := 0
		var short_puts := 0
		var long_puts := 0
		for position in positions:
			if String(position.get("ticker", "")) != String(ticker):
				continue
			var qty := int(position.get("qty", 0))
			var is_call := String(position.get("type", "call")) == "call"
			if is_call and qty < 0:
				short_calls += -qty
			elif is_call and qty > 0:
				long_calls += qty
			elif qty < 0:
				short_puts += -qty
			elif qty > 0:
				long_puts += qty
		var stock: Dictionary = account.get("positions", {}).get(String(ticker), {})
		var shares := maxi(0, int(stock.get("qty", 0)))
		var coverable := int(floor(float(shares) / float(CONTRACT_SIZE))) + long_calls
		var naked_calls := maxi(0, short_calls - coverable)
		collateral += float(naked_calls) * spot * CONTRACT_SIZE * 0.2
		var remaining_covered := mini(short_puts, long_puts)
		for position in positions:
			if String(position.get("ticker", "")) != String(ticker) \
					or String(position.get("type", "")) != "put":
				continue
			var qty := int(position.get("qty", 0))
			if qty >= 0:
				continue
			var quantity := -qty
			var covered := mini(quantity, remaining_covered)
			remaining_covered -= covered
			var naked := quantity - covered
			collateral += float(naked) * float(position.get("strike", 0.0)) * CONTRACT_SIZE
	return SmaFormat.round_to(collateral, 2)
