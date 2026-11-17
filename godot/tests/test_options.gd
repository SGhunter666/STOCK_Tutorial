extends "res://tests/test_base.gd"


func run() -> void:
	describe("options-pricing")
	approx(SmaOptions.norm_cdf(0.0), 0.5, 0.000001, "normal CDF at zero")
	approx(SmaOptions.norm_cdf(1.0), 0.841345, 0.00001, "normal CDF at one")
	var call := SmaOptions.black_scholes({
		"type": "call", "spot": 100.0, "strike": 100.0, "years": 0.25, "vol": 0.2,
	})
	var put := SmaOptions.black_scholes({
		"type": "put", "spot": 100.0, "strike": 100.0, "years": 0.25, "vol": 0.2,
	})
	ge(float(call["price"]), 0.01, "call premium is positive")
	ge(float(put["price"]), 0.01, "put premium is positive")
	approx(float(call["intrinsic"]), 0.0, 0.001, "at-the-money call has no intrinsic value")
	approx(float(call["timeValue"]), float(call["price"]), 0.02, "call value is all time value")
	check(float(call["delta"]) > 0.0 and float(call["delta"]) < 1.0, "call delta is bounded")
	check(float(put["delta"]) < 0.0 and float(put["delta"]) > -1.0, "put delta is bounded")
	var expired := SmaOptions.black_scholes({
		"type": "put", "spot": 90.0, "strike": 100.0, "years": 0.0, "vol": 0.3,
	})
	approx(float(expired["price"]), 10.0, 0.01, "expired put settles at intrinsic value")

	describe("options-payoff")
	var payoff := SmaOptions.payoff_at_expiry({
		"type": "call", "spot": 110.0, "strike": 100.0, "premium": 5.0, "qty": 2,
	})
	approx(float(payoff["gross"]), 2000.0, 0.01, "call gross payoff uses contract size")
	approx(float(payoff["cost"]), 1000.0, 0.01, "call cost uses premium and contracts")
	approx(float(payoff["pnl"]), 1000.0, 0.01, "call P&L is gross minus cost")
	approx(float(payoff["breakeven"]), 105.0, 0.01, "call breakeven adds premium")
	approx(float(payoff["maxLoss"]), 1000.0, 0.01, "long option max loss is the premium")

	describe("options-chain")
	var company := SmaCompanyCatalog.get_company("APLA")
	var chain := SmaOptions.build_chain(company, "APLA", {"last": 182.0}, 0)
	eq(chain["expiries"].size(), 3, "three expiries are generated")
	eq(chain["strikes"].size(), 7, "seven strikes surround the spot")
	eq(chain["contracts"].size(), 42, "each expiry has calls and puts for every strike")
	var sorted := true
	for index in range(1, chain["strikes"].size()):
		if float(chain["strikes"][index]) <= float(chain["strikes"][index - 1]):
			sorted = false
	check(sorted, "strikes are sorted")
	var expiry_day := int(chain["expiries"][1]["expiryDay"])
	var strike := float(chain["strikes"][3])
	var contract := SmaOptions.find_contract(chain, "call", strike, expiry_day)
	check(not contract.is_empty(), "contract lookup finds an existing strike")
	check(float(contract["premium"]) > 0.0, "generated premium is positive")

	describe("options-account")
	var account := SmaOptions.create_account_state()
	account["cash"] = 100000.0
	account["fees"] = 0.0
	var bought := SmaOptions.buy_option(account, contract, 2, 0.5, 0, 0)
	check(bool(bought.get("ok", false)), "option purchase succeeds")
	eq(account["options"].size(), 1, "one option position is created")
	eq(int(account["options"][0]["qty"]), 2, "position quantity is recorded")
	eq(account["optionTrades"].size(), 1, "option trade is recorded")
	eq(String(account["optionTrades"][0]["side"]), "buy", "purchase side is buy")
	var rows := SmaOptions.option_rows(account, {"APLA": 182.0}, 0)
	eq(rows.size(), 1, "position rows are exposed")
	ge(float(rows[0]["value"]), 0.0, "position value is non-negative")
	var key := String(account["options"][0]["key"])
	var closed := SmaOptions.close_option(account, key, 1, float(contract["premium"]), 0.0, 0, 0)
	check(bool(closed.get("ok", false)), "partial close succeeds")
	eq(int(account["options"][0]["qty"]), 1, "partial close leaves one contract")
	closed = SmaOptions.close_option(account, key, 1, float(contract["premium"]), 0.0, 0, 0)
	check(bool(closed.get("ok", false)), "remaining close succeeds")
	eq(account["options"].size(), 0, "closing all contracts removes the position")
	eq(account["optionTrades"].size(), 3, "buy and both closes are recorded")

	describe("options-settlement")
	var settle_account := SmaOptions.create_account_state()
	settle_account["cash"] = 100000.0
	settle_account["options"] = [{
		"key": "APLA:call:100.00:5", "ticker": "APLA", "type": "call",
		"strike": 100.0, "expiryDay": 5, "qty": 1, "costBasis": 500.0,
		"premium": 5.0, "currentValue": 5.0, "vol": 0.3,
	}]
	var settlements := SmaOptions.settle_expired(settle_account, {"APLA": 110.0}, 5)
	eq(settlements.size(), 1, "expired contract is settled")
	approx(float(settlements[0]["intrinsic"]), 10.0, 0.01, "settlement uses intrinsic value")
	eq(String(settlements[0]["delivery"]), "shares", "in-the-money call delivers stock")
	approx(float(settle_account["cash"]), 90000.0, 0.01, "exercise buys shares at the strike")
	eq(int(settle_account["positions"]["APLA"]["qty"]), 100, "exercise delivers 100 shares")
	approx(float(settle_account["positions"]["APLA"]["avgCost"]), 100.0, 0.01,
		"delivered shares use the strike as cost basis")
	approx(float(settle_account["optionRealized"]), 500.0, 0.01,
		"call payoff over premium is realised on the option leg")
	eq(settle_account["options"].size(), 0, "settled contract is removed")

	describe("options-exchange")
	var exchange := SmaExchange.new("options-test", 100000.0)
	var exchange_chain := exchange.option_chain("APLA")
	check(not exchange_chain.is_empty(), "exchange builds a chain")
	var exchange_contract := SmaOptions.find_contract(exchange_chain, "put",
		float(exchange_chain["strikes"][2]), int(exchange_chain["expiries"][0]["expiryDay"]))
	var order := exchange.buy_option("APLA", "put", float(exchange_contract["strike"]),
		int(exchange_contract["expiryDay"]), 1)
	check(bool(order.get("ok", false)), "exchange accepts an option purchase")
	eq(exchange.state["account"]["options"].size(), 1, "exchange stores the option position")
	var fee := exchange.option_fee(exchange_contract, 1)
	approx(exchange.equity(), 100000.0 - fee, 0.05, "option value is included in equity")
	eq(exchange.option_rows().size(), 1, "exchange exposes option position rows")

	describe("options-sell")
	var sell_account := SmaOptions.create_account_state()
	sell_account["cash"] = 10000.0
	sell_account["fees"] = 0.0
	var sell_result := SmaOptions.sell_option(sell_account, contract, 1, 0.5, 0, 0)
	check(bool(sell_result.get("ok", false)), "selling an option succeeds")
	eq(int(sell_account["options"][0]["qty"]), -1, "sold position is short")
	approx(float(sell_account["cash"]),
		10000.0 + float(contract["premium"]) * 100.0 - 0.5, 0.02,
		"selling credits the premium minus fees")
	eq(String(sell_account["optionTrades"][0]["side"]), "sell", "sell trade is recorded")
	var short_rows := SmaOptions.option_rows(sell_account, {"APLA": 182.0}, 0)
	eq(String(short_rows[0]["side"]), "short", "position row reports a short side")
	le(float(short_rows[0]["value"]), 0.0, "short position value is a liability")
	le(float(short_rows[0]["pnl"]), 0.0, "short position starts slightly negative after fees")
	var short_key := String(sell_account["options"][0]["key"])
	var buy_to_close := SmaOptions.close_option(sell_account, short_key, 1,
		float(contract["premium"]), 0.5, 0, 0)
	check(bool(buy_to_close.get("ok", false)), "buying to close a short succeeds")
	eq(sell_account["options"].size(), 0, "closing a short removes the position")
	eq(String(sell_account["optionTrades"][0]["side"]), "buyToClose",
		"short close is recorded as buyToClose")

	describe("options-collateral")
	var collateral_account := SmaOptions.create_account_state()
	collateral_account["positions"] = {}
	collateral_account["options"] = [{
		"key": "APLA:call:100.00:30", "ticker": "APLA", "type": "call",
		"strike": 100.0, "expiryDay": 30, "qty": -1, "costBasis": 300.0,
		"premium": 3.0, "currentValue": 3.0, "vol": 0.3,
	}]
	approx(SmaOptions.option_collateral(collateral_account, {"APLA": 100.0}),
		2000.0, 0.01, "a naked call posts 20% of notional")
	collateral_account["positions"] = {"APLA": {"qty": 100}}
	approx(SmaOptions.option_collateral(collateral_account, {"APLA": 100.0}),
		0.0, 0.01, "100 shares cover one short call")
	collateral_account["positions"] = {}
	collateral_account["options"] = [{
		"key": "APLA:put:100.00:30", "ticker": "APLA", "type": "put",
		"strike": 100.0, "expiryDay": 30, "qty": -1, "costBasis": 300.0,
		"premium": 3.0, "currentValue": 3.0, "vol": 0.3,
	}]
	approx(SmaOptions.option_collateral(collateral_account, {"APLA": 100.0}),
		10000.0, 0.01, "a cash-secured put posts the full strike")
	collateral_account["options"].append({
		"key": "APLA:put:90.00:30", "ticker": "APLA", "type": "put",
		"strike": 90.0, "expiryDay": 30, "qty": 1, "costBasis": 200.0,
		"premium": 2.0, "currentValue": 2.0, "vol": 0.3,
	})
	approx(SmaOptions.option_collateral(collateral_account, {"APLA": 100.0}),
		0.0, 0.01, "a long put covers one short put")

	describe("options-short-settlement")
	var short_settle := SmaOptions.create_account_state()
	short_settle["cash"] = 100000.0
	short_settle["options"] = [{
		"key": "APLA:put:100.00:5", "ticker": "APLA", "type": "put",
		"strike": 100.0, "expiryDay": 5, "qty": -1, "costBasis": 300.0,
		"premium": 3.0, "currentValue": 3.0, "vol": 0.3,
	}]
	var short_settlements := SmaOptions.settle_expired(short_settle, {"APLA": 90.0}, 5)
	eq(short_settlements.size(), 1, "short contract is settled at expiry")
	approx(float(short_settlements[0]["proceeds"]), -10000.0, 0.01,
		"assigned short pays the strike for delivered shares")
	eq(String(short_settlements[0]["delivery"]), "shares", "assigned put delivers stock")
	approx(float(short_settle["cash"]), 90000.0, 0.01, "assignment buys shares at the strike")
	eq(int(short_settle["positions"]["APLA"]["qty"]), 100, "assignment delivers 100 shares")
	approx(float(short_settle["optionRealized"]), -700.0, 0.01,
		"short realized P&L subtracts the payoff")
	eq(String(short_settle["optionTrades"][0]["side"]), "assigned",
		"short expiry is recorded as assignment")

	describe("options-physical-delivery")
	var long_put := SmaOptions.create_account_state()
	long_put["cash"] = 100000.0
	long_put["positions"] = {"APLA": {"qty": 100, "avgCost": 90.0}}
	long_put["options"] = [{
		"key": "APLA:put:100.00:5", "ticker": "APLA", "type": "put",
		"strike": 100.0, "expiryDay": 5, "qty": 1, "costBasis": 200.0,
		"premium": 2.0, "currentValue": 2.0, "vol": 0.3,
	}]
	var put_settlements := SmaOptions.settle_expired(long_put, {"APLA": 90.0}, 5)
	eq(String(put_settlements[0]["delivery"]), "shares", "in-the-money put delivers stock")
	approx(float(long_put["cash"]), 110000.0, 0.01, "put exercise sells shares at the strike")
	check(not long_put["positions"].has("APLA"), "delivered put closes the long stock leg")
	approx(float(long_put["realizedPnl"]), 1000.0, 0.01,
		"stock leg realizes the strike over cost basis")
	approx(float(long_put["optionRealized"]), 800.0, 0.01,
		"put payoff over premium is realised on the option leg")

	describe("options-cash-fallback")
	var poor := SmaOptions.create_account_state()
	poor["cash"] = 500.0
	poor["options"] = [{
		"key": "APLA:call:100.00:5", "ticker": "APLA", "type": "call",
		"strike": 100.0, "expiryDay": 5, "qty": 1, "costBasis": 300.0,
		"premium": 3.0, "currentValue": 3.0, "vol": 0.3,
	}]
	var fallback := SmaOptions.settle_expired(poor, {"APLA": 110.0}, 5)
	eq(String(fallback[0]["delivery"]), "cash",
		"an unfunded exercise falls back to cash settlement")
	approx(float(poor["cash"]), 1500.0, 0.01, "cash fallback credits intrinsic value")
	check(not poor.has("positions") or poor["positions"].is_empty(),
		"cash fallback delivers no shares")

	describe("options-early-assignment")
	var early := SmaOptions.create_account_state()
	early["cash"] = 100000.0
	early["options"] = [{
		"key": "APLA:call:100.00:10", "ticker": "APLA", "type": "call",
		"strike": 100.0, "expiryDay": 10, "qty": -1, "costBasis": 300.0,
		"premium": 3.0, "currentValue": 12.0, "vol": 0.3,
	}]
	var assignments := SmaOptions.assign_early(early, {"APLA": 110.0}, 8)
	eq(assignments.size(), 1, "deep in-the-money short call is assigned early")
	eq(early["options"].size(), 0, "assigned contract is removed")
	eq(int(early["shorts"]["APLA"]["qty"]), 100, "assignment opens a short stock leg")
	approx(float(early["shorts"]["APLA"]["avgPrice"]), 100.0, 0.01,
		"delivery uses the strike, not the spot")
	approx(float(early["cash"]), 110000.0, 0.01, "call assignment credits the strike")
	approx(float(early["optionRealized"]), 300.0, 0.01,
		"early assignment realises the received premium")
	eq(String(early["optionTrades"][0]["side"]), "assignedEarly",
		"early assignment is recorded separately")

	var early_put := SmaOptions.create_account_state()
	early_put["cash"] = 9999.0
	early_put["options"] = [{
		"key": "APLA:put:100.00:10", "ticker": "APLA", "type": "put",
		"strike": 100.0, "expiryDay": 10, "qty": -1, "costBasis": 300.0,
		"premium": 3.0, "currentValue": 12.0, "vol": 0.3,
	}]
	eq(SmaOptions.assign_early(early_put, {"APLA": 90.0}, 8).size(), 0,
		"a short put without strike cash is not assigned")
	var far_dated := SmaOptions.create_account_state()
	far_dated["cash"] = 100000.0
	far_dated["options"] = [{
		"key": "APLA:call:100.00:20", "ticker": "APLA", "type": "call",
		"strike": 100.0, "expiryDay": 20, "qty": -1, "costBasis": 300.0,
		"premium": 3.0, "currentValue": 12.0, "vol": 0.3,
	}]
	eq(SmaOptions.assign_early(far_dated, {"APLA": 110.0}, 8).size(), 0,
		"contracts outside the assignment window are left open")

	describe("options-exercise")
	var exercise_account := SmaOptions.create_account_state()
	exercise_account["cash"] = 100000.0
	exercise_account["options"] = [{
		"key": "APLA:call:100.00:5", "ticker": "APLA", "type": "call",
		"strike": 100.0, "expiryDay": 5, "qty": 1, "costBasis": 300.0,
		"premium": 3.0, "currentValue": 10.0, "vol": 0.3,
	}]
	var exercised := SmaOptions.exercise_option(exercise_account,
		"APLA:call:100.00:5", 1, 110.0, 5)
	check(bool(exercised.get("ok", false)), "in-the-money call can be exercised")
	eq(int(exercised.get("shares", 0)), 100, "exercise reports delivered shares")
	eq(int(exercise_account["positions"]["APLA"]["qty"]), 100,
		"manual exercise delivers shares")
	approx(float(exercise_account["cash"]), 90000.0, 0.01,
		"manual exercise pays the strike")
	eq(exercise_account["options"].size(), 0, "manual exercise removes the contract")
	var too_early_account := SmaOptions.create_account_state()
	too_early_account["cash"] = 100000.0
	too_early_account["options"] = [{
		"key": "APLA:call:100.00:5", "ticker": "APLA", "type": "call",
		"strike": 100.0, "expiryDay": 5, "qty": 1, "costBasis": 300.0,
		"premium": 3.0, "currentValue": 10.0, "vol": 0.3,
	}]
	var too_early := SmaOptions.exercise_option(too_early_account,
		"APLA:call:100.00:5", 1, 110.0, 4)
	eq(String(too_early.get("error", "")), "exchange.error.option.notExpiryDay",
		"exercise is only allowed on expiry day")
	var short_exercise := SmaOptions.exercise_option(short_settle,
		"APLA:put:100.00:5", 1, 90.0, 5)
	eq(String(short_exercise.get("error", "")), "exchange.error.option.noPosition",
		"settled contracts cannot be exercised")

	describe("option-strategies")
	var strategy_chain := SmaOptions.build_chain(company, "APLA", {"last": 182.0}, 0)
	var spread := SmaOptionStrategies.build("bullCallSpread", strategy_chain, 30, 1)
	check(not spread.is_empty(), "bull call spread builds from the chain")
	eq(spread["legs"].size(), 2, "spread uses two legs")
	eq(String(spread["legs"][0]["side"]), "buy", "spread buys the lower strike")
	eq(String(spread["legs"][1]["side"]), "sell", "spread sells the higher strike")
	check(float(spread["legs"][0]["contract"]["strike"])
		< float(spread["legs"][1]["contract"]["strike"]), "spread strikes are ordered")
	ge(float(spread["maxProfit"]), 0.0, "spread max profit is non-negative")
	ge(float(spread["maxLoss"]), 0.0, "spread max loss is non-negative")
	approx(SmaOptionStrategies.payoff(spread,
		float(spread["legs"][1]["contract"]["strike"])),
		float(spread["maxProfit"]), 0.05, "spread payoff reaches max profit at the upper strike")
	var straddle := SmaOptionStrategies.build("longStraddle", strategy_chain, 30, 1)
	check(not straddle.is_empty(), "long straddle builds from the chain")
	eq(straddle["legs"].size(), 2, "straddle uses two legs")
	check(straddle["maxProfit"] == null, "straddle max profit is unlimited")
	approx(SmaOptionStrategies.payoff(straddle,
		float(straddle["legs"][0]["contract"]["strike"])),
		-float(straddle["netCost"]), 0.05, "straddle loses the net debit at the strike")
	var covered := SmaOptionStrategies.build("coveredCall", strategy_chain, 30, 1)
	check(not covered.is_empty(), "covered call builds from the chain")
	eq(int(covered["stockLegs"]), 100, "covered call tracks 100 shares as the stock leg")

	describe("options-exchange-selling")
	var sell_exchange := SmaExchange.new("options-sell-test", 100000.0)
	var sell_chain := sell_exchange.option_chain("APLA")
	var sell_put := SmaOptions.find_contract(sell_chain, "put",
		float(sell_chain["strikes"][2]), int(sell_chain["expiries"][0]["expiryDay"]))
	var sold := sell_exchange.sell_option("APLA", "put", float(sell_put["strike"]),
		int(sell_put["expiryDay"]), 1)
	check(bool(sold.get("ok", false)), "exchange accepts a cash-secured put sale")
	eq(int(sell_exchange.state["account"]["options"][0]["qty"]), -1,
		"exchange stores the short option")
	ge(sell_exchange.option_collateral(), 0.0, "exchange reports collateral")
	check(sell_exchange.available_option_cash() < sell_exchange.available_cash(),
		"collateral reduces option buying power")
	var sell_fee := exchange.option_fee(sell_put, 1)
	approx(sell_exchange.equity(), 100000.0 - sell_fee, 0.1,
		"short option premium and liability offset in equity")
	var locked_style := sell_exchange.set_option_style("american")
	eq(String(locked_style.get("error", "")), "exchange.error.option.styleLocked",
		"settlement style is locked while contracts are open")
	var style_exchange := SmaExchange.new("options-style-test", 100000.0)
	eq(style_exchange.option_style(), "european", "options start European")
	check(bool(style_exchange.set_option_style("american").get("ok", false)),
		"settlement style can switch with a flat book")
	eq(style_exchange.option_style(), "american", "American style is stored")

	describe("options-early-exchange")
	var early_exchange := SmaExchange.new("options-early-test", 100000.0)
	early_exchange.set_option_style("american")
	var early_spot := float(early_exchange.quote("APLA")["last"])
	early_exchange.state["account"]["options"] = [{
		"key": "APLA:call:early", "ticker": "APLA", "type": "call",
		"strike": SmaFormat.round_to(early_spot * 0.9, 2),
		"expiryDay": int(early_exchange.state["dayIndex"]) + 2,
		"qty": -1, "costBasis": 100.0, "premium": 1.0,
		"currentValue": 10.0, "vol": 0.3,
	}]
	early_exchange.state["second"] = SmaExchange.SESSION_SECONDS - 1
	early_exchange.advance_second()
	eq(early_exchange.state["account"]["options"].size(), 0,
		"American short option is assigned at the session close")
	eq(int(early_exchange.state["account"]["shorts"].get("APLA", {}).get("qty", 0)), 100,
		"early assignment opens the short stock leg")
	eq(early_exchange.state["earlyAssignments"].size(), 1,
		"early assignment is exposed to the UI")

	var european_exchange := SmaExchange.new("options-european-test", 100000.0)
	european_exchange.state["account"]["options"] = [{
		"key": "APLA:call:early", "ticker": "APLA", "type": "call",
		"strike": SmaFormat.round_to(early_spot * 0.9, 2),
		"expiryDay": int(european_exchange.state["dayIndex"]) + 2,
		"qty": -1, "costBasis": 100.0, "premium": 1.0,
		"currentValue": 10.0, "vol": 0.3,
	}]
	european_exchange.state["second"] = SmaExchange.SESSION_SECONDS - 1
	european_exchange.advance_second()
	eq(european_exchange.state["account"]["options"].size(), 1,
		"European short option stays open before expiry")
	eq(european_exchange.state["earlyAssignments"].size(), 0,
		"European mode reports no early assignments")

	var spread_exchange := SmaExchange.new("options-spread-test", 100000.0)
	var spread_chain := spread_exchange.option_chain("APLA")
	var built_spread := SmaOptionStrategies.build("bullCallSpread", spread_chain, 30, 1)
	check(not built_spread.is_empty(), "exchange can build a spread")
	var legs_result: Dictionary = spread_exchange.execute_option_legs(
		built_spread["legs"])
	check(bool(legs_result.get("ok", false)), "exchange executes strategy legs atomically")
	eq(spread_exchange.state["account"]["options"].size(), 2, "both spread legs are stored")
	var has_short_leg := false
	for position in spread_exchange.state["account"]["options"]:
		if int(position.get("qty", 0)) < 0:
			has_short_leg = true
	check(has_short_leg, "spread includes a short leg")

	var covered_exchange := SmaExchange.new("options-covered-test", 100000.0)
	covered_exchange.submit_order({
		"ticker": "APLA", "side": "buy", "type": "market", "qty": 100,
	})
	var covered_chain := covered_exchange.option_chain("APLA")
	var covered_call := SmaOptions.find_contract(covered_chain, "call",
		float(covered_chain["strikes"][5]), int(covered_chain["expiries"][0]["expiryDay"]))
	var covered_sale := covered_exchange.sell_option("APLA", "call",
		float(covered_call["strike"]), int(covered_call["expiryDay"]), 1)
	check(bool(covered_sale.get("ok", false)), "100 shares allow a covered call")
	approx(covered_exchange.option_collateral(), 0.0, 0.01,
		"a covered call needs no cash collateral")
