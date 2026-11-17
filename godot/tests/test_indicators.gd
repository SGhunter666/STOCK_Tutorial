extends "res://tests/test_base.gd"


func run() -> void:
	describe("indicators-sma")
	var values: Array = []
	for index in 60:
		values.append(float(index + 1))
	approx(SmaIndicators.sma(values, 20), 50.5, 0.001, "SMA20 uses the last 20 closes")
	approx(SmaIndicators.sma(values, 50), 35.5, 0.001, "SMA50 uses the last 50 closes")
	check(is_nan(SmaIndicators.sma(values.slice(0, 10), 20)), "short history returns NaN")

	describe("indicators-rsi")
	var rising: Array = []
	for index in 20:
		rising.append(float(index + 1))
	approx(SmaIndicators.rsi(rising, 14), 100.0, 0.001, "only gains gives RSI 100")
	var flat: Array = []
	flat.resize(20)
	flat.fill(10.0)
	approx(SmaIndicators.rsi(flat, 14), 50.0, 0.001, "flat prices give RSI 50")

	describe("indicators-snapshot")
	var candles: Array = []
	for index in 100:
		var close := 100.0 + float(index) * 0.5
		candles.append({"c": close, "o": close, "h": close, "l": close})
	var snapshot := SmaIndicators.snapshot(candles, 150.0)
	check(not snapshot.is_empty(), "snapshot is produced")
	approx(float(snapshot["sma20"]), 145.25, 0.01, "snapshot SMA20 includes the current price")
	approx(float(snapshot["sma50"]), 137.75, 0.01, "snapshot SMA50 includes the current price")
	eq(String(snapshot["trend"]), "up", "rising averages report an up trend")
	approx(float(snapshot["drawdown"]), 0.0, 0.001, "monotonic prices have no drawdown")
	ge(float(snapshot["volatility"]), 0.0, "volatility is non-negative")
	check(SmaIndicators.snapshot([], 0.0).is_empty(), "empty history has no snapshot")

	var falling: Array = []
	for index in 60:
		falling.append({"c": 200.0 - float(index)})
	eq(String(SmaIndicators.snapshot(falling, 140.0)["trend"]), "down",
		"falling averages report a down trend")
	var drawdown := SmaIndicators.max_drawdown([100.0, 120.0, 90.0, 110.0])
	approx(drawdown, -25.0, 0.001, "max drawdown is measured from the peak")
