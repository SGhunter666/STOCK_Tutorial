## Deterministic quarterly filing model.
extends "res://tests/test_base.gd"


func run() -> void:
	describe("fundamentals-report")
	var report := SmaFundamentals.report("APLA", 0)
	eq(report.is_empty(), false, "report generated")
	if report.is_empty():
		return
	var income: Dictionary = report["income"]
	var balance: Dictionary = report["balance"]
	var cash_flow: Dictionary = report["cashFlow"]
	var ratios: Dictionary = report["ratios"]
	check(float(income["revenue"]) > 0.0, "revenue is positive")
	check(float(income["sharesOutstanding"]) > 0.0, "shares outstanding present")
	approx(float(income["grossProfit"]), float(income["revenue"]) - float(income["cogs"]),
		0.02, "gross profit reconciles")
	approx(float(income["operatingIncome"]), float(income["grossProfit"])
		- float(income["operatingExpenses"]), 0.02, "operating income reconciles")
	approx(float(balance["totalAssets"]), float(balance["cash"])
		+ float(balance["receivables"]) + float(balance["inventory"])
		+ float(balance["ppe"]), 0.05, "assets reconcile")
	approx(float(balance["totalAssets"]), float(balance["totalLiabilities"])
		+ float(balance["equity"]), 0.05, "assets equal liabilities plus equity")
	approx(float(cash_flow["netChange"]), float(cash_flow["operatingCashFlow"])
		+ float(cash_flow["investingCashFlow"])
		+ float(cash_flow["financingCashFlow"]), 0.05, "cash flow reconciles")
	check(float(ratios["bookValuePerShare"]) > 0.0, "book value per share positive")
	eq(String(report["reportDate"]).length(), 10, "report date formatted")
	eq(String(report["periodLabel"]).find("Q") > 0, true, "period label has a quarter")

	describe("fundamentals-determinism")
	var again := SmaFundamentals.report("APLA", 0)
	approx(float(again["income"]["revenue"]), float(income["revenue"]), 0.001,
		"same quarter is deterministic")

	describe("fundamentals-history")
	var latest := SmaFundamentals.latest_quarter(0)
	eq(latest, -2, "latest released quarter before day zero")
	var history := SmaFundamentals.history("APLA", 8, 0)
	eq(history.size(), 8, "eight quarters returned")
	eq(int(history[0]["quarter"]), latest, "history starts at the latest released quarter")
	eq(int(history[1]["quarter"]), latest - 1, "history descends by quarter")
	eq(String(history[0]["periodLabel"]) != String(history[1]["periodLabel"]), true,
		"quarters have distinct labels")

	describe("fundamentals-splits")
	eq(SmaFundamentals.split_factor_through("APLA", 100), 1.0,
		"split not applied before its quarter")
	eq(SmaFundamentals.split_factor_through("APLA", 6 * 63), 4.0,
		"APLA split factor applied after quarter six")
	eq(SmaFundamentals.split_factor_through("QVAL", 5 * 63), 0.5,
		"reverse split factor applied")
