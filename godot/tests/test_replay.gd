## Historical replay of stock positions and daily equity.
extends "res://tests/test_base.gd"


func _bar(day: int, close_price: float) -> Dictionary:
	return {"d": SmaCalendar.iso_date(day), "o": close_price, "h": close_price,
		"l": close_price, "c": close_price, "v": 1000}


func _state() -> Dictionary:
	return {
		"dayIndex": 3,
		"companies": {
			"APLA": {"last": 125.0, "fairValue": 125.0,
				"series": {"daily": [_bar(1, 105.0), _bar(2, 115.0), _bar(3, 125.0)]}},
		},
		"account": {
			"cash": 100200.0,
			"equityHistory": [
				{"day": 0, "equity": 100000.0}, {"day": 1, "equity": 100050.0},
				{"day": 2, "equity": 100100.0}, {"day": 3, "equity": 100200.0},
			],
			"trades": [
				{"ticker": "APLA", "action": "openLong", "side": "buy", "qty": 10,
					"price": 100.0, "fee": 1.0, "day": 1, "second": 10},
				{"ticker": "APLA", "action": "openLong", "side": "buy", "qty": 10,
					"price": 110.0, "fee": 1.0, "day": 2, "second": 20},
				{"ticker": "APLA", "action": "closeLong", "side": "sell", "qty": 5,
					"price": 120.0, "fee": 1.0, "day": 3, "second": 30},
			],
			"dividends": [{"ticker": "APLA", "amount": 10.0, "day": 2}],
			"shorts": {},
		},
		"corporateActions": [{"type": "split", "ticker": "APLA", "day": 2,
			"ratio": 2.0, "amount": 0.0}],
	}


func run() -> void:
	describe("replay-days")
	var state := _state()
	eq(SmaReplay.max_day(state), 3, "max day from state")
	var day_two := SmaReplay.snapshot(state, 2)
	eq(int(day_two["day"]), 2, "snapshot day")
	eq(int(day_two["positions"].size()), 1, "one position held")
	eq(int(day_two["positions"][0]["qty"]), 20, "quantity rebuilt from both buys")
	approx(float(day_two["positions"][0]["avgCost"]), 105.0, 0.01,
		"weighted average cost")
	approx(float(day_two["positions"][0]["close"]), 115.0, 0.01,
		"historical close used")
	approx(float(day_two["stockValue"]), 2300.0, 0.01, "stock exposure")
	approx(float(day_two["equity"]), 100100.0, 0.01, "equity from snapshot")
	approx(float(day_two["dailyPnl"]), 50.0, 0.01, "daily P&L")
	eq(int(day_two["events"].size()), 3, "trade, dividend and corporate action listed")

	describe("replay-later")
	var day_three := SmaReplay.snapshot(state, 3)
	eq(int(day_three["positions"][0]["qty"]), 15, "sale reduces the position")
	approx(float(day_three["stockValue"]), 1875.0, 0.01, "value at latest close")
	approx(float(day_three["dailyPnl"]), 100.0, 0.01, "latest daily P&L")
	eq(day_three["curve"].size(), 4, "curve includes every day through the selection")

	describe("replay-empty")
	var empty := SmaReplay.snapshot(_state(), 0)
	eq(empty["positions"].is_empty(), true, "no positions before the first trade")
	approx(float(empty["equity"]), 100000.0, 0.01, "initial equity")
