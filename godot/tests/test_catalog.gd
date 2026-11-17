extends "res://tests/test_base.gd"


func run() -> void:
	describe("catalog")
	var companies := SmaCompanyCatalog.load_companies()
	eq(companies.size(), 50, "catalog exposes 50 companies")
	var references := 0
	var originals := 0
	var tickers := {}
	for ticker in companies.keys():
		var company: Dictionary = companies[ticker]
		var symbol := String(company.get("ticker", ""))
		eq(symbol.length(), 4, "ticker is four characters: %s" % symbol)
		eq(symbol, String(ticker), "dictionary key matches ticker")
		check(not tickers.has(symbol), "ticker is unique: %s" % symbol)
		tickers[symbol] = true
		check(float(company.get("price", 0.0)) > 0.0, "price is positive: %s" % symbol)
		check(company.has("financials"), "financials present: %s" % symbol)
		check(company.has("sectorCorrelation"), "sector correlation present: %s" % symbol)
		if String(company.get("origin", "")) == "reference":
			references += 1
		else:
			originals += 1
	eq(references, 20, "twenty reference-inspired companies")
	eq(originals, 30, "thirty wholly original companies")

	describe("catalog-financials")
	for ticker in companies.keys():
		var financials: Dictionary = companies[ticker]["financials"]
		var assets := float(financials["totalAssets"])
		var liabilities := float(financials["totalLiabilities"])
		var equity := float(financials["equity"])
		le(absf(assets - liabilities - equity), 0.05, "assets = liabilities + equity: %s" % ticker)
		check(is_finite(float(financials["revenue"])), "revenue finite: %s" % ticker)

	describe("catalog-sectors")
	var sectors := SmaCompanyCatalog.sectors()
	ge(float(sectors.size()), 9.0, "at least nine sectors")
	check(sectors.has("technology"), "technology sector present")
	check(sectors.has("utilities"), "utilities sector present")
	var missing := SmaCompanyCatalog.get_company("NONE")
	check(missing.is_empty(), "unknown ticker returns an empty dictionary")
