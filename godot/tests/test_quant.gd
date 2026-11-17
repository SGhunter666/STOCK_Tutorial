## Backtests, optimisation, factor research, regression and ML selection.
extends "res://tests/test_base.gd"


func _candles(count: int = 120, drift: float = 0.002) -> Array:
	var result: Array = []
	var price := 100.0
	for index in count:
		var open_price := price
		price = price * (1.0 + drift + sin(float(index) * 0.4) * 0.004)
		result.append({
			"d": SmaCalendar.iso_date(index),
			"o": SmaFormat.round_to(open_price, 2),
			"h": SmaFormat.round_to(maxf(open_price, price) * 1.004, 2),
			"l": SmaFormat.round_to(minf(open_price, price) * 0.996, 2),
			"c": SmaFormat.round_to(price, 2),
			"v": 100000 + index * 100,
		})
	return result


func run() -> void:
	describe("quant-backtest")
	var candles := _candles()
	var buy_hold := SmaQuant.run_backtest(candles, "buyHold", {}, 100000.0, 1.0)
	eq(bool(buy_hold.get("ok", false)), true, "buy-and-hold backtest runs")
	if bool(buy_hold.get("ok", false)):
		check(float(buy_hold["metrics"]["totalReturnPct"]) > 0.0,
			"rising market produces a positive return")
		eq(int(buy_hold["metrics"]["trades"]), 1, "one open trade recorded")
		eq(bool(buy_hold["metrics"]["openPosition"]), true, "position left open")
	var short_history := SmaQuant.run_backtest(candles.slice(0, 10), "smaCross", {},
		100000.0, 1.0)
	eq(bool(short_history.get("ok", false)), false, "short history rejected")
	var cross := SmaQuant.run_backtest(candles, "smaCross", {"fast": 5, "slow": 20},
		100000.0, 1.0)
	eq(bool(cross.get("ok", false)), true, "SMA cross backtest runs")
	eq(int(cross["params"]["fast"]), 5, "parameters normalised")

	describe("quant-optimize")
	var optimized := SmaQuant.optimize(candles, "smaCross", {}, 100000.0, 1.0, 70, "sharpe")
	eq(bool(optimized.get("ok", false)), true, "optimiser runs")
	if bool(optimized.get("ok", false)):
		check(int(optimized["comboCount"]) > 1, "grid evaluated several combinations")
		check(not optimized["best"]["params"].is_empty(), "best parameters returned")
		check(bool(optimized["outSample"].has("metrics")), "out-of-sample metrics returned")

	describe("quant-normalise")
	var config := SmaQuant.normalize_config({
		"strategy": "unknown", "mode": "bad", "initialCash": 123.0,
		"params": {"fast": 500, "slow": 10}, "mlModel": "bad",
	})
	eq(String(config["strategy"]), "smaCross", "unknown strategy falls back")
	eq(String(config["mode"]), "backtest", "unknown mode falls back")
	eq(float(config["initialCash"]), 100000.0, "cash options are enforced")
	check(float(config["params"]["fast"]) < float(config["params"]["slow"]),
		"fast SMA kept below slow SMA")

	describe("quant-factor")
	var exchange := SmaExchange.new("quant-test")
	var factor := SmaQuant.factor_research(exchange, "momentum", 60)
	eq(int(factor["count"]), 50, "factor ranks every stock")
	eq(int(factor["rows"][0]["rank"]), 1, "rank starts at one")
	var low_vol := SmaQuant.factor_research(exchange, "lowVol", 20)
	eq(int(low_vol["count"]), 50, "low-volatility factor works")

	describe("quant-regression")
	var regression := SmaQuant.factor_regression(exchange, 20, 10)
	eq(bool(regression.get("ok", false)), true, "factor regression runs")
	if bool(regression.get("ok", false)):
		eq(regression["factors"].size(), 8, "eight factor coefficients")
		check(float(regression["r2"]) <= 1.0, "R squared is bounded")

	describe("quant-ml")
	var ml := SmaQuant.ml_stock_selection(exchange, 20, 10, 5, 30, "logistic", false)
	eq(bool(ml.get("ok", false)), true, "logistic stock selection runs")
	if bool(ml.get("ok", false)):
		check(int(ml["trainSamples"]) >= SmaQuant.ML_MIN_SAMPLES, "enough training samples")
		check(ml["picks"].size() > 0, "test rebalances produce picks")
		check(float(ml["model"]["accuracy"]) >= 0.0
			and float(ml["model"]["accuracy"]) <= 1.0, "accuracy bounded")
	var mlp := SmaQuant.ml_stock_selection(exchange, 20, 10, 5, 30, "mlp", false)
	eq(bool(mlp.get("ok", false)), true, "MLP stock selection runs")
	if bool(mlp.get("ok", false)):
		check(int(mlp["model"]["hidden1"]) > 0, "MLP hidden layer configured")
		check(float(mlp["model"]["testAccuracy"]) >= 0.0, "MLP test accuracy computed")
