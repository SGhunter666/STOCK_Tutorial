extends "res://tests/test_base.gd"


func run() -> void:
	describe("exchange-init")
	var exchange := SmaExchange.new("test-seed", 100000.0)
	eq(exchange.state["companies"].size(), 54, "universe has 50 companies and 4 ETFs")
	eq(exchange.state["quotes"].size(), 54, "every instrument has a quote")
	approx(exchange.equity(), 100000.0, 0.001, "initial equity equals cash")

	describe("exchange-buy")
	var buy := exchange.submit_order({"ticker": "APLA", "side": "buy", "type": "market", "qty": 10})
	check(bool(buy["ok"]), "market buy accepted")
	eq(buy["order"]["status"], "filled", "market buy filled")
	eq(int(exchange.state["account"]["positions"]["APLA"]["qty"]), 10, "long position updated")
	check(float(exchange.state["account"]["cash"]) < 100000.0, "cash decreased")
	check(float(exchange.state["account"]["fees"]) > 0.0, "fee charged")
	var avg_cost := float(exchange.state["account"]["positions"]["APLA"]["avgCost"])
	check(avg_cost > 0.0, "average cost recorded")

	describe("exchange-sell")
	var cash_before := float(exchange.state["account"]["cash"])
	var sell := exchange.submit_order({"ticker": "APLA", "side": "sell", "type": "market", "qty": 5})
	check(bool(sell["ok"]), "market sell accepted")
	eq(int(exchange.state["account"]["positions"]["APLA"]["qty"]), 5, "position reduced")
	check(float(exchange.state["account"]["cash"]) > cash_before, "sell proceeds credited")
	eq(int(exchange.state["account"]["trades"].size()), 2, "two fills recorded")

	describe("exchange-short")
	var short_result := exchange.submit_order({"ticker": "MSFY", "side": "short", "type": "market", "qty": 10})
	check(bool(short_result["ok"]), "short accepted")
	eq(int(exchange.state["account"]["shorts"]["MSFY"]["qty"]), 10, "short position recorded")
	var cover := exchange.submit_order({"ticker": "MSFY", "side": "cover", "type": "market", "qty": 5})
	check(bool(cover["ok"]), "cover accepted")
	eq(int(exchange.state["account"]["shorts"]["MSFY"]["qty"]), 5, "short position reduced")
	var oversell := exchange.submit_order({"ticker": "APLA", "side": "sell", "type": "market", "qty": 1000000})
	eq(oversell["error"], "order.insufficientShares", "oversell rejected")

	describe("exchange-resting-order")
	var last := float(exchange.quote("NVDO")["last"])
	var limit := exchange.submit_order({
		"ticker": "NVDO", "side": "buy", "type": "limit",
		"qty": 20, "limitPrice": last * 0.5,
	})
	check(bool(limit["ok"]), "limit order accepted")
	eq(exchange.open_order_rows("player").size(), 1, "limit order is working")
	var cancel := exchange.cancel_order(String(limit["order"]["id"]))
	check(bool(cancel["ok"]), "cancel accepted")
	eq(exchange.open_order_rows("player").size(), 0, "cancelled order is no longer working")

	describe("exchange-liquidity")
	var huge_player := exchange.submit_order({"ticker": "APLA", "side": "buy", "type": "market", "qty": 1000000})
	eq(huge_player["error"], "order.insufficientMargin", "player order beyond margin is rejected")
	var huge := exchange.submit_order({
		"ticker": "APLA", "side": "buy", "type": "market", "qty": 1000000,
		"owner": "sim:test",
	})
	check(bool(huge["ok"]), "simulated order is accepted but not fully filled")
	check(int(huge["order"]["filledQty"]) > 0, "simulated order partially fills")
	check(int(huge["order"]["remaining"]) > 0, "simulated order leaves a remainder")
	check(String(huge["order"]["reason"]) == "insufficientLiquidity", "remainder reason recorded")

	describe("exchange-fill-events")
	var event_exchange := SmaExchange.new("fill-events", 100000.0)
	event_exchange.submit_order({"ticker": "APLA", "side": "buy", "type": "market", "qty": 10})
	event_exchange.clear_player_fills()
	var stop_price := float(event_exchange.quote("APLA")["last"]) + 1.0
	var stop := event_exchange.submit_order({
		"ticker": "APLA", "side": "sell", "action": "closeLong",
		"type": "stop", "qty": 10, "stopPrice": stop_price,
	})
	check(bool(stop["ok"]), "stop order accepted")
	event_exchange.advance_second()
	check(event_exchange.last_player_fills.size() >= 1,
		"player fills survive simulated-trader activity")
	var stop_filled := false
	for fill in event_exchange.last_player_fills:
		if String(fill.get("ticker", "")) == "APLA" and String(fill.get("action", "")) == "closeLong":
			stop_filled = true
	check(stop_filled, "stop order filled during the simulated second")

	describe("exchange-oco")
	var oco_exchange := SmaExchange.new("oco", 100000.0)
	oco_exchange.submit_order({"ticker": "VISO", "side": "buy", "type": "market", "qty": 10})
	var oco_reference := float(oco_exchange.quote("VISO")["last"])
	var oco := oco_exchange.submit_oco({
		"ticker": "VISO", "action": "closeLong", "qty": 10,
		"takeProfitPrice": oco_reference * 1.2, "stopPrice": oco_reference * 0.8,
	})
	check(bool(oco["ok"]), "OCO pair accepted")
	eq(oco["orders"].size(), 2, "OCO creates two legs")
	eq(oco_exchange.open_order_rows("player").size(), 2, "both OCO legs are working")
	var first_id := String(oco["orders"][0]["id"])
	oco_exchange.cancel_order(first_id)
	eq(oco_exchange.open_order_rows("player").size(), 0, "cancelling one leg cancels the sibling")

	describe("exchange-determinism")
	var left := SmaExchange.new("repeatable", 100000.0)
	var right := SmaExchange.new("repeatable", 100000.0)
	left.advance_seconds(30)
	right.advance_seconds(30)
	for ticker in left.state["companies"].keys():
		approx(float(left.quote(ticker)["last"]), float(right.quote(ticker)["last"]), 0.0,
			"same seed quote %s" % ticker)
	approx(left.equity(), right.equity(), 0.0, "same seed equity")

	describe("exchange-save-roundtrip")
	var restored := SmaExchange.from_dict(exchange.to_dict())
	check(restored != null, "save payload restores")
	approx(restored.equity(), exchange.equity(), 0.001, "equity survives restore")
	eq(int(restored.state["account"]["positions"]["APLA"]["qty"]), 5, "position survives restore")
	eq(str(restored.state["rngState"]), str(exchange.state["rngState"]), "rng state survives restore")
	restored.advance_seconds(10)
	exchange.advance_seconds(10)
	approx(float(restored.quote("APLA")["last"]), float(exchange.quote("APLA")["last"]), 0.0,
		"restored market continues identically")

	describe("exchange-session-rollover")
	var clock_exchange := SmaExchange.new("rollover", 100000.0)
	clock_exchange.submit_order({"ticker": "APLA", "side": "buy", "type": "market", "qty": 5})
	clock_exchange.advance_seconds(60)
	check(clock_exchange.get_candles("APLA", "1m").size() > 0, "intraday candle recorded")
	clock_exchange.state["second"] = SmaExchange.SESSION_SECONDS - 1
	clock_exchange.advance_second()
	eq(int(clock_exchange.state["dayIndex"]), 1, "session close advances the day")
	eq(int(clock_exchange.state["second"]), 0, "clock resets to the open")
	var daily := clock_exchange.get_candles("APLA", "1D")
	ge(float(daily.size()), 1.0, "daily candle finalised")
	approx(float(clock_exchange.state["companies"]["APLA"]["prevClose"]),
		float(clock_exchange.state["companies"]["APLA"]["last"]), 0.0001,
		"previous close resets to the last price")

	describe("exchange-margin")
	var snapshot := SmaMargin.margin_snapshot(clock_exchange.state)
	check(is_finite(float(snapshot["equity"])), "margin equity finite")
	check(is_finite(float(snapshot["maintenanceExcess"])), "maintenance excess finite")
	ge(float(snapshot["buyingPower"]), 0.0, "buying power non-negative")
	eq(snapshot["status"], "ok", "healthy account is not in a margin call")

	describe("exchange-dividends")
	var dividend_exchange := SmaExchange.new("dividend-test", 100000.0)
	dividend_exchange.state["account"]["positions"]["APLA"] = {
		"qty": 100, "avgCost": 100.0,
	}
	dividend_exchange.state["dayIndex"] = SmaCalendar.QUARTER_DAYS - 1
	dividend_exchange.state["second"] = SmaExchange.SESSION_SECONDS - 1
	dividend_exchange.advance_second()
	var dividend_rows: Array = dividend_exchange.state["account"].get("dividends", [])
	eq(dividend_rows.size(), 1, "quarterly dividend paid")
	if not dividend_rows.is_empty():
		check(float(dividend_rows[0]["amount"]) > 0.0, "dividend amount is positive")
		eq(String(dividend_rows[0]["ticker"]), "APLA", "dividend attributed to the holding")
