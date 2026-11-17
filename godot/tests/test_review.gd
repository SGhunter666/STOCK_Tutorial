## Timeline ordering and review metrics.
extends "res://tests/test_base.gd"


func run() -> void:
	describe("review-summary")
	var account := {
		"initialCash": 100000.0,
		"cash": 50000.0,
		"fees": 12.0,
		"realizedPnl": 300.0,
		"optionRealized": 50.0,
		"futuresRealized": -20.0,
		"positions": {"APLA": {"qty": 100, "avgCost": 100.0, "last": 120.0}},
		"shorts": {},
		"trades": [
			{"ticker": "APLA", "side": "buy", "action": "openLong", "qty": 100,
				"price": 100.0, "realized": 0.0, "day": 1, "second": 10},
			{"ticker": "APLA", "side": "sell", "action": "closeLong", "qty": 50,
				"price": 120.0, "realized": 1000.0, "day": 2, "second": 20},
			{"ticker": "MSFY", "side": "sell", "action": "closeLong", "qty": 20,
				"price": 90.0, "realized": -400.0, "day": 3, "second": 30},
		],
		"optionTrades": [
			{"ticker": "APLA", "side": "buy", "optionType": "call", "strike": 100.0,
				"qty": 1, "premium": 5.0, "gross": 500.0, "realized": 0.0,
				"day": 4, "tick": 5},
		],
		"futuresTrades": [],
		"dividends": [
			{"ticker": "APLA", "qty": 100, "dps": 0.25, "amount": 25.0, "day": 5},
		],
	}
	var summary := SmaReview.summary(account, 105000.0, 6)
	eq(int(summary["closedTrades"]), 2, "two closed stock trades")
	approx(float(summary["winRatePct"]), 50.0, 0.01, "win rate is one of two")
	approx(float(summary["profitFactor"]), 2.5, 0.01, "profit factor uses gross profit and loss")
	approx(float(summary["realizedPnl"]), 330.0, 0.01, "realized P&L includes all desks")
	approx(float(summary["dividends"]), 25.0, 0.01, "dividends summed")
	approx(float(summary["totalReturnPct"]), 5.0, 0.01, "total return from initial cash")
	approx(float(summary["concentrationPct"]), 12000.0 / 105000.0 * 100.0, 0.01,
		"largest position concentration")

	describe("review-timeline")
	var timeline := SmaReview.timeline(account, 10)
	eq(timeline.size(), 5, "all ledger rows returned")
	eq(String(timeline[0]["kind"]), "dividend", "newest row first")
	eq(int(timeline[0]["day"]), 5, "timeline sorted by day")
	eq(String(timeline[1]["kind"]), "option", "option trade included")
	eq(String(timeline[2]["kind"]), "stock", "stock trade included")
	var limited := SmaReview.timeline(account, 2)
	eq(limited.size(), 2, "limit respected")
