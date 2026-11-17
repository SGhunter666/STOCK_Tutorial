## UK tax estimator for the 2026/27 tax year. This is an educational estimate:
## it applies same-day / 30-day / Section 104 matching to the share ledger,
## capital gains with the annual exempt amount, the dividend allowance and ISA
## exemption, and SDRT on purchases marked as UK shares. It never mutates the
## account and never invents a tax year.
class_name SmaTax
extends RefCounted

const TAX_YEAR := "2026/27"
const YEAR_START := "2026-04-06"
const YEAR_END := "2027-04-05"
const ANNUAL_EXEMPT_AMOUNT := 3000.0
const BASIC_RATE_BAND := 37700.0
const ADDITIONAL_RATE_THRESHOLD := 125140.0
const CGT_BASIC_RATE := 0.18
const CGT_HIGHER_RATE := 0.24
const DIVIDEND_ALLOWANCE := 500.0
const DIVIDEND_BASIC_RATE := 0.1075
const DIVIDEND_HIGHER_RATE := 0.3575
const DIVIDEND_ADDITIONAL_RATE := 0.3935
const ISA_ALLOWANCE := 20000.0
const SDRT_RATE := 0.005
const SOURCE_IDS := ["cgt", "shares", "dividends", "isa", "sdrt"]
const LIMITATIONS := ["estimateOnly", "simulatedPrices", "fixedFxRate", "sameDayFifo",
	"tradeLogLimit", "dividendLogLimit", "excludedAssets"]
const _MS_DAY := 86400.0


static func default_config() -> Dictionary:
	return {
		"accountType": "gia", "incomeBand": "basic", "taxableIncome": 0.0,
		"fxRate": 0.79, "isaContributions": 0.0, "ukShares": true,
	}


static func _round2(value: float) -> float:
	return SmaFormat.round_to(value, 2)


static func _date_ms(iso: String) -> float:
	return float(Time.get_unix_time_from_datetime_string(iso + "T00:00:00"))


static func _within_year(iso: String) -> bool:
	return iso >= YEAR_START and iso <= YEAR_END


static func _trade_qty(trade: Dictionary) -> int:
	return maxi(0, int(floor(absf(float(trade.get("qty", 0))))))


static func _trade_price(trade: Dictionary) -> float:
	var price := float(trade.get("price", 0.0))
	return price if price > 0.0 else 0.0


static func _cost(trade: Dictionary, key: String) -> float:
	var value := float(trade.get(key, 0.0))
	return value if value > 0.0 else 0.0


## Estimates tax from the share trade log and dividend ledger.
static func estimate(config: Dictionary) -> Dictionary:
	var account_type := String(config.get("accountType", "gia"))
	if account_type != "gia" and account_type != "isa":
		return {"ok": false, "error": "error.ukTaxAccount"}
	var income_band := String(config.get("incomeBand", ""))
	if not ["", "basic", "higher", "additional"].has(income_band):
		return {"ok": false, "error": "error.ukTaxIncome"}
	var income := float(config.get("taxableIncome", 0.0))
	if not is_finite(income) or income < 0.0:
		return {"ok": false, "error": "error.ukTaxIncome"}
	var fx_rate := float(config.get("fxRate", 1.0))
	if not is_finite(fx_rate) or fx_rate <= 0.0:
		return {"ok": false, "error": "error.ukTaxFx"}
	var contributions := maxf(0.0, float(config.get("isaContributions", 0.0)))
	var uk_share_set := {}
	for ticker in config.get("ukShareTickers", []):
		var symbol := String(ticker).to_upper()
		if symbol != "":
			uk_share_set[symbol] = true
	var all_tickers_uk := bool(config.get("ukShares", false)) and uk_share_set.is_empty()

	var warnings: Array = []
	var excluded := 0
	var events: Array = []
	var trades: Array = config.get("trades", [])
	for index in trades.size():
		var trade: Dictionary = trades[index]
		var side := String(trade.get("side", ""))
		if side != "buy" and side != "sell":
			excluded += 1
			continue
		var qty := _trade_qty(trade)
		var price := _trade_price(trade)
		if qty <= 0 or price <= 0.0:
			continue
		var day_index := int(trade.get("day", 0))
		events.append({
			"source": trade, "index": index, "side": side,
			"ticker": String(trade.get("ticker", "")).to_upper(),
			"qty": qty, "price": price, "day": day_index,
			"tick": int(trade.get("second", 0)),
			"id": int(trade.get("id", index)),
			"date": SmaCalendar.iso_date(day_index),
		})
	events.sort_custom(func(a, b):
		if int(a["day"]) != int(b["day"]):
			return int(a["day"]) < int(b["day"])
		if int(a["tick"]) != int(b["tick"]):
			return int(a["tick"]) < int(b["tick"])
		if int(a["id"]) != int(b["id"]):
			return int(a["id"]) < int(b["id"])
		return int(a["index"]) < int(b["index"]))

	var lots_by_ticker := {}
	for event in events:
		if String(event["side"]) != "buy":
			continue
		var source: Dictionary = event["source"]
		var gross := float(event["qty"]) * float(event["price"])
		var fee := _cost(source, "fee")
		var levy := _cost(source, "levy")
		var declared_sdrt := _cost(source, "sdrt")
		var is_uk := String(source.get("instrumentType", "")) == "ukShare" \
			or all_tickers_uk or uk_share_set.has(String(event["ticker"]))
		var sdrt := declared_sdrt
		if sdrt <= 0.0 and is_uk:
			sdrt = _round2(gross * SDRT_RATE)
		var total := (gross + fee + levy + sdrt) * fx_rate
		var lot := {
			"id": int(event["id"]), "index": int(event["index"]),
			"ticker": String(event["ticker"]), "date": String(event["date"]),
			"day": int(event["day"]), "qty": int(event["qty"]),
			"remaining": int(event["qty"]),
			"unitCostGbp": total / float(event["qty"]),
			"sdrtLocal": sdrt, "inPool": false,
		}
		event["lot"] = lot
		var ticker := String(event["ticker"])
		if not lots_by_ticker.has(ticker):
			lots_by_ticker[ticker] = []
		lots_by_ticker[ticker].append(lot)

	var pools := {}
	var disposals: Array = []
	var ignored_disposals := 0
	var sdrt_total := 0.0
	var sdrt_consideration := 0.0
	var sdrt_purchases: Array = []

	for event in events:
		var ticker := String(event["ticker"])
		if not pools.has(ticker):
			pools[ticker] = {"qty": 0.0, "cost": 0.0}
		var pool: Dictionary = pools[ticker]
		if String(event["side"]) == "buy":
			var lot: Dictionary = event["lot"]
			if float(lot["sdrtLocal"]) > 0.0 and _within_year(String(event["date"])):
				sdrt_total += float(lot["sdrtLocal"]) * fx_rate
				sdrt_consideration += float(event["qty"]) * float(event["price"]) * fx_rate
				sdrt_purchases.append({
					"ticker": ticker, "date": String(event["date"]),
					"qty": int(event["qty"]),
					"consideration": _round2(float(event["qty"]) * float(event["price"]) * fx_rate),
					"sdrt": _round2(float(lot["sdrtLocal"]) * fx_rate),
				})
			if int(lot["remaining"]) > 0:
				pool["qty"] = float(pool["qty"]) + float(lot["remaining"])
				pool["cost"] = float(pool["cost"]) \
					+ float(lot["remaining"]) * float(lot["unitCostGbp"])
				lot["inPool"] = true
			continue

		var remaining := int(event["qty"])
		var matches := {
			"sameDay": {"qty": 0, "cost": 0.0},
			"thirtyDay": {"qty": 0, "cost": 0.0},
			"pool": {"qty": 0, "cost": 0.0},
		}

		# 1. Same-day acquisitions match first, regardless of intraday order.
		var same_day: Array = []
		for lot_entry in lots_by_ticker.get(ticker, []):
			if String(lot_entry["date"]) == String(event["date"]) \
					and int(lot_entry["remaining"]) > 0:
				same_day.append(lot_entry)
		same_day.sort_custom(func(a, b):
			if int(a["id"]) != int(b["id"]):
				return int(a["id"]) < int(b["id"])
			return int(a["index"]) < int(b["index"]))
		for lot_entry in same_day:
			if remaining <= 0:
				break
			var take: int = mini(remaining, int(lot_entry["remaining"]))
			var cost := float(take) * float(lot_entry["unitCostGbp"])
			if bool(lot_entry["inPool"]):
				pool["qty"] = float(pool["qty"]) - float(take)
				pool["cost"] = float(pool["cost"]) - cost
				if float(pool["qty"]) <= 0.000000001:
					pool["qty"] = 0.0
					pool["cost"] = 0.0
			lot_entry["remaining"] = int(lot_entry["remaining"]) - take
			remaining -= take
			matches["sameDay"]["qty"] = int(matches["sameDay"]["qty"]) + take
			matches["sameDay"]["cost"] = float(matches["sameDay"]["cost"]) + cost

		# 2. Acquisitions in the following 30 calendar days, earliest first.
		if remaining > 0:
			var sale_ms := _date_ms(String(event["date"]))
			var future: Array = []
			for lot_entry in lots_by_ticker.get(ticker, []):
				if int(lot_entry["remaining"]) <= 0:
					continue
				if String(lot_entry["date"]) <= String(event["date"]):
					continue
				if _date_ms(String(lot_entry["date"])) > sale_ms + 30.0 * _MS_DAY:
					continue
				future.append(lot_entry)
			future.sort_custom(func(a, b):
				if String(a["date"]) != String(b["date"]):
					return String(a["date"]) < String(b["date"])
				if int(a["id"]) != int(b["id"]):
					return int(a["id"]) < int(b["id"])
				return int(a["index"]) < int(b["index"]))
			for lot_entry in future:
				if remaining <= 0:
					break
				var take: int = mini(remaining, int(lot_entry["remaining"]))
				lot_entry["remaining"] = int(lot_entry["remaining"]) - take
				remaining -= take
				matches["thirtyDay"]["qty"] = int(matches["thirtyDay"]["qty"]) + take
				matches["thirtyDay"]["cost"] = float(matches["thirtyDay"]["cost"]) \
					+ float(take) * float(lot_entry["unitCostGbp"])

		# 3. The Section 104 pool at its average cost.
		if remaining > 0 and float(pool["qty"]) > 0.0:
			var take_pool: int = mini(remaining, int(floor(float(pool["qty"]))))
			var average := float(pool["cost"]) / float(pool["qty"])
			var cost := float(take_pool) * average
			pool["qty"] = float(pool["qty"]) - float(take_pool)
			pool["cost"] = float(pool["cost"]) - cost
			if float(pool["qty"]) <= 0.000000001:
				pool["qty"] = 0.0
				pool["cost"] = 0.0
			remaining -= take_pool
			matches["pool"]["qty"] = int(matches["pool"]["qty"]) + take_pool
			matches["pool"]["cost"] = float(matches["pool"]["cost"]) + cost

		if remaining > 0:
			warnings.append({"code": "poolMismatch",
				"params": {"ticker": ticker, "qty": remaining}})

		var source: Dictionary = event["source"]
		var gross_local := float(event["qty"]) * float(event["price"])
		var fee_local := _cost(source, "fee")
		var levy_local := _cost(source, "levy")
		var proceeds := _round2((gross_local - fee_local - levy_local) * fx_rate)
		var cost_basis := float(matches["sameDay"]["cost"]) \
			+ float(matches["thirtyDay"]["cost"]) + float(matches["pool"]["cost"])
		var gain := proceeds - cost_basis
		if not _within_year(String(event["date"])):
			ignored_disposals += 1
			continue
		disposals.append({
			"ticker": ticker, "date": String(event["date"]), "day": int(event["day"]),
			"qty": int(event["qty"]), "proceeds": proceeds,
			"costBasis": _round2(cost_basis), "gain": _round2(gain),
			"matches": {
				"sameDay": {"qty": int(matches["sameDay"]["qty"]),
					"cost": _round2(float(matches["sameDay"]["cost"]))},
				"thirtyDay": {"qty": int(matches["thirtyDay"]["qty"]),
					"cost": _round2(float(matches["thirtyDay"]["cost"]))},
				"pool": {"qty": int(matches["pool"]["qty"]),
					"cost": _round2(float(matches["pool"]["cost"]))},
			},
		})

	if excluded > 0:
		warnings.append({"code": "excludedTrades", "params": {"count": excluded}})

	var dividend_rows: Array = []
	for row in config.get("dividends", []):
		var amount := float(row.get("amount", 0.0))
		if amount <= 0.0:
			continue
		var day_index := int(row.get("day", 0))
		var date := SmaCalendar.iso_date(day_index)
		if not _within_year(date):
			continue
		dividend_rows.append({
			"ticker": String(row.get("ticker", "")).to_upper(), "day": day_index,
			"date": date, "amount": _round2(amount * fx_rate),
		})
	dividend_rows.sort_custom(func(a, b): return int(a["day"]) < int(b["day"]))
	var dividends_gross := 0.0
	for row in dividend_rows:
		dividends_gross += float(row["amount"])
	var dividend_allowance_used := minf(dividends_gross, DIVIDEND_ALLOWANCE)
	var dividend_taxable := dividends_gross - dividend_allowance_used

	var gross_proceeds := 0.0
	var allowable_costs := 0.0
	var gains := 0.0
	var losses := 0.0
	for row in disposals:
		gross_proceeds += float(row["proceeds"])
		allowable_costs += float(row["costBasis"])
		gains += maxf(0.0, float(row["gain"]))
		losses += maxf(0.0, -float(row["gain"]))
	var net_gain := gains - losses
	var isa := account_type == "isa"
	var exempt_used := 0.0
	if not isa and net_gain > 0.0:
		exempt_used = minf(net_gain, ANNUAL_EXEMPT_AMOUNT)
	var taxable_gain := 0.0 if isa else maxf(0.0, net_gain - exempt_used)

	# Dividends are the top slice of income and consume the basic-rate band
	# before CGT. The allowance occupies band at a 0% rate.
	var band_floor := 0.0
	if income_band == "additional":
		band_floor = ADDITIONAL_RATE_THRESHOLD
	elif income_band == "higher":
		band_floor = BASIC_RATE_BAND
	var effective_income := maxf(income, band_floor)
	var available_basic := 0.0
	if not isa:
		available_basic = maxf(0.0, BASIC_RATE_BAND - effective_income - dividends_gross)
	var cgt_basic_part := 0.0 if isa else minf(taxable_gain, available_basic)
	var cgt_higher_part := 0.0 if isa else maxf(0.0, taxable_gain - cgt_basic_part)
	var cgt_basic := cgt_basic_part * CGT_BASIC_RATE
	var cgt_higher := cgt_higher_part * CGT_HIGHER_RATE
	var cgt_tax := 0.0 if isa else cgt_basic + cgt_higher

	var dividend_start := effective_income + dividend_allowance_used
	var basic_room := maxf(0.0, BASIC_RATE_BAND - dividend_start)
	var dividend_basic_part := minf(dividend_taxable, basic_room)
	var after_basic := dividend_taxable - dividend_basic_part
	var higher_room := maxf(0.0,
		ADDITIONAL_RATE_THRESHOLD - maxf(dividend_start, BASIC_RATE_BAND))
	var dividend_higher_part := minf(after_basic, higher_room)
	var dividend_additional_part := maxf(0.0, after_basic - dividend_higher_part)
	var dividend_basic := dividend_basic_part * DIVIDEND_BASIC_RATE
	var dividend_higher := dividend_higher_part * DIVIDEND_HIGHER_RATE
	var dividend_additional := dividend_additional_part * DIVIDEND_ADDITIONAL_RATE
	var dividend_tax := 0.0 if isa else dividend_basic + dividend_higher + dividend_additional

	var isa_remaining := maxf(0.0, ISA_ALLOWANCE - contributions)
	var isa_excess := maxf(0.0, contributions - ISA_ALLOWANCE)
	if isa_excess > 0.0:
		warnings.append({"code": "isaExcess", "params": {"amount": _round2(isa_excess)}})

	var total_tax := cgt_tax + dividend_tax + sdrt_total

	return {
		"ok": true, "taxYear": TAX_YEAR, "accountType": account_type,
		"fxRate": fx_rate, "currency": String(config.get("currency", "USD")),
		"cgt": {
			"exempt": isa,
			"grossProceeds": _round2(gross_proceeds),
			"allowableCosts": _round2(allowable_costs),
			"gains": _round2(gains), "losses": _round2(losses),
			"netGain": _round2(net_gain),
			"annualExemptAmount": ANNUAL_EXEMPT_AMOUNT,
			"annualExemptAmountUsed": _round2(exempt_used),
			"taxableGain": _round2(taxable_gain),
			"basicPart": _round2(cgt_basic_part),
			"higherPart": _round2(cgt_higher_part),
			"basicTax": _round2(cgt_basic), "higherTax": _round2(cgt_higher),
			"tax": _round2(cgt_tax),
			"effectiveRate": _round2(cgt_tax / net_gain * 100.0) if net_gain > 0.0 else 0.0,
		},
		"dividends": {
			"exempt": isa, "rows": dividend_rows,
			"gross": _round2(dividends_gross),
			"allowance": DIVIDEND_ALLOWANCE,
			"allowanceUsed": _round2(dividend_allowance_used),
			"taxable": _round2(dividend_taxable),
			"basicPart": _round2(dividend_basic_part),
			"higherPart": _round2(dividend_higher_part),
			"additionalPart": _round2(dividend_additional_part),
			"basicTax": _round2(dividend_basic),
			"higherTax": _round2(dividend_higher),
			"additionalTax": _round2(dividend_additional),
			"tax": _round2(dividend_tax),
		},
		"isa": {
			"allowance": ISA_ALLOWANCE, "contributions": _round2(contributions),
			"remaining": _round2(isa_remaining), "excess": _round2(isa_excess),
			"exempt": true,
		},
		"sdrt": {
			"rate": SDRT_RATE, "total": _round2(sdrt_total),
			"consideration": _round2(sdrt_consideration),
			"purchases": sdrt_purchases,
		},
		"summary": {
			"grossProceeds": _round2(gross_proceeds),
			"allowableCosts": _round2(allowable_costs),
			"netGain": _round2(net_gain),
			"cgt": _round2(cgt_tax), "dividendTax": _round2(dividend_tax),
			"sdrt": _round2(sdrt_total), "totalTax": _round2(total_tax),
			"afterTaxGain": _round2(net_gain + dividends_gross - cgt_tax - dividend_tax),
		},
		"disposals": disposals,
		"ignoredDisposals": ignored_disposals,
		"warnings": warnings,
		"sources": SOURCE_IDS,
		"limitations": LIMITATIONS,
	}
