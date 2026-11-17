## Fund setup, trading, clients, staff, daily cycle and analytics.
extends "res://tests/test_base.gd"


func run() -> void:
	describe("fund-setup")
	var exchange := SmaExchange.new("fund-test")
	var result := SmaFund.setup("Atlas Capital", "longOnly", "balanced",
		1000000.0, 0.02, 0.2, "index", 0.0, false, "none", 0,
		"fund-test", exchange.market_index())
	eq(bool(result.get("ok", false)), true, "fund launches")
	var fund: Dictionary = result["fund"]
	eq(String(fund["status"]), "active", "fund is active")
	eq(fund["clients"].size(), 4, "four seed clients")
	var quotes := {}
	for ticker in SmaCompanyCatalog.load_companies().keys():
		quotes[String(ticker)] = exchange.quote(String(ticker))
	var metrics := SmaFund.metrics(fund, quotes, exchange.market_index(),
		float(exchange.quote("MKT").get("last", 0.0)), 0)
	approx(float(metrics["nav"]), 1000000.0, 1.0, "NAV starts at contributed capital")
	approx(float(metrics["navPerUnit"]), 1.0, 0.0001, "NAV per unit starts at one")
	eq(fund["quantPlan"].has("plan"), true, "strategy plan config present")

	describe("fund-trading")
	var buy := SmaFund.buy(fund, quotes, "APLA", 100, 1)
	eq(bool(buy.get("ok", false)), true, "fund can buy a stock")
	eq(int(fund["account"]["positions"].get("APLA", {}).get("qty", 0)), 100,
		"fund position booked")
	var oversize := SmaFund.buy(fund, quotes, "APLA", 100000, 1)
	eq(bool(oversize.get("ok", false)), false, "position cap blocks oversized buys")
	var sell := SmaFund.sell(fund, quotes, "APLA", 40, 1)
	eq(bool(sell.get("ok", false)), true, "fund can sell")
	eq(int(fund["account"]["positions"]["APLA"]["qty"]), 60, "partial sale leaves the rest")

	describe("fund-staff")
	var hire := SmaFund.hire(fund, "trader")
	eq(bool(hire.get("ok", false)), true, "fund hires a trader")
	eq(SmaFund._trade_fee(fund), 0.5, "trader lowers commission")
	var duplicate := SmaFund.hire(fund, "trader")
	eq(bool(duplicate.get("ok", false)), false, "role cannot be filled twice")
	var fire := SmaFund.fire(fund, "trader")
	eq(bool(fire.get("ok", false)), true, "employee can leave")

	describe("fund-clients")
	var candidate_id := String(fund["candidates"][0]["id"])
	var accepted := SmaFund.accept_client(fund, candidate_id, metrics, 2)
	eq(bool(accepted.get("ok", false)), true, "candidate subscription accepted")
	eq(fund["clients"].size(), 5, "client added")
	var client_id := String(fund["clients"][0]["id"])
	fund["clients"][0]["request"] = {"units": 100.0, "requestedDay": 2, "dueDay": 3,
		"reason": "liquidity"}
	var settled := SmaFund.settle_redemption(fund, client_id, metrics, 3)
	eq(bool(settled.get("ok", false)), true, "redemption settled")

	describe("fund-daily")
	var before: int = int(fund["history"].size())
	var day_result := SmaFund.advance_day(fund, exchange, 1)
	eq(String(fund["status"]), "active", "fund survives a normal day")
	eq(fund["history"].size(), before + 1, "daily NAV snapshot appended")
	check(typeof(day_result.get("events")) == TYPE_ARRAY, "events returned")

	describe("fund-plan")
	var plan_result := SmaFund.build_plan(fund, exchange, 1, fund["quantPlan"])
	eq(bool(plan_result.get("ok", false)), true, "plan generated")
	var plan: Dictionary = plan_result["plan"]
	eq(typeof(plan["trades"]) == TYPE_ARRAY, true, "plan exposes trades")
	eq(plan["candidates"].size(), 5, "plan ranks the configured number of names")
	var plan_copy: Dictionary = fund.duplicate(true)
	var applied := SmaFund.apply_plan(plan_copy, exchange, plan, 2)
	eq(bool(applied.get("ok", false)), true, "plan trades can be applied")

	describe("fund-research")
	var research := SmaFund.research_plan(fund, exchange, fund["quantPlan"], 70, "sharpe")
	eq(bool(research.get("ok", false)), true, "plan research runs")
	if bool(research.get("ok", false)):
		eq(int(research["comboCount"]), 27, "research evaluates the full grid")
		check(not research["candidates"].is_empty(), "research ranks candidates")

	describe("fund-analytics")
	var optimized := SmaFund.optimize_portfolio(exchange, "riskParity", 60, 0.25, 0.1)
	eq(bool(optimized.get("ok", false)), true, "risk-parity optimiser runs")
	if bool(optimized.get("ok", false)):
		var invested := 0.0
		for row in optimized["weights"]:
			invested += float(row["weightPct"])
		le(invested, 90.01, "weights respect the cash buffer")
	var risk := SmaFund.factor_risk(fund, exchange, 60)
	eq(bool(risk.get("ok", false)), true, "factor risk model runs")
	var attribution := SmaFund.attribution(fund, exchange)
	eq(attribution.is_empty(), false, "attribution computed")

	describe("fund-fee-cycle")
	for cycle_day in range(2, 22):
		SmaFund.advance_day(fund, exchange, cycle_day)
	check(float(fund["managementFees"]) > 0.0, "management fee charged at the interval")
	check(float(fund["operatingCosts"]) > 0.0, "operating costs accrue")

	describe("fund-persistence")
	var restored := SmaFund.normalize_state(fund, 1, "fund-test")
	eq(String(restored["status"]), "active", "fund restores from save")
	eq(restored["clients"].size(), fund["clients"].size(), "clients restore")
	eq(int(restored["quantPlan"]["topN"]), int(fund["quantPlan"]["topN"]),
		"strategy config restores")
