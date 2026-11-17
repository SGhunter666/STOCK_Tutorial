extends "res://tests/test_base.gd"

const TICKERS := ["APLA", "NVDO", "MSFY", "GOGL", "TLSO", "AMZE", "NFLX", "ADBA"]


func run() -> void:
	describe("stress-long-run")
	var exchange := SmaExchange.new("stress-long", 100000.0)
	for day in 2:
		exchange.advance_day()
		_check_exchange(exchange, "day %d" % (day + 1))

	describe("stress-daily-pipeline")
	var daily := SmaExchange.new("stress-daily", 200000.0)
	daily.submit_order({"ticker": "APLA", "side": "buy", "type": "market", "qty": 100})
	for index in 140:
		daily.state["second"] = SmaExchange.SESSION_SECONDS - 1
		daily.advance_second()
		if index % 10 == 0:
			_check_exchange(daily, "daily %d" % index)
	_check_exchange(daily, "daily end")
	eq(int(daily.state["dayIndex"]), 140, "daily pipeline advanced the calendar")
	check(not daily.state["account"].get("dividends", []).is_empty(),
		"quarterly dividends were recorded")

	describe("stress-fuzz-orders")
	var fuzz := SmaExchange.new("stress-fuzz", 250000.0)
	var rng := SmaRng.new("stress-fuzz-actions")
	var types := ["market", "limit", "stop", "trailing"]
	for index in 120:
		var ticker := String(rng.pick(TICKERS))
		var last := float(fuzz.quote(ticker).get("last", 10.0))
		var order_type := String(rng.pick(types))
		var params := {
			"ticker": ticker,
			"side": String(rng.pick(["buy", "sell", "short", "cover"])),
			"type": order_type,
			"qty": rng.rand_int(1, 30),
		}
		if order_type == "limit":
			params["limitPrice"] = maxf(0.01, last * rng.range_float(0.8, 1.2))
		elif order_type == "stop":
			params["stopPrice"] = maxf(0.01, last * rng.range_float(0.8, 1.2))
		elif order_type == "trailing":
			params["trailPct"] = rng.range_float(0.01, 0.2)
		fuzz.submit_order(params)
		if index % 15 == 0:
			var orders := fuzz.open_order_rows("player")
			if not orders.is_empty():
				fuzz.cancel_order(String(rng.pick(orders).get("id", "")))
		fuzz.advance_seconds(rng.rand_int(30, 120))
		if index % 20 == 0:
			_check_exchange(fuzz, "fuzz %d" % index)
	_check_exchange(fuzz, "fuzz end")

	var restored := SmaExchange.from_dict(
		JSON.parse_string(JSON.stringify(fuzz.to_dict())))
	check(restored != null, "fuzzed save restores")
	if restored != null:
		approx(restored.equity(), fuzz.equity(), 0.01, "fuzzed equity survives save/load")
		eq(restored.open_order_rows("player").size(),
			fuzz.open_order_rows("player").size(), "fuzzed orders survive save/load")

	describe("stress-edge-inputs")
	var edge := SmaExchange.new("stress-edge", 100000.0)
	var invalid_cases: Array = [
		{},
		{"ticker": "NOPE", "side": "buy", "type": "market", "qty": 1},
		{"ticker": "APLA", "side": "buy", "type": "market", "qty": 0},
		{"ticker": "APLA", "side": "buy", "type": "market", "qty": -5},
		{"ticker": "APLA", "side": "sideways", "type": "market", "qty": 1},
		{"ticker": "APLA", "side": "buy", "type": "limit", "qty": 1},
		{"ticker": "APLA", "side": "buy", "type": "limit", "qty": 1, "limitPrice": 0.0},
		{"ticker": "APLA", "side": "buy", "type": "stop", "qty": 1, "stopPrice": -1.0},
		{"ticker": "APLA", "side": "buy", "type": "trailing", "qty": 1, "trailPct": 0.0},
		{"ticker": "APLA", "side": "buy", "type": "trailing", "qty": 1, "trailPct": 0.9},
	]
	for params in invalid_cases:
		var result := edge.submit_order(params)
		check(not bool(result.get("ok", false)),
			"invalid order is rejected: %s" % JSON.stringify(params))
		approx(float(edge.state["account"]["cash"]), 100000.0, 0.01,
			"cash is untouched by rejected orders")
	check(not bool(edge.buy_option("APLA", "call", 0.0, 0, 1).get("ok", false)),
		"unknown option contract is rejected")
	check(not bool(edge.sell_option("APLA", "put", 1.0, 0, 1).get("ok", false)),
		"invalid option sale is rejected")
	check(not bool(edge.close_option("missing", 1).get("ok", false)),
		"closing a missing option is rejected")
	check(not bool(edge.exercise_option("missing", 1).get("ok", false)),
		"exercising a missing option is rejected")
	check(not bool(edge.set_option_style("bogus").get("ok", false)),
		"unknown option style is rejected")
	check(not bool(edge.cancel_order("missing").get("ok", false)),
		"cancelling a missing order is rejected")

	describe("stress-option-settlement")
	var option_exchange := SmaExchange.new("stress-options", 500000.0)
	option_exchange.set_option_style("american")
	var spot := float(option_exchange.quote("APLA").get("last", 100.0))
	var strike := SmaFormat.round_to(spot * 0.9, 2)
	var short_spot := float(option_exchange.quote("NVDO").get("last", 100.0))
	var short_strike := SmaFormat.round_to(short_spot * 0.9, 2)
	option_exchange.state["account"]["options"] = [
		{"key": "long-call", "ticker": "APLA", "type": "call", "strike": strike,
			"expiryDay": 1, "qty": 1, "costBasis": 300.0, "premium": 3.0,
			"currentValue": 3.0, "vol": 0.3},
		{"key": "short-call", "ticker": "NVDO", "type": "call", "strike": short_strike,
			"expiryDay": 1, "qty": -1, "costBasis": 300.0, "premium": 3.0,
			"currentValue": 3.0, "vol": 0.3},
		{"key": "short-put", "ticker": "APLA", "type": "put", "strike": strike,
			"expiryDay": 2, "qty": -1, "costBasis": 300.0, "premium": 3.0,
			"currentValue": 3.0, "vol": 0.3},
	]
	option_exchange.advance_day()
	_check_exchange(option_exchange, "option settlement")
	check(option_exchange.state["account"]["options"].size() <= 1,
		"expiring option legs are settled")
	check(not option_exchange.state["account"]["shorts"].is_empty(),
		"assigned short call opens a short stock leg")

	describe("stress-determinism")
	var left := SmaExchange.new("stress-repeat", 200000.0)
	var right := SmaExchange.new("stress-repeat", 200000.0)
	var action_rng := SmaRng.new("stress-repeat-actions")
	for index in 20:
		var ticker := String(action_rng.pick(TICKERS))
		var side := String(action_rng.pick(["buy", "sell", "short", "cover"]))
		var params := {"ticker": ticker, "side": side, "type": "market",
			"qty": action_rng.rand_int(1, 10)}
		left.submit_order(params)
		right.submit_order(params)
		left.advance_seconds(90)
		right.advance_seconds(90)
	approx(left.equity(), right.equity(), 0.0,
		"same seed and actions produce identical equity")
	eq(left.open_order_rows("player").size(), right.open_order_rows("player").size(),
		"same seed and actions produce identical open orders")


func _check_exchange(exchange: SmaExchange, label: String) -> void:
	var account: Dictionary = exchange.state["account"]
	check(is_finite(float(account["cash"])), "%s cash is finite" % label)
	check(is_finite(exchange.equity()), "%s equity is finite" % label)
	for ticker in account["positions"].keys():
		var position: Dictionary = account["positions"][ticker]
		check(int(position.get("qty", 0)) > 0, "%s long qty positive: %s" % [label, ticker])
		check(is_finite(float(position.get("avgCost", 0.0)))
			and float(position.get("avgCost", 0.0)) >= 0.0,
			"%s long cost finite: %s" % [label, ticker])
	for ticker in account["shorts"].keys():
		var short: Dictionary = account["shorts"][ticker]
		check(int(short.get("qty", 0)) > 0, "%s short qty positive: %s" % [label, ticker])
		check(is_finite(float(short.get("avgPrice", 0.0)))
			and float(short.get("avgPrice", 0.0)) > 0.0,
			"%s short price finite: %s" % [label, ticker])
	for position in account.get("options", []):
		check(int(position.get("qty", 0)) != 0, "%s option qty non-zero" % label)
		check(float(position.get("strike", 0.0)) > 0.0, "%s option strike positive" % label)
		check(int(position.get("expiryDay", 0)) >= 0, "%s option expiry valid" % label)
	for order in exchange.state["orders"]:
		var status := String(order.get("status", ""))
		check(["pending", "open", "partiallyFilled", "filled", "cancelled", "rejected"].has(status),
			"%s order status valid" % label)
		check(int(order.get("remaining", 0)) >= 0, "%s order remaining non-negative" % label)
