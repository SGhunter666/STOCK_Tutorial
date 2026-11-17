## UK tax estimator matching, allowances and exemptions.
extends "res://tests/test_base.gd"


func _trade(side: String, day: int, qty: int, price: float, fee: float = 0.0) -> Dictionary:
	return {"ticker": "APLA", "side": side, "qty": qty, "price": price,
		"fee": fee, "day": day}


func run() -> void:
	describe("tax-empty")
	var empty := SmaTax.estimate({"fxRate": 1.0})
	eq(bool(empty.get("ok", false)), true, "empty ledger returns an estimate")
	approx(float(empty["summary"]["totalTax"]), 0.0, 0.001, "no tax without activity")

	describe("tax-cgt")
	var result := SmaTax.estimate({
		"accountType": "gia", "incomeBand": "basic", "taxableIncome": 0.0,
		"fxRate": 1.0, "isaContributions": 0.0, "ukShares": true,
		"trades": [
			_trade("buy", 70, 100, 500.0, 1.0),
			_trade("sell", 73, 100, 700.0, 1.0),
		],
	})
	eq(bool(result.get("ok", false)), true, "GIA estimate succeeds")
	approx(float(result["cgt"]["grossProceeds"]), 69999.0, 0.01, "proceeds net of fee")
	approx(float(result["cgt"]["allowableCosts"]), 50251.0, 0.01,
		"cost basis includes fee and SDRT")
	approx(float(result["cgt"]["netGain"]), 19748.0, 0.01, "gain computed")
	approx(float(result["cgt"]["annualExemptAmountUsed"]), 3000.0, 0.01,
		"annual exempt amount used")
	approx(float(result["cgt"]["taxableGain"]), 16748.0, 0.01, "taxable gain")
	approx(float(result["cgt"]["basicPart"]), 16748.0, 0.01, "basic-rate slice")
	approx(float(result["cgt"]["tax"]), 3014.64, 0.02, "CGT at 18%")
	approx(float(result["sdrt"]["total"]), 250.0, 0.02, "SDRT at 0.5% of consideration")

	describe("tax-dividends")
	var dividend_result := SmaTax.estimate({
		"accountType": "gia", "incomeBand": "basic", "fxRate": 1.0,
		"trades": [], "dividends": [{"ticker": "APLA", "day": 80, "amount": 10000.0}],
		"ukShares": false,
	})
	approx(float(dividend_result["dividends"]["gross"]), 10000.0, 0.01, "gross dividends")
	approx(float(dividend_result["dividends"]["allowanceUsed"]), 500.0, 0.01,
		"dividend allowance used")
	approx(float(dividend_result["dividends"]["taxable"]), 9500.0, 0.01,
		"taxable dividends")
	approx(float(dividend_result["dividends"]["tax"]), 1021.25, 0.02,
		"basic-rate dividend tax")

	describe("tax-isa")
	var isa := SmaTax.estimate({
		"accountType": "isa", "incomeBand": "basic", "fxRate": 1.0,
		"trades": [_trade("buy", 70, 10, 100.0), _trade("sell", 72, 10, 200.0)],
		"dividends": [{"ticker": "APLA", "day": 72, "amount": 1000.0}],
		"ukShares": false, "isaContributions": 25000.0,
	})
	eq(bool(isa["cgt"]["exempt"]), true, "ISA gains exempt")
	approx(float(isa["cgt"]["tax"]), 0.0, 0.001, "no CGT inside an ISA")
	approx(float(isa["dividends"]["tax"]), 0.0, 0.001, "no dividend tax inside an ISA")
	approx(float(isa["isa"]["excess"]), 5000.0, 0.01, "ISA subscription excess flagged")

	describe("tax-thirty-day")
	var matched := SmaTax.estimate({
		"accountType": "gia", "fxRate": 1.0, "ukShares": false,
		"trades": [
			_trade("buy", 70, 10, 100.0),
			_trade("sell", 71, 10, 150.0),
			_trade("buy", 72, 10, 200.0),
		],
	})
	var disposals: Array = matched["disposals"]
	eq(disposals.size(), 1, "one disposal recorded")
	if not disposals.is_empty():
		eq(int(disposals[0]["matches"]["thirtyDay"]["qty"]), 10,
			"future purchase matched under the 30-day rule")
		eq(int(disposals[0]["matches"]["pool"]["qty"]), 0,
			"pool not used before the bed-and-breakfast match")
		approx(float(disposals[0]["costBasis"]), 2000.0, 0.01,
			"cost basis uses the later purchase")
