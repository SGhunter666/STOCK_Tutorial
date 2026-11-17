## ETF basket valuation and trading.
extends "res://tests/test_base.gd"


func run() -> void:
	describe("etf-catalog")
	var symbols := SmaEtfs.tickers()
	eq(symbols.size(), 4, "four tradable ETFs")
	for symbol in symbols:
		var definition := SmaEtfs.definition(String(symbol))
		eq(String(definition.get("ticker", "")), String(symbol), "definition matches ticker")
		eq(definition.get("components", []).is_empty(), false, "ETF has components")

	describe("etf-nav")
	var exchange := SmaExchange.new("etf-test")
	for symbol in symbols:
		var nav_value := SmaEtfs.nav(exchange.state["companies"], String(symbol))
		var start := float(SmaEtfs.definition(String(symbol))["startPrice"])
		approx(nav_value, start, 0.01, "initial NAV equals listing price for %s" % symbol)
		eq(exchange.state["companies"][symbol]["isEtf"], true, "universe marks %s as ETF" % symbol)
	var holdings := SmaEtfs.holdings_rows(exchange.state["companies"], "MKT")
	eq(holdings.size(), 14, "broad-market ETF exposes every component")
	var total_weight := 0.0
	for row in holdings:
		total_weight += float(row["weight"])
	approx(total_weight, 1.0, 0.0001, "component weights are normalised")

	describe("etf-trading")
	var quote: Dictionary = exchange.quote("MKT")
	eq(quote.is_empty(), false, "ETF is quoted")
	var result := exchange.submit_order({"ticker": "MKT", "side": "buy", "type": "market",
		"qty": 10})
	eq(bool(result.get("ok", false)), true, "market order accepted")
	eq(int(exchange.state["account"]["positions"].get("MKT", {}).get("qty", 0)), 10,
		"ETF position is booked")
	var equity_before := exchange.equity()
	exchange.advance_day()
	var equity_after := exchange.equity()
	check(equity_after > 0.0, "ETF position survives the session close")
	eq(exchange.state["companies"]["MKT"]["delisted"], false, "ETF remains listed")
	le(absf(equity_after - equity_before), 25.0, "NAV marking keeps equity close to cost")

	describe("etf-premium")
	approx(SmaEtfs.premium(100.0, 100.0), 0.0, 0.0001, "fair price has no premium")
	approx(SmaEtfs.premium(101.0, 100.0), 1.0, 0.0001, "premium is positive")
	approx(SmaEtfs.premium(99.0, 100.0), -1.0, 0.0001, "discount is negative")

	describe("etf-persistence")
	var restored := SmaExchange.from_dict(exchange.to_dict())
	eq(restored.state["companies"].has("TECH"), true, "ETF survives save/load")
	approx(SmaEtfs.nav(restored.state["companies"], "TECH"),
		SmaEtfs.nav(exchange.state["companies"], "TECH"), 0.01,
		"ETF NAV restores")
