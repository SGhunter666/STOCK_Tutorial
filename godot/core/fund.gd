## Fund management engine. A fund has its own account, client units, a
## management-company ledger and a deterministic operating cycle. Fund assets are
## never mixed with the player's personal trading account.
class_name SmaFund
extends RefCounted

const RANK_REQUIREMENT := 5
const FEE_INTERVAL := 21
const CAPITAL_INTERVAL := 30
const REDEMPTION_DAYS := 5
const REDEMPTION_GRACE := 3
const MAX_DRAWDOWN := 40.0
const MAX_UNPAID_DAYS := 10
const MAX_RISK_DAYS := 15
const MAX_LEVERAGE_DAYS := 3
const COMPLIANCE_DAYS := 10
const KEY_PERSON_DAYS := 5
const COMPANY_SEED := 3000.0
const OPERATING_BASE := 1200.0
const OPERATING_PER_HEAD := 120.0
const AUM_OPTIONS := [250000.0, 1000000.0, 5000000.0]
const HURDLE_OPTIONS := [0.0, 0.02, 0.04]
const QUARTER_DAYS := 63

const STRATEGIES := {
	"longOnly": {"id": "longOnly", "nameKey": "fund.strategy.longOnly.name",
		"descKey": "fund.strategy.longOnly.desc", "maxPosition": 0.25, "minCash": 0.10},
	"macro": {"id": "macro", "nameKey": "fund.strategy.macro.name",
		"descKey": "fund.strategy.macro.desc", "maxPosition": 0.30, "minCash": 0.15},
	"quant": {"id": "quant", "nameKey": "fund.strategy.quant.name",
		"descKey": "fund.strategy.quant.desc", "maxPosition": 0.20, "minCash": 0.10},
	"marketNeutral": {"id": "marketNeutral", "nameKey": "fund.strategy.marketNeutral.name",
		"descKey": "fund.strategy.marketNeutral.desc", "maxPosition": 0.15, "minCash": 0.20},
}

const RISK_PROFILES := {
	"conservative": {"id": "conservative", "nameKey": "fund.riskProfile.conservative",
		"maxPosition": 0.15, "minCash": 0.20, "leverageLimit": 1.0, "expectedReturn": 6.0},
	"balanced": {"id": "balanced", "nameKey": "fund.riskProfile.balanced",
		"maxPosition": 0.25, "minCash": 0.10, "leverageLimit": 1.25, "expectedReturn": 10.0},
	"aggressive": {"id": "aggressive", "nameKey": "fund.riskProfile.aggressive",
		"maxPosition": 0.35, "minCash": 0.05, "leverageLimit": 1.5, "expectedReturn": 15.0},
}

const BENCHMARKS := {
	"index": {"id": "index", "nameKey": "fund.benchmark.index"},
	"mkt": {"id": "mkt", "nameKey": "fund.benchmark.mkt"},
	"cash": {"id": "cash", "nameKey": "fund.benchmark.cash"},
}

const TAX_PROFILES := {
	"none": {"id": "none", "nameKey": "fund.taxProfile.none",
		"capitalGainsRate": 0.0, "levyRate": 0.0},
	"flat15": {"id": "flat15", "nameKey": "fund.taxProfile.flat15",
		"capitalGainsRate": 0.15, "levyRate": 0.0},
	"flat25Levy": {"id": "flat25Levy", "nameKey": "fund.taxProfile.flat25Levy",
		"capitalGainsRate": 0.25, "levyRate": 0.001},
}

const ROLES := [
	{"id": "research", "nameKey": "fund.role.research.name",
		"descKey": "fund.role.research.desc", "salary": 700.0, "skill": 78,
		"person": "Maya Chen"},
	{"id": "quant", "nameKey": "fund.role.quant.name",
		"descKey": "fund.role.quant.desc", "salary": 900.0, "skill": 84,
		"person": "Owen Park"},
	{"id": "risk", "nameKey": "fund.role.risk.name",
		"descKey": "fund.role.risk.desc", "salary": 800.0, "skill": 86,
		"person": "Priya Nair"},
	{"id": "trader", "nameKey": "fund.role.trader.name",
		"descKey": "fund.role.trader.desc", "salary": 600.0, "skill": 80,
		"person": "Lucas Reed"},
	{"id": "macro", "nameKey": "fund.role.macro.name",
		"descKey": "fund.role.macro.desc", "salary": 800.0, "skill": 82,
		"person": "Sofia Marin"},
	{"id": "operations", "nameKey": "fund.role.operations.name",
		"descKey": "fund.role.operations.desc", "salary": 500.0, "skill": 76,
		"person": "Daniel Cho"},
	{"id": "compliance", "nameKey": "fund.role.compliance.name",
		"descKey": "fund.role.compliance.desc", "salary": 750.0, "skill": 88,
		"person": "Elena Rossi"},
]

const CLIENT_POOL := [
	{"id": "northwind", "name": "Northwind Pension", "typeKey": "fund.clientType.pension",
		"risk": "low", "horizon": "long", "liquidity": "low"},
	{"id": "blueharbor", "name": "Blue Harbor Endowment", "typeKey": "fund.clientType.endowment",
		"risk": "low", "horizon": "veryLong", "liquidity": "low"},
	{"id": "kestrel", "name": "Kestrel Family Office", "typeKey": "fund.clientType.familyOffice",
		"risk": "medium", "horizon": "medium", "liquidity": "medium"},
	{"id": "meridian", "name": "Meridian Insurance", "typeKey": "fund.clientType.insurance",
		"risk": "low", "horizon": "long", "liquidity": "medium"},
	{"id": "silverline", "name": "Silverline Capital", "typeKey": "fund.clientType.fundOfFunds",
		"risk": "medium", "horizon": "medium", "liquidity": "high"},
	{"id": "cedar", "name": "Cedar Partners", "typeKey": "fund.clientType.privateClient",
		"risk": "high", "horizon": "short", "liquidity": "high"},
	{"id": "atlas", "name": "Atlas Trust", "typeKey": "fund.clientType.trust",
		"risk": "medium", "horizon": "long", "liquidity": "low"},
	{"id": "horizon", "name": "Horizon Foundation", "typeKey": "fund.clientType.foundation",
		"risk": "low", "horizon": "veryLong", "liquidity": "low"},
]

const PEER_FUNDS := [
	{"id": "northstar", "nameKey": "fund.peer.northstar", "annual": 0.09, "aum": 42000000.0},
	{"id": "quantedge", "nameKey": "fund.peer.quantedge", "annual": 0.12, "aum": 18000000.0},
	{"id": "macroline", "nameKey": "fund.peer.macroline", "annual": 0.06, "aum": 35000000.0},
	{"id": "cedarrock", "nameKey": "fund.peer.cedarrock", "annual": 0.15, "aum": 9000000.0},
	{"id": "steady", "nameKey": "fund.peer.steady", "annual": 0.04, "aum": 60000000.0},
]

const CLIENT_SPLIT := [0.4, 0.3, 0.2, 0.1]
const CLIENT_EXPECTED := {"low": 6.0, "medium": 10.0, "high": 15.0}
const PLAN_DEFAULT := {
	"enabled": false, "strategyId": "smaCross",
	"params": {"fast": 20.0, "slow": 50.0, "rsiPeriod": 14.0, "rsiEntry": 30.0,
		"rsiExit": 70.0, "lookback": 60.0, "threshold": 2.0},
	"topN": 5, "rebalanceDays": 21, "cashBuffer": 0.1, "autoRebalance": false,
	"lastPlanDay": null, "lastAutoDay": null, "plan": null,
}
const RESEARCH_GRID := {
	"topN": [3, 5, 7], "cashBuffer": [0.05, 0.1, 0.2],
	"rebalanceDays": [10, 21, 42],
}


static func tax_profile(profile_id: String) -> Dictionary:
	return TAX_PROFILES.get(profile_id, TAX_PROFILES["none"])


static func _round2(value: float) -> float:
	return SmaFormat.round_to(value, 2)


static func _account(cash: float) -> Dictionary:
	return {
		"cash": cash, "initialCash": cash, "positions": {}, "trades": [],
		"dividends": [], "fees": 0.0, "realizedPnl": 0.0, "careerIncome": 0.0,
		"equityHistory": [{"day": 0, "equity": cash}],
	}


static func create_state() -> Dictionary:
	return {
		"status": "none", "name": "", "strategy": "longOnly",
		"riskProfile": "balanced", "initialAum": 0.0, "createdDay": null,
		"account": null, "units": 0.0, "highWaterMark": 1.0, "peakNav": 1.0,
		"benchmarkId": "index", "benchmarkStart": 0.0, "hurdleRate": 0.0,
		"taxProfileId": "none", "managementRate": 0.02, "performanceRate": 0.2,
		"maxPosition": 0.25, "minCash": 0.1, "leverageEnabled": false,
		"leverageLimit": 1.0, "leverageBreachDays": 0, "companyCash": 0.0,
		"operatingCosts": 0.0, "operatingDue": 0.0, "unpaidCostDays": 0,
		"keyPersonLeft": "", "managementFees": 0.0, "performanceFees": 0.0,
		"feePayable": 0.0, "payrollDue": 0.0, "unpaidSalaryDays": 0,
		"riskBreachDays": 0, "withdrawnToPersonal": 0.0, "lastFeeDay": 0,
		"lastPayrollDay": 0, "lastCapitalDay": 0, "clients": [], "candidates": [],
		"employees": [], "quantPlan": PLAN_DEFAULT.duplicate(true),
		"insights": [], "history": [], "events": [], "closedDay": null,
		"closeReason": "", "seed": "academy-2026",
	}


static func normalize_state(saved: Variant, day: int = 0, seed: String = "academy-2026") -> Dictionary:
	if typeof(saved) != TYPE_DICTIONARY:
		return create_state()
	var data: Dictionary = saved
	if String(data.get("status", "none")) == "none":
		return create_state()
	var state := create_state()
	for key in state.keys():
		if data.has(key):
			state[key] = data[key]
	if typeof(state["account"]) != TYPE_DICTIONARY:
		state["account"] = _account(float(state.get("initialAum", 0.0)))
	for key in ["positions", "trades", "dividends", "equityHistory"]:
		if typeof(state["account"].get(key)) != TYPE_ARRAY and key != "positions":
			state["account"][key] = []
	state["units"] = maxf(0.0001, float(state["units"]))
	state["highWaterMark"] = maxf(0.0001, float(state["highWaterMark"]))
	state["peakNav"] = maxf(0.0001, float(state["peakNav"]))
	state["seed"] = seed
	state["quantPlan"] = _normalize_plan(state.get("quantPlan", {}))
	for key in ["clients", "candidates", "employees", "insights", "history", "events"]:
		if typeof(state[key]) != TYPE_ARRAY:
			state[key] = []
	return state


static func _normalize_plan(source: Variant) -> Dictionary:
	var plan: Dictionary = PLAN_DEFAULT.duplicate(true)
	if typeof(source) == TYPE_DICTIONARY:
		for key in plan.keys():
			if source.has(key):
				plan[key] = source[key]
	plan["topN"] = clampi(int(plan["topN"]), 2, 10)
	plan["rebalanceDays"] = clampi(int(plan["rebalanceDays"]), 5, 60)
	plan["cashBuffer"] = clampf(float(plan["cashBuffer"]), 0.0, 0.5)
	plan["params"] = SmaQuant.normalize_params(String(plan["strategyId"]), plan["params"])
	return plan


static func unlocked(career: Dictionary) -> bool:
	return int(career.get("rank", 1)) >= RANK_REQUIREMENT


# ---------------------------------------------------------------------------
# Account valuation
# ---------------------------------------------------------------------------

static func equity(account: Dictionary, quotes: Dictionary) -> float:
	var value := float(account.get("cash", 0.0))
	for ticker in account.get("positions", {}).keys():
		var position: Dictionary = account["positions"][ticker]
		var quote: Dictionary = quotes.get(String(ticker), {})
		value += float(position.get("qty", 0)) * float(quote.get("last",
			position.get("last", position.get("avgCost", 0.0))))
	return _round2(value)


static func position_rows(account: Dictionary, quotes: Dictionary) -> Array:
	var rows: Array = []
	for ticker in account.get("positions", {}).keys():
		var position: Dictionary = account["positions"][ticker]
		var quote: Dictionary = quotes.get(String(ticker), {})
		var last := float(quote.get("last", position.get("avgCost", 0.0)))
		var qty := int(position.get("qty", 0))
		rows.append({
			"ticker": String(ticker), "qty": qty,
			"avgCost": float(position.get("avgCost", 0.0)), "last": last,
			"value": _round2(float(qty) * last),
			"pnl": _round2((last - float(position.get("avgCost", 0.0))) * float(qty)),
		})
	rows.sort_custom(func(a, b): return float(a["value"]) > float(b["value"]))
	return rows


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

static func setup(name: String, strategy_id: String, risk_id: String, aum: float,
		management_rate: float, performance_rate: float, benchmark_id: String,
		hurdle_rate: float, leverage_enabled: bool, tax_profile_id: String,
		day: int, seed: String, benchmark_start: float) -> Dictionary:
	var clean_name := name.strip_edges().substr(0, 36)
	if clean_name.length() < 2:
		return {"ok": false, "error": "fund.errorName"}
	if not STRATEGIES.has(strategy_id):
		strategy_id = "longOnly"
	if not RISK_PROFILES.has(risk_id):
		risk_id = "balanced"
	if not AUM_OPTIONS.has(aum):
		aum = AUM_OPTIONS[1]
	if not BENCHMARKS.has(benchmark_id):
		benchmark_id = "index"
	var strategy_def: Dictionary = STRATEGIES[strategy_id]
	var risk_def: Dictionary = RISK_PROFILES[risk_id]
	var picks := _pick_clients(seed, strategy_id)
	var clients: Array = []
	var units := 0.0
	for index in picks.size():
		var entry: Dictionary = picks[index]
		var principal := _round2(aum * float(CLIENT_SPLIT[index % CLIENT_SPLIT.size()]))
		var client_units := principal
		units += client_units
		clients.append({
			"id": "%s-%d" % [String(entry["id"]), index], "name": String(entry["name"]),
			"typeKey": String(entry["typeKey"]), "risk": String(entry["risk"]),
			"expectedReturn": float(CLIENT_EXPECTED.get(String(entry["risk"]), 10.0)),
			"horizon": String(entry["horizon"]), "liquidity": String(entry["liquidity"]),
			"principal": principal, "units": client_units,
			"trust": 78.0 if String(entry["risk"]) == "low" else (
				58.0 if String(entry["risk"]) == "high" else 68.0),
			"joinedDay": day, "request": null,
		})
	var candidates: Array = []
	for entry in CLIENT_POOL:
		if candidates.size() >= 2:
			break
		var used := false
		for pick in picks:
			if String(pick["id"]) == String(entry["id"]):
				used = true
				break
		if used:
			continue
		candidates.append({
			"id": "%s-prospect" % String(entry["id"]), "name": String(entry["name"]),
			"typeKey": String(entry["typeKey"]), "risk": String(entry["risk"]),
			"horizon": String(entry["horizon"]), "liquidity": String(entry["liquidity"]),
			"principal": _round2(maxf(50000.0, aum * 0.1)),
		})
	var leverage_limit := float(risk_def["leverageLimit"]) if leverage_enabled else 1.0
	var state := create_state()
	state["status"] = "active"
	state["name"] = clean_name
	state["strategy"] = strategy_id
	state["riskProfile"] = risk_id
	state["initialAum"] = aum
	state["createdDay"] = day
	state["account"] = _account(aum)
	state["units"] = units
	state["benchmarkId"] = benchmark_id
	state["benchmarkStart"] = benchmark_start
	state["hurdleRate"] = hurdle_rate if HURDLE_OPTIONS.has(hurdle_rate) else 0.0
	state["taxProfileId"] = tax_profile(tax_profile_id)["id"]
	state["managementRate"] = management_rate if [0.01, 0.02].has(management_rate) else 0.02
	state["performanceRate"] = performance_rate if [0.1, 0.2].has(performance_rate) else 0.2
	state["maxPosition"] = minf(float(strategy_def["maxPosition"]), float(risk_def["maxPosition"]))
	state["minCash"] = maxf(float(strategy_def["minCash"]), float(risk_def["minCash"]))
	state["leverageEnabled"] = leverage_enabled
	state["leverageLimit"] = leverage_limit
	state["companyCash"] = COMPANY_SEED
	state["lastFeeDay"] = day
	state["lastPayrollDay"] = day
	state["lastCapitalDay"] = day
	state["clients"] = clients
	state["candidates"] = candidates
	state["history"] = [{"day": day, "nav": aum, "navPerUnit": 1.0,
		"cashRatio": 1.0, "drawdownPct": 0.0, "aum": aum}]
	state["events"] = [{"day": day, "type": "created", "amount": aum}]
	state["seed"] = seed
	return {"ok": true, "fund": state}


static func _pick_clients(seed: String, strategy_id: String) -> Array:
	var offset: int = absi(hash("%s:%s:clients" % [seed, strategy_id])) % CLIENT_POOL.size()
	var picks: Array = []
	for index in 4:
		picks.append(CLIENT_POOL[(offset + index) % CLIENT_POOL.size()])
	return picks


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

static func benchmark_return(fund: Dictionary, index_value: float,
		mkt_price: float) -> float:
	var benchmark_id := String(fund.get("benchmarkId", "index"))
	if benchmark_id == "cash":
		return 0.0
	var current := mkt_price if benchmark_id == "mkt" else index_value
	var start := float(fund.get("benchmarkStart", 0.0))
	if start <= 0.0 or current <= 0.0:
		return 0.0
	return (current / start - 1.0) * 100.0


static func metrics(fund: Dictionary, quotes: Dictionary, index_value: float,
		mkt_price: float, day: int) -> Dictionary:
	if fund.is_empty() or String(fund.get("status", "none")) == "none" \
			or typeof(fund.get("account")) != TYPE_DICTIONARY:
		return {}
	var account: Dictionary = fund["account"]
	var fee_payable := float(fund.get("feePayable", 0.0))
	var nav := maxf(0.0, equity(account, quotes) - fee_payable)
	var units := maxf(0.0001, float(fund.get("units", 0.0)))
	var nav_per_unit := nav / units
	var total_return := (nav_per_unit - 1.0) * 100.0
	var peak := maxf(1.0, maxf(float(fund.get("peakNav", 1.0)), nav_per_unit))
	var drawdown := (peak - nav_per_unit) / peak * 100.0 if peak > 0.0 else 0.0
	var cash_ratio := float(account.get("cash", 0.0)) / nav * 100.0 if nav > 0.0 else 0.0
	var rows := position_rows(account, quotes)
	var top: Dictionary = {}
	for row in rows:
		if top.is_empty() or absf(float(row["value"])) > absf(float(top["value"])):
			top = row
	var top_weight := absf(float(top.get("value", 0.0))) / nav * 100.0 if nav > 0.0 else 0.0
	var benchmark := benchmark_return(fund, index_value, mkt_price)
	var holdings := 0.0
	for row in rows:
		holdings += absf(float(row["value"]))
	var leverage := holdings / nav if nav > 0.0 else 0.0
	var leverage_limit := maxf(1.0, float(fund.get("leverageLimit", 1.0)))
	var cash_floor := -(leverage_limit - 1.0) * 100.0 if leverage_limit > 1.0 \
		else float(fund.get("minCash", 0.0)) * 100.0
	var weighted_expected := 0.0
	for client in fund.get("clients", []):
		weighted_expected += float(client.get("units", 0.0)) \
			* float(client.get("expectedReturn", 0.0))
	return {
		"nav": _round2(nav), "units": units, "navPerUnit": nav_per_unit,
		"totalReturn": total_return, "drawdown": drawdown,
		"cashRatio": cash_ratio, "topTicker": String(top.get("ticker", "")),
		"topWeight": top_weight, "holdingsValue": _round2(holdings),
		"benchmark": benchmark, "alpha": total_return - benchmark,
		"benchmarkId": String(fund.get("benchmarkId", "index")),
		"hurdleRate": float(fund.get("hurdleRate", 0.0)), "feePayable": fee_payable,
		"cash": float(account.get("cash", 0.0)), "positionCount": rows.size(),
		"maxPositionPct": float(fund.get("maxPosition", 0.0)) * 100.0,
		"minCashPct": float(fund.get("minCash", 0.0)) * 100.0,
		"cashFloorPct": cash_floor, "cashBreach": cash_ratio < cash_floor,
		"positionBreach": top_weight > float(fund.get("maxPosition", 0.0)) * 100.0,
		"leverage": leverage, "leverageEnabled": bool(fund.get("leverageEnabled", false)),
		"leverageLimit": leverage_limit,
		"leverageBreach": leverage > leverage_limit + 0.0001,
		"leverageDays": int(fund.get("leverageBreachDays", 0)),
		"operatingCosts": float(fund.get("operatingCosts", 0.0)),
		"operatingDue": float(fund.get("operatingDue", 0.0)),
		"avgExpectedReturn": weighted_expected / units if units > 0.0 else 0.0,
		"drawdownLimit": MAX_DRAWDOWN, "riskDays": int(fund.get("riskBreachDays", 0)),
		"day": day,
	}


static func leaderboard(fund: Dictionary, day: int) -> Array:
	if fund.is_empty() or String(fund.get("status", "none")) == "none":
		return []
	var days := maxi(0, day - int(fund.get("createdDay", 0)))
	var rows: Array = []
	for peer in PEER_FUNDS:
		var total_return := (pow(1.0 + float(peer["annual"]), float(days) / 252.0) - 1.0) * 100.0
		rows.append({"id": String(peer["id"]), "nameKey": String(peer["nameKey"]),
			"totalReturn": total_return,
			"aum": float(peer["aum"]) * (1.0 + total_return / 100.0), "simulated": true})
	return rows


# ---------------------------------------------------------------------------
# Trading
# ---------------------------------------------------------------------------

static func _trade_fee(fund: Dictionary) -> float:
	for employee in fund.get("employees", []):
		if String(employee.get("id", "")) == "trader":
			return 0.5
	return 1.0


static func buy(fund: Dictionary, quotes: Dictionary, ticker: String, qty: int,
		day: int) -> Dictionary:
	if String(fund.get("status", "")) != "active":
		return {"ok": false, "error": "fund.errorNotActive"}
	var symbol := ticker.to_upper()
	var quote: Dictionary = quotes.get(symbol, {})
	if quote.is_empty():
		return {"ok": false, "error": "error.unknownTicker"}
	var quantity := int(floor(float(qty)))
	if quantity <= 0:
		return {"ok": false, "error": "error.qtyInvalid"}
	var price := _round2(float(quote.get("ask", quote.get("last", 0.0))))
	if price <= 0.0:
		return {"ok": false, "error": "error.priceInvalid"}
	var profile := tax_profile(String(fund.get("taxProfileId", "none")))
	var fee := _trade_fee(fund)
	var levy := float(quantity) * price * float(profile["levyRate"])
	var nav := maxf(0.0, equity(fund["account"], quotes) - float(fund.get("feePayable", 0.0)))
	if nav <= 0.0:
		return {"ok": false, "error": "fund.errorNoNav"}
	var account: Dictionary = fund["account"]
	var existing := int(account["positions"].get(symbol, {}).get("qty", 0))
	var next_value := float(existing + quantity) * price
	if next_value > nav * float(fund.get("maxPosition", 1.0)) + 0.000001:
		return {"ok": false, "error": "fund.errorPositionCap"}
	var holdings := 0.0
	for row in position_rows(account, quotes):
		holdings += absf(float(row["value"]))
	var leverage_limit := maxf(1.0, float(fund.get("leverageLimit", 1.0)))
	if holdings + float(quantity) * price > nav * leverage_limit + 0.000001:
		return {"ok": false, "error": "fund.errorLeverage"}
	var next_cash := float(account["cash"]) - float(quantity) * price - fee - levy
	var cash_floor := -nav * (leverage_limit - 1.0) if leverage_limit > 1.0 \
		else nav * float(fund.get("minCash", 0.0))
	if next_cash < cash_floor - 0.000001:
		return {"ok": false, "error": "fund.errorCashFloor"}
	var position: Dictionary = account["positions"].get(symbol,
		{"qty": 0, "avgCost": 0.0, "costBasis": 0.0})
	var total_cost := float(position["avgCost"]) * float(position["qty"]) \
		+ float(quantity) * price + fee + levy
	position["qty"] = int(position["qty"]) + quantity
	position["avgCost"] = total_cost / float(position["qty"])
	position["costBasis"] = _round2(float(position.get("costBasis", 0.0)) \
		+ float(quantity) * price + fee + levy)
	position["last"] = price
	account["positions"][symbol] = position
	account["cash"] = _round2(next_cash)
	account["fees"] = _round2(float(account.get("fees", 0.0)) + fee)
	account["trades"].append({"ticker": symbol, "side": "buy", "qty": quantity,
		"price": price, "fee": fee, "levy": levy, "day": day})
	if account["trades"].size() > 300:
		account["trades"] = account["trades"].slice(account["trades"].size() - 300)
	return {"ok": true, "price": price, "qty": quantity}


static func sell(fund: Dictionary, quotes: Dictionary, ticker: String, qty: int,
		day: int) -> Dictionary:
	if String(fund.get("status", "")) != "active":
		return {"ok": false, "error": "fund.errorNotActive"}
	var symbol := ticker.to_upper()
	var quote: Dictionary = quotes.get(symbol, {})
	if quote.is_empty():
		return {"ok": false, "error": "error.unknownTicker"}
	var account: Dictionary = fund["account"]
	var position: Dictionary = account["positions"].get(symbol, {})
	if position.is_empty() or int(position.get("qty", 0)) <= 0:
		return {"ok": false, "error": "fund.errorNoPosition"}
	var quantity: int = mini(int(floor(float(qty))), int(position["qty"]))
	if quantity <= 0:
		return {"ok": false, "error": "error.qtyInvalid"}
	var price := _round2(maxf(0.01, float(quote.get("bid", quote.get("last", 0.0)))))
	var profile := tax_profile(String(fund.get("taxProfileId", "none")))
	var fee := _trade_fee(fund)
	var levy := float(quantity) * price * float(profile["levyRate"])
	var proceeds := float(quantity) * price - fee - levy
	var cost_portion := float(position.get("costBasis", 0.0)) \
		* float(quantity) / float(position["qty"])
	var realized := proceeds - cost_portion
	var tax := maxf(0.0, realized) * float(profile["capitalGainsRate"])
	account["cash"] = _round2(float(account["cash"]) + proceeds - tax)
	account["positions"][symbol]["qty"] = int(position["qty"]) - quantity
	account["positions"][symbol]["costBasis"] = _round2(
		float(position.get("costBasis", 0.0)) - cost_portion)
	if int(account["positions"][symbol]["qty"]) <= 0:
		account["positions"].erase(symbol)
	account["fees"] = _round2(float(account.get("fees", 0.0)) + fee)
	account["realizedPnl"] = _round2(float(account.get("realizedPnl", 0.0)) + realized)
	account["trades"].append({"ticker": symbol, "side": "sell", "qty": quantity,
		"price": price, "fee": fee, "levy": levy, "tax": tax, "day": day})
	if account["trades"].size() > 300:
		account["trades"] = account["trades"].slice(account["trades"].size() - 300)
	return {"ok": true, "price": price, "qty": quantity, "realized": _round2(realized)}


static func hire(fund: Dictionary, role_id: String) -> Dictionary:
	if String(fund.get("status", "")) != "active":
		return {"ok": false, "error": "fund.errorNotActive"}
	var role: Dictionary = {}
	for entry in ROLES:
		if String(entry["id"]) == role_id:
			role = entry
			break
	if role.is_empty():
		return {"ok": false, "error": "fund.errorUnknownRole"}
	for employee in fund["employees"]:
		if String(employee.get("role", "")) == role_id:
			return {"ok": false, "error": "fund.errorRoleFilled"}
	if float(fund.get("companyCash", 0.0)) < float(role["salary"]) + float(fund.get("payrollDue", 0.0)):
		return {"ok": false, "error": "fund.errorCannotAfford"}
	fund["employees"].append({"id": role_id, "role": role_id,
		"name": String(role["person"]), "salary": float(role["salary"]),
		"skill": int(role["skill"]), "hiredDay": int(fund.get("createdDay", 0))})
	return {"ok": true, "role": role}


static func fire(fund: Dictionary, role_id: String) -> Dictionary:
	if String(fund.get("status", "")) != "active":
		return {"ok": false, "error": "fund.errorNotActive"}
	var employees: Array = fund["employees"]
	for index in employees.size():
		if String(employees[index].get("role", "")) == role_id:
			employees.remove_at(index)
			return {"ok": true}
	return {"ok": false, "error": "fund.errorNoEmployee"}


static func accept_client(fund: Dictionary, candidate_id: String, metrics_data: Dictionary,
		day: int) -> Dictionary:
	if String(fund.get("status", "")) != "active":
		return {"ok": false, "error": "fund.errorNotActive"}
	var candidates: Array = fund.get("candidates", [])
	var candidate: Dictionary = {}
	var index := -1
	for cursor in candidates.size():
		if String(candidates[cursor].get("id", "")) == candidate_id:
			candidate = candidates[cursor]
			index = cursor
			break
	if candidate.is_empty() or metrics_data.is_empty():
		return {"ok": false, "error": "fund.errorNoCandidate"}
	var nav_per_unit := maxf(0.0001, float(metrics_data.get("navPerUnit", 1.0)))
	var units := _round2(float(candidate["principal"]) / nav_per_unit)
	var client := {
		"id": "%s-%d-%d" % [String(candidate["id"]), int(fund.get("createdDay", 0)),
			int(roundf(units))],
		"name": String(candidate["name"]), "typeKey": String(candidate["typeKey"]),
		"risk": String(candidate["risk"]),
		"expectedReturn": float(CLIENT_EXPECTED.get(String(candidate["risk"]), 10.0)),
		"horizon": String(candidate.get("horizon", "medium")),
		"liquidity": String(candidate.get("liquidity", "medium")),
		"principal": float(candidate["principal"]), "units": units, "trust": 65.0,
		"joinedDay": day, "request": null,
	}
	fund["account"]["cash"] = _round2(float(fund["account"]["cash"]) + float(candidate["principal"]))
	fund["units"] = _round2(float(fund["units"]) + units)
	fund["clients"].append(client)
	candidates.remove_at(index)
	_push_event(fund, {"day": day, "type": "subscription",
		"name": String(candidate["name"]), "amount": float(candidate["principal"])})
	return {"ok": true, "client": client}


static func settle_redemption(fund: Dictionary, client_id: String,
		metrics_data: Dictionary, day: int) -> Dictionary:
	if String(fund.get("status", "")) != "active":
		return {"ok": false, "error": "fund.errorNotActive"}
	var clients: Array = fund["clients"]
	var client: Dictionary = {}
	var index := -1
	for cursor in clients.size():
		if String(clients[cursor].get("id", "")) == client_id:
			client = clients[cursor]
			index = cursor
			break
	if client.is_empty() or client.get("request", null) == null or metrics_data.is_empty():
		return {"ok": false, "error": "fund.errorNoRedemption"}
	var units: float = minf(float(client["request"]["units"]), float(client["units"]))
	var amount := _round2(units * maxf(0.0001, float(metrics_data["navPerUnit"])))
	if float(fund["account"]["cash"]) < amount:
		return {"ok": false, "error": "fund.errorRedemptionCash"}
	fund["account"]["cash"] = _round2(float(fund["account"]["cash"]) - amount)
	fund["units"] = maxf(0.0, _round2(float(fund["units"]) - units))
	client["units"] = _round2(float(client["units"]) - units)
	client["request"] = null
	if float(client["units"]) <= 0.0001:
		clients.remove_at(index)
	else:
		clients[index] = client
	_push_event(fund, {"day": day, "type": "redemption",
		"name": String(client["name"]), "amount": amount})
	return {"ok": true, "amount": amount}


static func withdraw_company_cash(fund: Dictionary, account: Dictionary) -> Dictionary:
	if fund.is_empty() or String(fund.get("status", "none")) == "none":
		return {"ok": false, "error": "fund.errorNotActive"}
	var amount := _round2(float(fund.get("companyCash", 0.0)))
	if amount <= 0.0:
		return {"ok": false, "error": "fund.errorNoCompanyCash"}
	fund["companyCash"] = 0.0
	fund["withdrawnToPersonal"] = _round2(float(fund.get("withdrawnToPersonal", 0.0)) + amount)
	account["cash"] = _round2(float(account.get("cash", 0.0)) + amount)
	return {"ok": true, "amount": amount}


static func _push_event(fund: Dictionary, event: Dictionary) -> void:
	var events: Array = fund.get("events", [])
	events.push_front(event)
	fund["events"] = events.slice(0, 24)


# ---------------------------------------------------------------------------
# Daily operating cycle
# ---------------------------------------------------------------------------

static func _close(fund: Dictionary, day: int, reason: String, events: Array) -> void:
	fund["status"] = "closed"
	fund["closedDay"] = day
	fund["closeReason"] = reason
	events.push_front({"type": "closed", "reason": reason, "day": day})


static func _pay_obligation(fund: Dictionary, amount: float) -> float:
	if amount <= 0.0:
		return 0.0
	var available := minf(float(fund["account"]["cash"]), amount)
	fund["account"]["cash"] = _round2(float(fund["account"]["cash"]) - available)
	fund["companyCash"] = _round2(float(fund.get("companyCash", 0.0)) + available)
	fund["feePayable"] = _round2(float(fund.get("feePayable", 0.0)) + (amount - available))
	return available


static func _settle_fee_payable(fund: Dictionary) -> void:
	var due := _round2(float(fund.get("feePayable", 0.0)))
	if due <= 0.0:
		return
	var available := minf(float(fund["account"]["cash"]), due)
	fund["account"]["cash"] = _round2(float(fund["account"]["cash"]) - available)
	fund["companyCash"] = _round2(float(fund.get("companyCash", 0.0)) + available)
	fund["feePayable"] = _round2(due - available)


static func _pay_dividends(fund: Dictionary, day: int, events: Array) -> void:
	if day <= 0 or day % QUARTER_DAYS != 0:
		return
	var account: Dictionary = fund["account"]
	var total := 0.0
	var dividends: Array = account.get("dividends", [])
	for ticker in account["positions"].keys():
		var company := SmaCompanyCatalog.get_company(String(ticker))
		var annual := float(company.get("financials", {}).get("dividendPerShare", 0.0))
		var dps := annual / 4.0
		var qty := int(account["positions"][ticker].get("qty", 0))
		if dps <= 0.0 or qty <= 0:
			continue
		var amount := _round2(float(qty) * dps)
		if amount <= 0.0:
			continue
		account["cash"] = _round2(float(account["cash"]) + amount)
		dividends.append({"ticker": String(ticker), "qty": qty,
			"dps": _round2(dps), "amount": amount, "day": day})
		total += amount
	if dividends.size() > 300:
		dividends = dividends.slice(dividends.size() - 300)
	account["dividends"] = dividends
	if total > 0.0:
		events.append({"type": "dividend", "amount": _round2(total), "day": day})


static func _momentum(candles: Array, days: int = 20) -> float:
	if candles.size() < 2:
		return 0.0
	var last := float(candles[-1].get("c", 0.0))
	var base := float(candles[maxi(0, candles.size() - 1 - days)].get("c", 0.0))
	return (last / base - 1.0) * 100.0 if base > 0.0 else 0.0


static func _insight_for(role: String, fund: Dictionary, day: int, seed: String,
		exchange: SmaExchange, quotes: Dictionary, metrics_data: Dictionary) -> Dictionary:
	var tickers: Array = SmaCompanyCatalog.load_companies().keys()
	if role == "research" or role == "quant":
		var ranked: Array = []
		for ticker in tickers:
			var candles := SmaQuant.history_for(exchange, String(ticker))
			ranked.append({"ticker": String(ticker),
				"momentum": _momentum(candles)})
		ranked.sort_custom(func(a, b): return float(a["momentum"]) > float(b["momentum"]))
		if ranked.is_empty():
			return {}
		if role == "quant":
			var best: Dictionary = ranked[0]
			return {"id": "quant-%d" % day, "day": day, "role": role, "kind": "quant",
				"ticker": String(best["ticker"]),
				"momentum": _round2(float(best["momentum"]))}
		var index: int = absi(hash("%s:research:%d" % [seed, day])) % tickers.size()
		var ticker := String(tickers[index])
		var move := _momentum(SmaQuant.history_for(exchange, ticker))
		var rating := "hold"
		if move > 3.0:
			rating = "buy"
		elif move < -3.0:
			rating = "avoid"
		return {"id": "research-%d" % day, "day": day, "role": role,
			"kind": "research", "ticker": ticker, "momentum": _round2(move),
			"rating": rating}
	if role == "macro":
		return {"id": "macro-%d" % day, "day": day, "role": role, "kind": "macro",
			"snapshot": exchange.macro_world()}
	if role == "risk":
		return {"id": "risk-%d" % day, "day": day, "role": role, "kind": "risk",
			"cashRatio": _round2(float(metrics_data.get("cashRatio", 0.0))),
			"topWeight": _round2(float(metrics_data.get("topWeight", 0.0))),
			"drawdown": _round2(float(metrics_data.get("drawdown", 0.0)))}
	return {}


static func advance_day(fund: Dictionary, exchange: SmaExchange, day: int) -> Dictionary:
	if fund.is_empty() or String(fund.get("status", "")) != "active":
		return {"fund": fund, "events": []}
	var quotes: Dictionary = {}
	for ticker in SmaCompanyCatalog.load_companies().keys():
		quotes[String(ticker)] = exchange.quote(String(ticker))
	var events: Array = []
	var account: Dictionary = fund["account"]
	_pay_dividends(fund, day, events)
	_settle_fee_payable(fund)
	if day >= int(fund["lastFeeDay"]) + FEE_INTERVAL:
		var nav_before := maxf(0.0, equity(account, quotes) - float(fund.get("feePayable", 0.0)))
		var management_fee := _round2(nav_before * float(fund["managementRate"]) / 12.0)
		if management_fee > 0.0:
			_pay_obligation(fund, management_fee)
			fund["managementFees"] = _round2(float(fund["managementFees"]) + management_fee)
			events.append({"type": "managementFee", "amount": management_fee, "day": day})
		var nav_after_management := maxf(0.0, equity(account, quotes) \
			- float(fund.get("feePayable", 0.0)))
		var high_water_value := float(fund["units"]) * float(fund["highWaterMark"])
		var hurdle_value := high_water_value * float(fund["hurdleRate"]) / 12.0
		var excess := nav_after_management - high_water_value - hurdle_value
		if excess > 0.0 and float(fund["performanceRate"]) > 0.0:
			var performance_fee := _round2(excess * float(fund["performanceRate"]))
			if performance_fee > 0.0:
				_pay_obligation(fund, performance_fee)
				fund["performanceFees"] = _round2(float(fund["performanceFees"]) + performance_fee)
				events.append({"type": "performanceFee", "amount": performance_fee, "day": day})
		var nav_after_fees := maxf(0.0, equity(account, quotes) - float(fund.get("feePayable", 0.0)))
		fund["highWaterMark"] = maxf(float(fund["highWaterMark"]),
			nav_after_fees / maxf(0.0001, float(fund["units"])))
		fund["lastFeeDay"] = day
		var reference: Dictionary = {}
		for entry in fund["history"]:
			if int(entry.get("day", -1)) <= day - FEE_INTERVAL:
				reference = entry
		var reference_nav := float(reference.get("navPerUnit", 1.0)) if not reference.is_empty() else 1.0
		var period_return := (nav_after_fees / maxf(0.0001, float(fund["units"])) \
			/ maxf(0.0001, reference_nav) - 1.0) * 100.0
		var has_operations := false
		var has_compliance := false
		for employee in fund["employees"]:
			if String(employee.get("id", "")) == "operations":
				has_operations = true
			if String(employee.get("id", "")) == "compliance":
				has_compliance = true
		for client in fund["clients"]:
			var trust := float(client.get("trust", 60.0))
			trust += 2.0 if has_operations else 1.0
			if has_compliance:
				trust += 1.0
			var expected_monthly := float(client.get("expectedReturn", 0.0)) / 12.0
			if period_return < expected_monthly - 1.0:
				trust -= 4.0
			elif period_return < expected_monthly:
				trust -= 2.0
			else:
				trust += 2.0
			if trust < 50.0:
				trust -= 1.0
			if client.get("request", null) != null:
				trust -= 3.0
			client["trust"] = clampf(trust, 0.0, 100.0)
		var metrics_now := metrics(fund, quotes, exchange.market_index(),
			float(exchange.quote("MKT").get("last", 0.0)), day)
		for role in ["research", "quant", "macro", "risk"]:
			var hired := false
			for employee in fund["employees"]:
				if String(employee.get("id", "")) == role:
					hired = true
					break
			if not hired:
				continue
			var insight := _insight_for(role, fund, day, String(fund["seed"]),
				exchange, quotes, metrics_now)
			if insight.is_empty():
				continue
			var exists := false
			for entry in fund["insights"]:
				if String(entry.get("id", "")) == String(insight["id"]):
					exists = true
					break
			if not exists:
				fund["insights"].append(insight)
		fund["insights"] = fund["insights"].slice(maxi(0, fund["insights"].size() - 12))
		var payroll := 0.0
		for employee in fund["employees"]:
			payroll += float(employee.get("salary", 0.0))
		if payroll > 0.0:
			fund["payrollDue"] = _round2(float(fund["payrollDue"]) + payroll)
			fund["lastPayrollDay"] = day
			events.append({"type": "payroll", "amount": payroll, "day": day})
		var operating_cost := _round2(OPERATING_BASE \
			+ float(fund["employees"].size()) * OPERATING_PER_HEAD)
		fund["operatingCosts"] = _round2(float(fund["operatingCosts"]) + operating_cost)
		var operating_paid := minf(float(fund["companyCash"]), operating_cost)
		fund["companyCash"] = _round2(float(fund["companyCash"]) - operating_paid)
		fund["operatingDue"] = _round2(float(fund["operatingDue"]) + operating_cost - operating_paid)
		events.append({"type": "operatingCost", "amount": operating_cost, "day": day})
	if float(fund["payrollDue"]) > 0.0:
		var paid := minf(float(fund["companyCash"]), float(fund["payrollDue"]))
		fund["companyCash"] = _round2(float(fund["companyCash"]) - paid)
		fund["payrollDue"] = _round2(float(fund["payrollDue"]) - paid)
		if float(fund["payrollDue"]) > 0.0:
			fund["unpaidSalaryDays"] = int(fund["unpaidSalaryDays"]) + 1
			events.append({"type": "payrollShort", "amount": float(fund["payrollDue"]), "day": day})
		else:
			fund["unpaidSalaryDays"] = 0
	else:
		fund["unpaidSalaryDays"] = 0
	if float(fund["operatingDue"]) > 0.0:
		var paid := minf(float(fund["companyCash"]), float(fund["operatingDue"]))
		fund["companyCash"] = _round2(float(fund["companyCash"]) - paid)
		fund["operatingDue"] = _round2(float(fund["operatingDue"]) - paid)
		fund["unpaidCostDays"] = int(fund["unpaidCostDays"]) + 1 \
			if float(fund["operatingDue"]) > 0.0 else 0
	else:
		fund["unpaidCostDays"] = 0
	if int(fund["unpaidSalaryDays"]) >= KEY_PERSON_DAYS:
		for employee in fund["employees"]:
			if ["risk", "compliance", "operations"].has(String(employee.get("role", ""))):
				fund["keyPersonLeft"] = String(employee.get("name", ""))
				events.append({"type": "keyPerson", "name": String(employee["name"]),
					"role": String(employee["role"]), "day": day})
				fire(fund, String(employee["role"]))
				_close(fund, day, "keyPerson", events)
				break
	var nav_per_unit := maxf(0.0001, (equity(account, quotes) \
		- float(fund.get("feePayable", 0.0))) / maxf(0.0001, float(fund["units"])))
	var peak := maxf(float(fund["peakNav"]), nav_per_unit)
	var drawdown := (peak - nav_per_unit) / peak * 100.0 if peak > 0.0 else 0.0
	for client in fund["clients"]:
		var request: Variant = client.get("request", null)
		if request == null:
			continue
		if day < int(request.get("dueDay", 0)):
			continue
		var amount := _round2(float(request["units"]) * nav_per_unit)
		if float(account["cash"]) >= amount:
			var units: float = minf(float(request["units"]), float(client["units"]))
			account["cash"] = _round2(float(account["cash"]) - amount)
			fund["units"] = maxf(0.0, _round2(float(fund["units"]) - units))
			client["units"] = _round2(float(client["units"]) - units)
			client["request"] = null
			events.append({"type": "redemptionPaid", "name": String(client["name"]),
				"amount": amount, "day": day})
		elif day > int(request.get("dueDay", 0)) + REDEMPTION_GRACE:
			_close(fund, day, "liquidity", events)
			break
	if String(fund["status"]) == "active":
		for client in fund["clients"]:
			if client.get("request", null) != null:
				continue
			var expected_monthly := float(client.get("expectedReturn", 0.0)) / 12.0
			var shortfall := maxf(0.0, expected_monthly) / 100.0 * 0.4
			var chance := 0.01 + maxf(0.0, drawdown - 5.0) / 100.0 * 0.6
			chance += 0.025 if String(client["risk"]) == "low" else (
				0.005 if String(client["risk"]) == "high" else 0.015)
			if float(client.get("trust", 60.0)) < 50.0:
				chance += 0.02
			chance += shortfall
			var roll_value := float(abs(hash("%s:%s:%d" % [fund["seed"],
				String(client["id"]), day])) % 10000) / 10000.0
			if roll_value >= chance:
				continue
			var fraction := 0.25 + float(abs(hash("%s:%s:size:%d" % [fund["seed"],
				String(client["id"]), day])) % 20000) / 100000.0
			client["request"] = {
				"units": maxf(1.0, floorf(float(client["units"]) * fraction)),
				"requestedDay": day, "dueDay": day + REDEMPTION_DAYS,
				"reason": "drawdown" if drawdown > 5.0 else (
					"trust" if float(client.get("trust", 60.0)) < 50.0 else "liquidity"),
			}
			events.append({"type": "redemptionRequest", "name": String(client["name"]),
				"units": float(client["request"]["units"]), "day": day})
	nav_per_unit = maxf(0.0001, (equity(account, quotes) \
		- float(fund.get("feePayable", 0.0))) / maxf(0.0001, float(fund["units"])))
	var nav_now := maxf(0.0, equity(account, quotes) - float(fund.get("feePayable", 0.0)))
	var cash_ratio := float(account["cash"]) / nav_now * 100.0 if nav_now > 0.0 else 0.0
	var leverage_limit := maxf(1.0, float(fund["leverageLimit"]))
	var cash_floor := -(leverage_limit - 1.0) * 100.0 if leverage_limit > 1.0 \
		else float(fund["minCash"]) * 100.0
	if String(fund["status"]) == "active" and cash_ratio < cash_floor:
		fund["riskBreachDays"] = int(fund["riskBreachDays"]) + 1
		var has_compliance := false
		for employee in fund["employees"]:
			if String(employee.get("id", "")) == "compliance":
				has_compliance = true
				break
		if not has_compliance and int(fund["riskBreachDays"]) >= COMPLIANCE_DAYS:
			_close(fund, day, "compliance", events)
		elif int(fund["riskBreachDays"]) >= MAX_RISK_DAYS:
			_close(fund, day, "risk", events)
	else:
		fund["riskBreachDays"] = 0
	var holdings_now := 0.0
	for row in position_rows(account, quotes):
		holdings_now += absf(float(row["value"]))
	var gross_exposure := holdings_now / nav_now if nav_now > 0.0 else 0.0
	if String(fund["status"]) == "active" and gross_exposure > leverage_limit + 0.0001:
		fund["leverageBreachDays"] = int(fund["leverageBreachDays"]) + 1
		if int(fund["leverageBreachDays"]) >= MAX_LEVERAGE_DAYS:
			_close(fund, day, "leverage", events)
	else:
		fund["leverageBreachDays"] = 0
	if day >= int(fund["lastCapitalDay"]) + CAPITAL_INTERVAL \
			and fund["candidates"].size() < 2 and String(fund["status"]) == "active":
		var used_names: Array = []
		for client in fund["clients"]:
			used_names.append(String(client["name"]))
		for candidate in fund["candidates"]:
			used_names.append(String(candidate["name"]))
		for entry in CLIENT_POOL:
			if used_names.has(String(entry["name"])):
				continue
			var principal := _round2(maxf(50000.0, nav_now * 0.1))
			fund["candidates"].append({
				"id": "%s-%d" % [String(entry["id"]), day], "name": String(entry["name"]),
				"typeKey": String(entry["typeKey"]), "risk": String(entry["risk"]),
				"horizon": String(entry["horizon"]), "liquidity": String(entry["liquidity"]),
				"principal": principal,
			})
			events.append({"type": "candidate", "name": String(entry["name"]),
				"amount": principal, "day": day})
			break
		fund["lastCapitalDay"] = day
	peak = maxf(float(fund["peakNav"]), nav_per_unit)
	fund["peakNav"] = peak
	drawdown = (peak - nav_per_unit) / peak * 100.0 if peak > 0.0 else 0.0
	if drawdown >= MAX_DRAWDOWN and String(fund["status"]) == "active":
		_close(fund, day, "drawdown", events)
	if float(fund["units"]) <= 0.0001 and String(fund["status"]) == "active":
		_close(fund, day, "redeemed", events)
	if int(fund["unpaidSalaryDays"]) >= MAX_UNPAID_DAYS and String(fund["status"]) == "active":
		_close(fund, day, "payroll", events)
	var snapshot := {"day": day, "nav": _round2(nav_now),
		"navPerUnit": _round2(nav_per_unit), "cashRatio": cash_ratio / 100.0,
		"drawdownPct": _round2(drawdown), "aum": _round2(nav_now)}
	var history: Array = fund["history"]
	if not history.is_empty() and int(history[-1].get("day", -1)) == day:
		history[-1] = snapshot
	else:
		history.append(snapshot)
	fund["history"] = history.slice(maxi(0, history.size() - 260))
	var existing_events: Array = fund.get("events", [])
	for event in events:
		existing_events.push_front(event)
	fund["events"] = existing_events.slice(0, 24)
	return {"fund": fund, "events": events}


# ---------------------------------------------------------------------------
# Strategy plan
# ---------------------------------------------------------------------------

static func _plan_candidates(exchange: SmaExchange, strategy_id: String,
		params: Dictionary, top_n: int) -> Array:
	var rows: Array = []
	for ticker in SmaCompanyCatalog.load_companies().keys():
		var symbol := String(ticker)
		var candles := SmaQuant.history_for(exchange, symbol)
		var regime := SmaQuant.regime(strategy_id, params, candles)
		if regime == "sell":
			continue
		rows.append({"ticker": symbol,
			"sector": String(SmaCompanyCatalog.get_company(symbol).get("sector", "")),
			"regime": regime, "momentum": _momentum(candles, 20)})
	rows.sort_custom(func(a, b):
		if String(a["regime"]) != String(b["regime"]):
			return String(a["regime"]) == "buy"
		return float(a["momentum"]) > float(b["momentum"]))
	return rows.slice(0, top_n)


static func build_plan(fund: Dictionary, exchange: SmaExchange, day: int,
		config: Dictionary) -> Dictionary:
	if String(fund.get("status", "")) != "active":
		return {"ok": false, "error": "fund.errorNotActive"}
	var plan_config := _normalize_plan(config)
	var quotes: Dictionary = {}
	for ticker in SmaCompanyCatalog.load_companies().keys():
		quotes[String(ticker)] = exchange.quote(String(ticker))
	var metrics_data := metrics(fund, quotes, exchange.market_index(),
		float(exchange.quote("MKT").get("last", 0.0)), day)
	if metrics_data.is_empty() or float(metrics_data["nav"]) <= 0.0:
		return {"ok": false, "error": "fund.errorNoNav"}
	var selected := _plan_candidates(exchange, String(plan_config["strategyId"]),
		plan_config["params"], int(plan_config["topN"]))
	var cash_target := minf(0.5, maxf(float(plan_config["cashBuffer"]),
		float(fund.get("minCash", 0.0)) + 0.02))
	var target_weight := minf(float(fund.get("maxPosition", 1.0)),
		(1.0 - cash_target) / float(maxi(1, selected.size())))
	var account: Dictionary = fund["account"]
	var held: Array = position_rows(account, quotes)
	var selected_set := {}
	for row in selected:
		selected_set[String(row["ticker"])] = true
	var fee := _trade_fee(fund)
	var profile := tax_profile(String(fund.get("taxProfileId", "none")))
	var cash := float(account["cash"])
	var trades: Array = []
	var commission_total := 0.0
	var tax_total := 0.0
	var levy_total := 0.0
	for row in held:
		var ticker := String(row["ticker"])
		if selected_set.has(ticker):
			continue
		var quote: Dictionary = quotes.get(ticker, {})
		if quote.is_empty():
			continue
		var qty := int(row["qty"])
		var price := _round2(float(quote.get("bid", quote.get("last", 0.0))))
		var levy := float(qty) * price * float(profile["levyRate"])
		var realized := float(qty) * price - fee - float(row["avgCost"]) * float(qty)
		var tax := maxf(0.0, realized) * float(profile["capitalGainsRate"])
		cash += float(qty) * price - fee - levy - tax
		commission_total += fee
		levy_total += levy
		tax_total += tax
		var impact := float(qty) / maxf(1.0, float(SmaCompanyCatalog.get_company(ticker).get("avgVolume", 1000000.0))) * 100.0
		trades.append({"ticker": ticker, "side": "sell", "qty": qty, "price": price,
			"reason": "rebalance", "commission": fee, "levy": levy, "tax": tax,
			"impactCost": price * float(qty) * impact / 100.0, "slippagePct": impact})
	for row in selected:
		var ticker := String(row["ticker"])
		var quote: Dictionary = quotes.get(ticker, {})
		if quote.is_empty():
			continue
		var target_value := float(metrics_data["nav"]) * target_weight
		var ask := _round2(float(quote.get("ask", quote.get("last", 0.0))))
		if ask <= 0.0:
			continue
		var desired := int(floor(target_value / ask))
		var existing := int(account["positions"].get(ticker, {}).get("qty", 0))
		var delta := desired - existing
		if delta <= 0:
			continue
		var affordable := int(floor((cash - fee) / (ask * (1.0 + float(profile["levyRate"])))))
		var qty := mini(delta, maxi(0, affordable))
		if qty <= 0:
			continue
		var levy := float(qty) * ask * float(profile["levyRate"])
		cash -= float(qty) * ask + fee + levy
		commission_total += fee
		levy_total += levy
		var impact := float(qty) / maxf(1.0, float(SmaCompanyCatalog.get_company(ticker).get("avgVolume", 1000000.0))) * 100.0
		trades.append({"ticker": ticker, "side": "buy", "qty": qty, "price": ask,
			"reason": "signalBuy" if String(row["regime"]) == "buy" else "momentum",
			"commission": fee, "levy": levy, "tax": 0.0,
			"impactCost": ask * float(qty) * impact / 100.0, "slippagePct": impact})
	var total_costs := commission_total + levy_total + tax_total
	var plan := {
		"day": day, "strategyId": String(plan_config["strategyId"]), "trades": trades,
		"candidates": selected, "cashBefore": _round2(float(account["cash"])),
		"expectedCash": _round2(cash), "nav": _round2(float(metrics_data["nav"])),
		"costs": {"commission": _round2(commission_total), "levy": _round2(levy_total),
			"tax": _round2(tax_total), "total": _round2(total_costs),
			"totalPct": _round2(total_costs / maxf(1.0, float(metrics_data["nav"])) * 100.0)},
	}
	return {"ok": true, "plan": plan, "config": plan_config}


static func apply_plan(fund: Dictionary, exchange: SmaExchange, plan: Dictionary,
		day: int) -> Dictionary:
	if plan.is_empty() or typeof(plan.get("trades")) != TYPE_ARRAY:
		return {"ok": false, "error": "fund.plan.errorEmpty"}
	var quotes: Dictionary = {}
	for ticker in SmaCompanyCatalog.load_companies().keys():
		quotes[String(ticker)] = exchange.quote(String(ticker))
	var applied := 0
	var failures: Array = []
	for trade in plan["trades"]:
		var result := sell(fund, quotes, String(trade["ticker"]), int(trade["qty"]), day) \
			if String(trade["side"]) == "sell" \
			else buy(fund, quotes, String(trade["ticker"]), int(trade["qty"]), day)
		if bool(result.get("ok", false)):
			applied += 1
		else:
			failures.append({"trade": trade, "error": result.get("error", "")})
	return {"ok": applied > 0, "applied": applied, "failures": failures}


static func auto_rebalance(fund: Dictionary, exchange: SmaExchange, day: int) -> Dictionary:
	var config := _normalize_plan(fund.get("quantPlan", {}))
	if not bool(config["enabled"]) or not bool(config["autoRebalance"]):
		return {"executed": false, "skipped": "disabled", "fund": fund}
	if config.get("lastAutoDay", null) != null \
			and day - int(config["lastAutoDay"]) < int(config["rebalanceDays"]):
		return {"executed": false, "skipped": "notDue", "fund": fund}
	var built := build_plan(fund, exchange, day, config)
	config["lastAutoDay"] = day
	if not bool(built.get("ok", false)):
		return {"executed": false, "error": built.get("error", ""), "fund": fund}
	var applied := apply_plan(fund, exchange, built["plan"], day)
	config["plan"] = built["plan"]
	config["lastPlanDay"] = day
	fund["quantPlan"] = config
	return {"executed": true, "fund": fund, "plan": built["plan"],
		"applied": applied.get("applied", 0)}


# ---------------------------------------------------------------------------
# Research, optimiser, risk and attribution
# ---------------------------------------------------------------------------

static func _research_series(exchange: SmaExchange) -> Array:
	var series: Array = []
	for ticker in SmaCompanyCatalog.load_companies().keys():
		var symbol := String(ticker)
		var candles := SmaQuant.history_for(exchange, symbol)
		series.append({"ticker": symbol,
			"sector": String(SmaCompanyCatalog.get_company(symbol).get("sector", "")),
			"candles": candles})
	return series


static func _signal_rows(series: Array, strategy_id: String, params: Dictionary,
		start: int, end: int) -> Array:
	var rows: Array = []
	for index in range(start, end + 1):
		var current: Array = []
		for entry in series:
			var candles: Array = entry["candles"]
			if index >= candles.size():
				continue
			var regime := SmaQuant.regime(strategy_id, params, candles.slice(0, index + 1))
			if regime == "sell":
				continue
			current.append({"ticker": String(entry["ticker"]), "regime": regime,
				"momentum": _momentum(candles.slice(0, index + 1), 20)})
		current.sort_custom(func(a, b):
			if String(a["regime"]) != String(b["regime"]):
				return String(a["regime"]) == "buy"
			return float(a["momentum"]) > float(b["momentum"]))
		rows.append(current)
	return rows


static func _simulate_portfolio(series: Array, signal_rows: Array, start: int, end: int,
		top_n: int, cash_buffer: float, rebalance_days: int) -> Dictionary:
	var by_ticker := {}
	for entry in series:
		by_ticker[String(entry["ticker"])] = entry["candles"]
	var cash := 100000.0
	var holdings := {}
	var next_rebalance := start
	var curve: Array = []
	var cash_target := minf(0.5, maxf(cash_buffer, 0.12))
	for index in range(start, end + 1):
		if index == start or index >= next_rebalance:
			var total := cash
			for value in holdings.values():
				total += float(value)
			var row_index := index - start
			var current_signals: Array = signal_rows[row_index] if row_index >= 0 \
				and row_index < signal_rows.size() else []
			var selected := current_signals.slice(0, top_n)
			var per_position := minf(0.25, (1.0 - cash_target) \
				/ float(maxi(1, selected.size()))) * total
			if index != start:
				var turnover := 0.0
				var next_holdings := {}
				for entry in selected:
					next_holdings[String(entry["ticker"])] = per_position
				var keys := {}
				for key in holdings.keys():
					keys[key] = true
				for key in next_holdings.keys():
					keys[key] = true
				for key in keys.keys():
					turnover += absf(float(next_holdings.get(key, 0.0)) \
						- float(holdings.get(key, 0.0)))
				var cost := turnover / maxf(1.0, total * 2.0) * 0.001 * total
				holdings = next_holdings
				cash = maxf(0.0, total - per_position * float(selected.size()) - cost)
			else:
				holdings = {}
				for entry in selected:
					holdings[String(entry["ticker"])] = per_position
				cash = total - per_position * float(selected.size())
			next_rebalance = index + rebalance_days
		else:
			for ticker in holdings.keys():
				var candles: Array = by_ticker.get(String(ticker), [])
				if index <= 0 or index >= candles.size():
					continue
				var previous := float(candles[index - 1].get("c", 0.0))
				var current := float(candles[index].get("c", 0.0))
				if previous > 0.0 and current > 0.0:
					holdings[ticker] = float(holdings[ticker]) * (current / previous)
		var total_value := cash
		for value in holdings.values():
			total_value += float(value)
		curve.append(total_value)
	return SmaQuant._equity_metrics(curve, 100000.0, [], maxi(1, curve.size() - 1))


static func research_plan(fund: Dictionary, exchange: SmaExchange, config: Dictionary,
		split_pct: int = 70, objective: String = "sharpe") -> Dictionary:
	var plan_config := _normalize_plan(config)
	var series := _research_series(exchange)
	var shortest := 100000
	for entry in series:
		shortest = mini(shortest, entry["candles"].size())
	var start := 61
	var end := shortest - 2
	if end - start < 20:
		return {"ok": false, "error": "fund.errorResearchHistory"}
	var split_index := clampi(start + int(float(end - start) * float(split_pct) / 100.0),
		start + 10, end - 10)
	var signals := _signal_rows(series, String(plan_config["strategyId"]),
		plan_config["params"], start, end)
	var candidates: Array = []
	for top_n in RESEARCH_GRID["topN"]:
		for cash_buffer in RESEARCH_GRID["cashBuffer"]:
			for rebalance_days in RESEARCH_GRID["rebalanceDays"]:
				var metrics_data := _simulate_portfolio(series, signals, start, split_index,
					int(top_n), float(cash_buffer), int(rebalance_days))
				var score := float(metrics_data["sharpe"])
				if objective == "totalReturn":
					score = float(metrics_data["totalReturnPct"])
				elif objective == "cagr":
					score = float(metrics_data["cagrPct"])
				elif objective == "calmar":
					score = float(metrics_data["totalReturnPct"]) \
						/ maxf(1.0, float(metrics_data["maxDrawdownPct"]))
				candidates.append({"config": {"topN": int(top_n),
					"cashBuffer": float(cash_buffer),
					"rebalanceDays": int(rebalance_days)},
					"inSample": metrics_data, "score": score})
	candidates.sort_custom(func(a, b): return float(a["score"]) > float(b["score"]))
	if candidates.is_empty():
		return {"ok": false, "error": "fund.errorResearchHistory"}
	var best: Dictionary = candidates[0]
	var out_sample := _simulate_portfolio(series, signals, split_index, end,
		int(best["config"]["topN"]), float(best["config"]["cashBuffer"]),
		int(best["config"]["rebalanceDays"]))
	var baseline := _simulate_portfolio(series, signals, split_index, end,
		int(plan_config["topN"]), float(plan_config["cashBuffer"]),
		int(plan_config["rebalanceDays"]))
	var overfit := float(out_sample["totalReturnPct"]) < 0.0 \
		or float(out_sample["sharpe"]) < float(best["inSample"]["sharpe"]) * 0.3
	return {"ok": true, "strategyId": String(plan_config["strategyId"]),
		"splitPct": split_pct, "comboCount": candidates.size(), "best": best,
		"outSample": out_sample, "baselineOut": baseline, "overfitRisk": overfit,
		"candidates": candidates.slice(0, 8),
		"startDay": String(series[0]["candles"][start].get("d", "")),
		"endDay": String(series[0]["candles"][end].get("d", ""))}


const OPTIMIZER_METHODS := ["minVariance", "riskParity", "meanVariance"]
const SHRINKAGE := 0.2


static func _project_capped_simplex(source: Array, total: float,
		cap: float) -> Array:
	var count := source.size()
	var result: Array = []
	result.resize(count)
	result.fill(0.0)
	if count == 0 or total <= 0.0 or cap <= 0.0:
		return result
	var target := minf(total, cap * float(count))
	var low := INF
	var high := -INF
	for value in source:
		low = minf(low, float(value) - cap - 1.0)
		high = maxf(high, float(value) + 1.0)
	for iteration in 70:
		var tau := (low + high) * 0.5
		var sum := 0.0
		for value in source:
			sum += clampf(float(value) - tau, 0.0, cap)
		if sum > target:
			low = tau
		else:
			high = tau
	var tau := (low + high) * 0.5
	var accumulated := 0.0
	for index in count:
		var weight := clampf(float(source[index]) - tau, 0.0, cap)
		result[index] = weight
		accumulated += weight
	var residual := target - accumulated
	var guard := 0
	while residual > 0.000000001 and guard < count * 2:
		guard += 1
		var added := false
		for index in count:
			if float(result[index]) < cap - 0.000000001:
				var add := minf(residual, cap - float(result[index]))
				result[index] = float(result[index]) + add
				residual -= add
				added = true
				if residual <= 0.000000001:
					break
		if not added:
			break
	return result


static func _portfolio_variance(weights: Array, covariance: Array) -> float:
	var variance := 0.0
	for left in weights.size():
		if float(weights[left]) == 0.0:
			continue
		for right in weights.size():
			variance += float(weights[left]) * float(weights[right]) \
				* float(covariance[left][right])
	return maxf(0.0, variance)


static func _covariance_matrix(return_rows: Array) -> Dictionary:
	var count := return_rows.size()
	var length := 100000
	for row in return_rows:
		length = mini(length, row.size())
	if count == 0 or length < 10:
		return {"ok": false}
	var daily_means: Array = []
	daily_means.resize(count)
	for index in count:
		var mean_row: Array = return_rows[index]
		var mean_sum := 0.0
		for cursor in range(mean_row.size() - length, mean_row.size()):
			mean_sum += float(mean_row[cursor])
		daily_means[index] = mean_sum / float(length)
	var means: Array = []
	means.resize(count)
	for index in count:
		means[index] = float(daily_means[index]) * 252.0
	var covariance: Array = []
	for left in count:
		var row: Array = []
		row.resize(count)
		row.fill(0.0)
		covariance.append(row)
	for left in count:
		var left_returns: Array = return_rows[left]
		for right in range(left, count):
			var right_returns: Array = return_rows[right]
			var sum := 0.0
			for cursor in length:
				# Deviations must use daily means; only the variance is annualised.
				var left_value := float(left_returns[left_returns.size() - length + cursor]) \
					- float(daily_means[left])
				var right_value := float(right_returns[right_returns.size() - length + cursor]) \
					- float(daily_means[right])
				sum += left_value * right_value
			var value := sum / float(maxi(1, length - 1)) * 252.0
			if left == right:
				value = maxf(0.00000001, value)
			else:
				value *= 1.0 - SHRINKAGE
			covariance[left][right] = value
			covariance[right][left] = value
	return {"ok": true, "means": means, "covariance": covariance,
		"length": length}


static func optimize_portfolio(exchange: SmaExchange, method: String, lookback: int,
		max_weight: float, cash_buffer: float) -> Dictionary:
	var safe_method := method if OPTIMIZER_METHODS.has(method) else "minVariance"
	var window := clampi(lookback, 20, 250)
	var rows: Array = []
	var return_rows: Array = []
	for ticker in SmaCompanyCatalog.load_companies().keys():
		var symbol := String(ticker)
		var candles := SmaQuant.history_for(exchange, symbol)
		if candles.size() < 21:
			continue
		var start := maxi(0, candles.size() - window - 1)
		var returns: Array = []
		for index in range(start + 1, candles.size()):
			var previous := float(candles[index - 1].get("c", 0.0))
			var current := float(candles[index].get("c", 0.0))
			if previous > 0.0:
				returns.append(current / previous - 1.0)
		if returns.size() < 10:
			continue
		var company := SmaCompanyCatalog.get_company(symbol)
		rows.append({"ticker": symbol,
			"sector": String(company.get("sector", "")),
			"marketCap": float(company.get("marketCap", 0.0))})
		return_rows.append(returns)
	if rows.size() < 4:
		return {"ok": false, "error": "fund.optimizer.history"}
	var model := _covariance_matrix(return_rows)
	if not bool(model.get("ok", false)):
		return {"ok": false, "error": "fund.optimizer.history"}
	var means: Array = model["means"]
	var covariance: Array = model["covariance"]
	var count := rows.size()
	var investable := 1.0 - clampf(cash_buffer, 0.0, 0.5)
	var cap := clampf(max_weight, 0.01, 1.0)
	var weights: Array = []
	weights.resize(count)
	weights.fill(investable / float(count))
	if safe_method == "minVariance":
		var max_row := 0.0
		for left in count:
			var row_sum := 0.0
			for right in count:
				row_sum += absf(float(covariance[left][right]))
			max_row = maxf(max_row, row_sum)
		var step := 1.0 / maxf(0.00000001, 2.0 * max_row)
		for iteration in 320:
			var gradient: Array = []
			gradient.resize(count)
			gradient.fill(0.0)
			for left in count:
				var value := 0.0
				for right in count:
					value += float(covariance[left][right]) * float(weights[right])
				gradient[left] = 2.0 * value
			var next: Array = []
			next.resize(count)
			for index in count:
				next[index] = float(weights[index]) - step * float(gradient[index])
			weights = _project_capped_simplex(next, investable, cap)
	elif safe_method == "meanVariance":
		var risk_aversion := 6.0
		var max_row := 0.0
		for left in count:
			var row_sum := 0.0
			for right in count:
				row_sum += absf(float(covariance[left][right]))
			max_row = maxf(max_row, row_sum)
		var step := 1.0 / maxf(0.00000001, risk_aversion * max_row)
		for iteration in 320:
			var gradient: Array = []
			gradient.resize(count)
			for left in count:
				var value := 0.0
				for right in count:
					value += float(covariance[left][right]) * float(weights[right])
				gradient[left] = float(means[left]) - risk_aversion * value
			var next: Array = []
			next.resize(count)
			for index in count:
				next[index] = float(weights[index]) + step * float(gradient[index])
			weights = _project_capped_simplex(next, investable, cap)
	else:
		var volatilities: Array = []
		for index in count:
			volatilities.append(sqrt(maxf(0.000000000001,
				float(covariance[index][index]))))
		var total_inverse := 0.0
		for value in volatilities:
			total_inverse += 1.0 / maxf(0.000001, float(value))
		for index in count:
			weights[index] = investable / maxf(0.000001, float(volatilities[index])) \
				/ maxf(0.000001, total_inverse)
		for iteration in 120:
			var marginal: Array = []
			marginal.resize(count)
			marginal.fill(0.0)
			for left in count:
				var value := 0.0
				for right in count:
					value += float(covariance[left][right]) * float(weights[right])
				marginal[left] = value
			var variance := _portfolio_variance(weights, covariance)
			var target := variance / float(count)
			for index in count:
				var contribution := float(weights[index]) * float(marginal[index])
				if contribution > 0.0000000001 and target > 0.0:
					weights[index] = float(weights[index]) \
						* sqrt(target / contribution)
			var total := 0.0
			for value in weights:
				total += float(value)
			if total > 0.0:
				for index in count:
					weights[index] = float(weights[index]) * investable / total
			weights = _project_capped_simplex(weights, investable, cap)
	var variance := _portfolio_variance(weights, covariance)
	var portfolio_vol := sqrt(maxf(0.0, variance))
	var equal_variance := _portfolio_variance(_project_capped_simplex(
		_range_weights(count, investable), investable, cap), covariance)
	var output: Array = []
	var expected_return := 0.0
	var active_total := 0.0
	var marginal_all: Array = []
	marginal_all.resize(count)
	marginal_all.fill(0.0)
	for left in count:
		var value := 0.0
		for right in count:
			value += float(covariance[left][right]) * float(weights[right])
		marginal_all[left] = value
	for index in count:
		var row: Dictionary = rows[index]
		var weight := float(weights[index])
		active_total += weight
		var expectation := float(means[index]) * 100.0
		expected_return += weight * expectation
		var contribution := weight * float(marginal_all[index])
		row["weightPct"] = weight * 100.0
		row["expectedReturnPct"] = expectation
		row["volatilityPct"] = sqrt(maxf(0.000000000001,
			float(covariance[index][index]))) * 100.0
		row["riskContributionPct"] = contribution / variance * 100.0 \
			if variance > 0.000000000001 else 0.0
		output.append(row)
	output.sort_custom(func(a, b): return float(a["weightPct"]) > float(b["weightPct"]))
	var diversification := 0.0
	for value in weights:
		diversification += pow(float(value), 2.0)
	diversification = 1.0 - diversification / maxf(0.000000000001,
		pow(active_total, 2.0))
	var volatility_pct := portfolio_vol * 100.0
	return {"ok": true, "method": safe_method, "lookback": window,
		"universe": count, "weights": output,
		"expectedReturnPct": expected_return,
		"expectedVolatilityPct": volatility_pct,
		"equalWeightVolatilityPct": sqrt(maxf(0.0, equal_variance)) * 100.0,
		"cashWeightPct": 100.0 - active_total * 100.0,
		"investedPct": active_total * 100.0,
		"covarianceUsed": true,
		"sampleReturns": int(model["length"]),
		"diversificationPct": maxf(0.0, diversification) * 100.0,
		"expectedSharpe": (expected_return - 4.0) / volatility_pct \
			if volatility_pct > 0.000001 else 0.0}


static func _range_weights(count: int, total: float) -> Array:
	var result: Array = []
	result.resize(count)
	result.fill(total / float(maxi(1, count)))
	return result


static func factor_risk(fund: Dictionary, exchange: SmaExchange,
		lookback: int = 60) -> Dictionary:
	var quotes: Dictionary = {}
	for ticker in SmaCompanyCatalog.load_companies().keys():
		quotes[String(ticker)] = exchange.quote(String(ticker))
	var metrics_data := metrics(fund, quotes, exchange.market_index(),
		float(exchange.quote("MKT").get("last", 0.0)), int(exchange.state["dayIndex"]))
	if metrics_data.is_empty():
		return {"ok": false, "error": "fund.riskModel.history"}
	var rows := position_rows(fund["account"], quotes)
	var total_nav := maxf(1.0, float(metrics_data["nav"]))
	var exposures := {"market": 0.0, "size": 0.0, "value": 0.0, "momentum": 0.0,
		"lowVol": 0.0}
	var invested := 0.0
	for row in rows:
		if int(row["qty"]) <= 0:
			continue
		var symbol := String(row["ticker"])
		var company := SmaCompanyCatalog.get_company(symbol)
		var weight := float(row["value"]) / total_nav
		invested += weight
		var candles := SmaQuant.history_for(exchange, symbol)
		var volatility := SmaQuant._annual_volatility(candles, candles.size() - 1, 20)
		exposures["market"] += weight * float(company.get("beta", 1.0))
		exposures["size"] += weight * -log(maxf(1.0, float(company.get("marketCap", 1.0))))
		var book := float(company.get("bvps", 0.0))
		exposures["value"] += weight * (book / maxf(0.01, float(row["last"])) if book > 0.0 else 0.0)
		exposures["momentum"] += weight * _momentum(candles, 60) / 100.0
		exposures["lowVol"] += weight * -volatility
	var style_values := [exposures["size"], exposures["value"], exposures["momentum"],
		exposures["lowVol"]]
	var mean := 0.0
	for value in style_values:
		mean += float(value)
	mean /= 4.0
	var variance := 0.0
	for value in style_values:
		variance += pow(float(value) - mean, 2.0)
	var deviation := sqrt(variance / 4.0)
	for key in ["size", "value", "momentum", "lowVol"]:
		exposures[key] = (float(exposures[key]) - mean) / deviation if deviation > 0.000000001 else 0.0
	var factor_returns := {"market": float(metrics_data["benchmark"]) / 100.0,
		"size": 0.012, "value": 0.008, "momentum": 0.015, "lowVol": 0.006}
	var contributions: Array = []
	var factor_risk := 0.0
	for key in ["market", "size", "value", "momentum", "lowVol"]:
		var contribution := float(exposures[key]) * float(factor_returns[key]) * 100.0
		factor_risk += pow(contribution, 2.0)
		contributions.append({"id": key, "exposure": float(exposures[key]),
			"contributionPct": contribution})
	var specific := absf(float(metrics_data["totalReturn"]) - float(metrics_data["benchmark"])) \
		- absf(factor_risk)
	var specific_risk := maxf(0.0, specific)
	var total_risk := sqrt(factor_risk + specific_risk * specific_risk)
	contributions.append({"id": "specific", "exposure": 0.0,
		"contributionPct": specific})
	var stress: Array = []
	for scenario in [
		{"id": "marketDown", "shockPct": -10.0, "multiplier": float(exposures["market"])},
		{"id": "valueDown", "shockPct": -6.0, "multiplier": float(exposures["value"])},
		{"id": "momentumDown", "shockPct": -8.0, "multiplier": float(exposures["momentum"])},
		{"id": "volSpike", "shockPct": -7.0, "multiplier": float(exposures["lowVol"])},
	]:
		stress.append({"id": String(scenario["id"]),
			"shockPct": float(scenario["shockPct"]),
			"impactPct": float(scenario["shockPct"]) * float(scenario["multiplier"])})
	return {"ok": true, "lookback": lookback, "investedPct": invested * 100.0,
		"totalRiskPct": total_risk, "factorRiskPct": sqrt(factor_risk),
		"specificRiskPct": specific_risk, "contributions": contributions,
		"stress": stress}


static func optimizer_plan(fund: Dictionary, exchange: SmaExchange, weights: Array,
		day: int) -> Dictionary:
	if String(fund.get("status", "")) != "active":
		return {"ok": false, "error": "fund.errorNotActive"}
	var quotes: Dictionary = {}
	for ticker in SmaCompanyCatalog.load_companies().keys():
		quotes[String(ticker)] = exchange.quote(String(ticker))
	var metrics_data := metrics(fund, quotes, exchange.market_index(),
		float(exchange.quote("MKT").get("last", 0.0)), day)
	if metrics_data.is_empty():
		return {"ok": false, "error": "fund.errorNoNav"}
	var nav := float(metrics_data["nav"])
	var account: Dictionary = fund["account"]
	var targets := {}
	for row in weights:
		targets[String(row["ticker"])] = float(row.get("weightPct", 0.0)) / 100.0 * nav
	var trades: Array = []
	var cash := float(account["cash"])
	var fee := _trade_fee(fund)
	var profile := tax_profile(String(fund.get("taxProfileId", "none")))
	for position in position_rows(account, quotes):
		var ticker := String(position["ticker"])
		if targets.has(ticker):
			continue
		var quote: Dictionary = quotes.get(ticker, {})
		if quote.is_empty():
			continue
		var qty := int(position["qty"])
		if qty <= 0:
			continue
		var price := _round2(float(quote.get("bid", quote.get("last", 0.0))))
		var levy := float(qty) * price * float(profile["levyRate"])
		var realized := float(qty) * price - fee - float(position["avgCost"]) * float(qty)
		var tax := maxf(0.0, realized) * float(profile["capitalGainsRate"])
		cash += float(qty) * price - fee - levy - tax
		trades.append({"ticker": ticker, "side": "sell", "qty": qty, "price": price,
			"reason": "optimizer", "commission": fee, "levy": levy, "tax": tax,
			"slippagePct": 0.0, "impactCost": 0.0})
	for row in weights:
		var ticker := String(row["ticker"])
		var quote: Dictionary = quotes.get(ticker, {})
		if quote.is_empty():
			continue
		var ask := _round2(float(quote.get("ask", quote.get("last", 0.0))))
		if ask <= 0.0:
			continue
		var target_value := float(row.get("weightPct", 0.0)) / 100.0 * nav
		var desired := int(floor(target_value / ask))
		var existing := int(account["positions"].get(ticker, {}).get("qty", 0))
		var delta := desired - existing
		if delta <= 0:
			continue
		var affordable := int(floor((cash - fee) / (ask * (1.0 + float(profile["levyRate"])))))
		var qty := mini(delta, maxi(0, affordable))
		if qty <= 0:
			continue
		var levy := float(qty) * ask * float(profile["levyRate"])
		cash -= float(qty) * ask + fee + levy
		trades.append({"ticker": ticker, "side": "buy", "qty": qty, "price": ask,
			"reason": "optimizer", "commission": fee, "levy": levy, "tax": 0.0,
			"slippagePct": 0.0, "impactCost": 0.0})
	return {"ok": true, "plan": {"day": day, "trades": trades,
		"cashBefore": _round2(float(account["cash"])), "expectedCash": _round2(cash),
		"nav": _round2(nav)}}


static func attribution(fund: Dictionary, exchange: SmaExchange) -> Dictionary:
	var quotes: Dictionary = {}
	for ticker in SmaCompanyCatalog.load_companies().keys():
		quotes[String(ticker)] = exchange.quote(String(ticker))
	var metrics_data := metrics(fund, quotes, exchange.market_index(),
		float(exchange.quote("MKT").get("last", 0.0)), int(exchange.state["dayIndex"]))
	if metrics_data.is_empty():
		return {}
	var rows := position_rows(fund["account"], quotes)
	var nav := maxf(1.0, float(metrics_data["nav"]))
	var beta := 0.0
	var sector_weights := {}
	var weighted_return := 0.0
	for row in rows:
		if int(row["qty"]) <= 0:
			continue
		var symbol := String(row["ticker"])
		var company := SmaCompanyCatalog.get_company(symbol)
		var weight := float(row["value"]) / nav
		beta += weight * float(company.get("beta", 1.0))
		var sector := String(company.get("sector", ""))
		sector_weights[sector] = float(sector_weights.get(sector, 0.0)) + weight
		var candles := SmaQuant.history_for(exchange, symbol)
		weighted_return += weight * _momentum(candles, 60)
	var benchmark := float(metrics_data["benchmark"])
	var market := beta * benchmark
	var cash_weight := float(fund["account"]["cash"]) / nav
	var fees := -float(fund.get("managementFees", 0.0)) \
		- float(fund.get("performanceFees", 0.0))
	fees = fees / nav * 100.0
	var sector_total := 0.0
	var sector_rows: Array = []
	for sector in SmaCompanyCatalog.sectors():
		var members: Array = []
		for ticker in SmaCompanyCatalog.load_companies().keys():
			var company := SmaCompanyCatalog.get_company(String(ticker))
			if String(company.get("sector", "")) == sector:
				members.append(String(ticker))
		var sector_return := 0.0
		for symbol in members:
			sector_return += _momentum(SmaQuant.history_for(exchange, symbol), 60)
		sector_return /= float(maxi(1, members.size()))
		var portfolio_weight := float(sector_weights.get(sector, 0.0))
		var benchmark_weight := 1.0 / float(maxi(1, SmaCompanyCatalog.sectors().size()))
		var contribution := (portfolio_weight - benchmark_weight) * sector_return
		sector_total += contribution
		sector_rows.append({"sector": sector, "portfolioWeight": portfolio_weight * 100.0,
			"benchmarkWeight": benchmark_weight * 100.0,
			"returnPct": sector_return, "contribution": contribution})
	var selection := float(metrics_data["totalReturn"]) - market - sector_total \
		- (cash_weight * benchmark) - fees
	return {"totalReturn": float(metrics_data["totalReturn"]), "benchmark": benchmark,
		"beta": beta, "cashWeight": cash_weight * 100.0,
		"contributions": {"market": market, "sector": sector_total,
			"cash": -cash_weight * benchmark, "fees": fees, "selection": selection},
		"sectorRows": sector_rows,
		"exposures": {"beta": beta, "momentumPct": weighted_return,
			"volatilityPct": absf(float(metrics_data["drawdown"])),
			"pe": 0.0},
		"positions": rows, "investedWeightPct": (1.0 - cash_weight) * 100.0}
