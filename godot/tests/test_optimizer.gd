## Full-covariance portfolio optimisation: min variance, risk parity and mean variance.
extends "res://tests/test_base.gd"


func run() -> void:
	describe("optimizer-covariance")
	var exchange := SmaExchange.new("optimizer-test")
	var min_variance := SmaFund.optimize_portfolio(exchange, "minVariance", 60, 0.15, 0.10)
	eq(bool(min_variance.get("ok", false)), true, "min-variance optimisation runs")
	if not bool(min_variance.get("ok", false)):
		return
	eq(bool(min_variance["covarianceUsed"]), true, "full covariance is used")
	check(int(min_variance["sampleReturns"]) >= 10, "covariance has enough observations")
	var invested := 0.0
	var max_weight := 0.0
	for row in min_variance["weights"]:
		invested += float(row["weightPct"])
		max_weight = maxf(max_weight, float(row["weightPct"]))
	le(invested, 90.01, "min variance respects the cash buffer")
	le(max_weight, 15.01, "min variance respects the position cap")
	le(float(min_variance["expectedVolatilityPct"]),
		float(min_variance["equalWeightVolatilityPct"]) + 0.05,
		"min variance is no riskier than equal weight")
	check(float(min_variance["diversificationPct"]) > 0.0, "diversification reported")

	describe("optimizer-parity")
	var risk_parity := SmaFund.optimize_portfolio(exchange, "riskParity", 60, 0.15, 0.10)
	eq(bool(risk_parity.get("ok", false)), true, "risk parity runs")
	if bool(risk_parity.get("ok", false)):
		var parity_invested := 0.0
		for row in risk_parity["weights"]:
			parity_invested += float(row["weightPct"])
		le(parity_invested, 90.01, "risk parity respects the cash buffer")
		check(float(risk_parity["expectedVolatilityPct"]) > 0.0, "risk parity volatility computed")

	describe("optimizer-mean-variance")
	var mean_variance := SmaFund.optimize_portfolio(exchange, "meanVariance", 60, 0.15, 0.10)
	eq(bool(mean_variance.get("ok", false)), true, "mean variance runs")
	if bool(mean_variance.get("ok", false)):
		check(float(mean_variance["expectedReturnPct"])
			>= float(min_variance["expectedReturnPct"]) - 0.01,
			"mean variance targets a higher expected return")
		var mv_invested := 0.0
		for row in mean_variance["weights"]:
			mv_invested += float(row["weightPct"])
		le(mv_invested, 90.01, "mean variance respects the cash buffer")

	describe("optimizer-determinism")
	var again := SmaFund.optimize_portfolio(exchange, "minVariance", 60, 0.15, 0.10)
	var first_total := 0.0
	var second_total := 0.0
	for row in min_variance["weights"]:
		first_total += float(row["weightPct"])
	for row in again["weights"]:
		second_total += float(row["weightPct"])
	approx(first_total, second_total, 0.001, "optimiser is deterministic")
