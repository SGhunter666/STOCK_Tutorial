## Tradable ETFs. Each fund is a weighted basket of the 50 simulated companies,
## so its NAV follows component prices instead of an independent price model.
## The exchange marks every fund to NAV once per session close, then reprices
## its market-maker ladder around the new value.
class_name SmaEtfs
extends RefCounted

const DEFS := [
	{
		"ticker": "MKT", "name": "Sim Broad Market ETF", "startPrice": 100.0,
		"avgVolume": 9000000.0, "spread": 2.0, "impact": 0.35, "beta": 1.0,
		"vol": 0.011, "sharesOutstanding": 80000000.0, "expenseRatio": 0.08,
		"components": [
			{"ticker": "APLA", "weight": 0.10}, {"ticker": "MSFY", "weight": 0.08},
			{"ticker": "NVDO", "weight": 0.08}, {"ticker": "AMEZ", "weight": 0.08},
			{"ticker": "TSLO", "weight": 0.07}, {"ticker": "GOGL", "weight": 0.08},
			{"ticker": "PPLL", "weight": 0.08}, {"ticker": "NGRD", "weight": 0.07},
			{"ticker": "HLXB", "weight": 0.07}, {"ticker": "RDSM", "weight": 0.07},
			{"ticker": "SPMN", "weight": 0.07}, {"ticker": "SCRL", "weight": 0.06},
			{"ticker": "SLDY", "weight": 0.06}, {"ticker": "MTLK", "weight": 0.05},
		],
	},
	{
		"ticker": "TECH", "name": "Innovation Leaders ETF", "startPrice": 75.0,
		"avgVolume": 5500000.0, "spread": 3.0, "impact": 0.45, "beta": 1.3,
		"vol": 0.020, "sharesOutstanding": 45000000.0, "expenseRatio": 0.12,
		"components": [
			{"ticker": "APLA", "weight": 0.15}, {"ticker": "MSFY", "weight": 0.12},
			{"ticker": "NVDO", "weight": 0.12}, {"ticker": "NCRT", "weight": 0.11},
			{"ticker": "QVAL", "weight": 0.10}, {"ticker": "VCFD", "weight": 0.10},
			{"ticker": "ADBA", "weight": 0.08}, {"ticker": "INTL", "weight": 0.08},
			{"ticker": "ORCO", "weight": 0.08}, {"ticker": "SFSE", "weight": 0.06},
		],
	},
	{
		"ticker": "DIV", "name": "Dividend Income ETF", "startPrice": 40.0,
		"avgVolume": 3800000.0, "spread": 2.0, "impact": 0.30, "beta": 0.8,
		"vol": 0.010, "sharesOutstanding": 35000000.0, "expenseRatio": 0.15,
		"components": [
			{"ticker": "NGRD", "weight": 0.16}, {"ticker": "TWUT", "weight": 0.14},
			{"ticker": "PPLL", "weight": 0.12}, {"ticker": "VISO", "weight": 0.10},
			{"ticker": "AMEZ", "weight": 0.10}, {"ticker": "WMRT", "weight": 0.09},
			{"ticker": "CCLA", "weight": 0.08}, {"ticker": "SPMN", "weight": 0.08},
			{"ticker": "MTLK", "weight": 0.07}, {"ticker": "SCRL", "weight": 0.06},
		],
	},
	{
		"ticker": "SMAL", "name": "Small Cap Growth ETF", "startPrice": 55.0,
		"avgVolume": 2800000.0, "spread": 4.0, "impact": 0.55, "beta": 1.2,
		"vol": 0.025, "sharesOutstanding": 28000000.0, "expenseRatio": 0.18,
		"components": [
			{"ticker": "NCRT", "weight": 0.12}, {"ticker": "QVAL", "weight": 0.12},
			{"ticker": "VCFD", "weight": 0.12}, {"ticker": "SNAR", "weight": 0.12},
			{"ticker": "BRBY", "weight": 0.10}, {"ticker": "TDFU", "weight": 0.10},
			{"ticker": "NGLB", "weight": 0.08}, {"ticker": "ARCR", "weight": 0.08},
			{"ticker": "IGLG", "weight": 0.08}, {"ticker": "SPMN", "weight": 0.08},
		],
	},
]

const ETF_SECTOR := "etf"


static func tickers() -> Array:
	var result: Array = []
	for entry in DEFS:
		result.append(String(entry["ticker"]))
	return result


static func definition(etf_ticker: String) -> Dictionary:
	var symbol := etf_ticker.to_upper()
	for entry in DEFS:
		if String(entry["ticker"]) == symbol:
			return entry
	return {}


static func is_etf(ticker: String) -> bool:
	return not definition(ticker).is_empty()


## Company-shaped records consumed by the exchange universe builder.
static func instruments() -> Dictionary:
	var result := {}
	for entry in DEFS:
		var symbol := String(entry["ticker"])
		var price := float(entry["startPrice"])
		var shares := float(entry["sharesOutstanding"])
		result[symbol] = {
			"ticker": symbol,
			"name": String(entry["name"]),
			"sector": ETF_SECTOR,
			"origin": "etf",
			"referenceOf": "",
			"isEtf": true,
			"price": price,
			"startPrice": price,
			"shares": shares,
			"sharesOutstanding": shares,
			"bvps": price,
			"beta": float(entry["beta"]),
			"vol": float(entry["vol"]),
			"revenue": 0.0,
			"margin": 0.0,
			"div": 0.0,
			"avgVolume": float(entry["avgVolume"]),
			"spread": float(entry["spread"]),
			"impact": float(entry["impact"]),
			"stage": "mature",
			"risk": "low",
			"liquidity": "deep",
			"listed": "2020-01-02",
			"sectorCorrelation": 0.9,
			"institutionalOwnership": 0.7,
			"retailParticipation": 0.3,
			"priceImpactCoefficient": float(entry["impact"]),
			"expenseRatio": float(entry["expenseRatio"]),
			"components": entry["components"],
			"marketCap": price * shares,
			"financials": {
				"revenue": 0.0, "grossProfit": 0.0, "operatingIncome": 0.0,
				"netIncome": 0.0, "totalAssets": 0.0, "totalLiabilities": 0.0,
				"equity": 0.0, "cash": 0.0, "debt": 0.0,
				"operatingCashFlow": 0.0, "investingCashFlow": 0.0,
				"financingCashFlow": 0.0, "freeCashFlow": 0.0, "capex": 0.0,
				"eps": 0.0, "roe": 0.0, "roic": 0.0, "pe": null, "pb": null,
				"dividendPerShare": 0.0, "buybackPolicy": "none",
				"dividendPolicy": "none",
			},
			"risks": ["trackingError"],
			"description": "%s is a fictional ETF that tracks a weighted basket of simulated companies." % String(entry["name"]),
		}
	return result


## Current NAV per fund share, anchored to the fund's listing price. Weights are
## normalised so a basket always starts at the listing price even when the
## published weights do not add up to exactly one.
static func nav(companies: Dictionary, etf_ticker: String) -> float:
	var etf := definition(etf_ticker)
	if etf.is_empty():
		return 0.0
	var weight_total := 0.0
	for component in etf["components"]:
		weight_total += float(component["weight"])
	if weight_total <= 0.0:
		return 0.0
	var basket_return := 0.0
	for component in etf["components"]:
		var component_ticker := String(component["ticker"])
		var base := float(SmaCompanyCatalog.get_company(component_ticker).get("price", 1.0))
		if base <= 0.0:
			base = 1.0
		var cs: Dictionary = companies.get(component_ticker, {})
		var last := float(cs.get("last", base))
		var split := float(cs.get("splitFactor", 1.0))
		basket_return += float(component["weight"]) / weight_total * last * split / base
	return SmaFormat.round_to(maxf(0.01, float(etf["startPrice"]) * basket_return), 2)


## Weighted holdings with each component's contribution to the basket return.
static func holdings_rows(companies: Dictionary, etf_ticker: String) -> Array:
	var etf := definition(etf_ticker)
	var rows: Array = []
	if etf.is_empty():
		return rows
	var weight_total := 0.0
	for component in etf["components"]:
		weight_total += float(component["weight"])
	if weight_total <= 0.0:
		weight_total = 1.0
	for component in etf["components"]:
		var component_ticker := String(component["ticker"])
		var company := SmaCompanyCatalog.get_company(component_ticker)
		var base := float(company.get("price", 1.0))
		var cs: Dictionary = companies.get(component_ticker, {})
		var last := float(cs.get("last", base))
		var split := float(cs.get("splitFactor", 1.0))
		var change := (last * split / base - 1.0) * 100.0 if base > 0.0 else 0.0
		rows.append({
			"ticker": component_ticker,
			"name": String(company.get("name", component_ticker)),
			"weight": float(component["weight"]) / weight_total,
			"last": SmaFormat.round_to(last, 2),
			"changePct": SmaFormat.round_to(change, 2),
			"contribution": SmaFormat.round_to(
				float(component["weight"]) / weight_total * change, 2),
		})
	return rows


## Premium or discount of the traded price versus basket NAV, in percent.
static func premium(price: float, nav_value: float) -> float:
	if nav_value <= 0.0:
		return 0.0
	return SmaFormat.round_to((price / nav_value - 1.0) * 100.0, 2)


## Marks every ETF to its basket NAV at session close. The exchange refreshes
## the ladder and quote afterwards.
static func mark(companies: Dictionary) -> void:
	for etf in DEFS:
		var symbol := String(etf["ticker"])
		var cs: Dictionary = companies.get(symbol, {})
		if cs.is_empty() or bool(cs.get("delisted", false)):
			continue
		var value := nav(companies, symbol)
		if value <= 0.0:
			continue
		cs["fairValue"] = value
		cs["last"] = value
		cs["high"] = maxf(float(cs["high"]), value)
		cs["low"] = minf(float(cs["low"]), value)
