extends Node

## Headless integration smoke test. Runs the real main scene with autoloads,
## starts a game, trades, navigates every screen, saves, loads and quits.

func _ready() -> void:
	Game.save_path = "user://saves/integration.json"
	SmaSaveService.clear(Game.save_path)
	var failures: Array[String] = []
	var main_scene: PackedScene = load("res://ui/main.tscn")
	var main := main_scene.instantiate()
	add_child(main)
	await get_tree().process_frame
	await get_tree().process_frame

	Game.new_game("integration-seed")
	await get_tree().process_frame
	if not Game.started:
		failures.append("game did not start")
	if Game.narrative == null or not Game.narrative.is_active():
		failures.append("opening story did not start")
	# Walk the opening story to the first choice and pick a path.
	for i in 8:
		if not Game.narrative.is_active():
			break
		var view: Dictionary = Game.narrative.current_view()
		if String(view.get("type", "")) == "choice":
			Game.narrative.choose(0)
		else:
			Game.narrative.advance()
	if Game.narrative.is_active():
		failures.append("opening story did not finish")
	if String(Game.narrative.flags.get("path", "")) != "value":
		failures.append("story choice did not set the path flag")

	await get_tree().process_frame
	var order := Game.submit_order({
		"ticker": "APLA", "side": "buy", "type": "market", "qty": 10,
	})
	if not bool(order.get("ok", false)):
		failures.append("market buy rejected: %s" % order.get("error", ""))
	if int(Game.get_position_qty("APLA")) != 10:
		failures.append("position did not update")
	if Game.narrative == null or not Game.narrative.is_active():
		failures.append("first-trade story did not trigger")
	# Close the first-trade story so it does not block the clock.
	for i in 10:
		if not Game.narrative.is_active():
			break
		var view: Dictionary = Game.narrative.current_view()
		if String(view.get("type", "")) == "choice":
			Game.narrative.choose(0)
		else:
			Game.narrative.advance()

	Game.step_minute()
	await get_tree().process_frame
	if int(Game.exchange.state["second"]) != 60:
		failures.append("minute step did not advance the clock")

	for screen_id in ["market", "trade", "portfolio"]:
		main.navigate(screen_id)
		await get_tree().process_frame
		await get_tree().process_frame

	main.navigate("academy")
	await get_tree().process_frame
	var section_result := Game.academy_mark_section_read("u1", "s1")
	if not bool(section_result.get("ok", false)):
		failures.append("academy section read failed")
	if not SmaAcademy.is_section_read(Game.academy, "u1", "s1"):
		failures.append("academy section was not recorded")
	var academy_screen = main._screens["academy"]
	academy_screen._open_quiz("u1")
	await get_tree().process_frame
	for child in main.get_children():
		if child is SmaQuizDialog:
			for entry in child._controls.values():
				if String(entry["type"]) == "numeric":
					entry["control"].text = "1"
				elif String(entry["type"]) == "multi":
					entry["checks"][0]["control"].button_pressed = true
				else:
					entry["checks"][0].button_pressed = true
			child._submit()
			child._close()
	await get_tree().process_frame
	if int(SmaAcademy.ensure_unit(Game.academy, "u1").get("quizAttempts", 0)) < 1:
		failures.append("academy quiz submission did not record an attempt")

	academy_screen._open_demo("candle")
	await get_tree().process_frame
	var demo_dialog: SmaDemoDialog = null
	for child in main.get_children():
		if child is SmaDemoDialog:
			demo_dialog = child
	if demo_dialog == null:
		failures.append("candle demo did not open")
	else:
		for i in 3:
			var bullish := demo_dialog.close_price_from_illustration() \
				>= demo_dialog.open_price_from_illustration()
			demo_dialog._answer_candle("bull" if bullish else "bear")
		demo_dialog._close()
	await get_tree().process_frame
	if not bool(Game.academy["demosCompleted"].get("candle", false)):
		failures.append("candle demo was not recorded")
	if not bool(SmaAcademy.evaluate_practice(Game.academy, SmaAcademy.unit("u9"), {})["done"]):
		failures.append("candle demo did not satisfy u9 practice")

	main.navigate("trade")
	await get_tree().process_frame
	var trade_screen = main._screens["trade"]
	trade_screen._open_financials()
	await get_tree().process_frame
	var financials_dialog: SmaFinancialsDialog = null
	for child in main.get_children():
		if child is SmaFinancialsDialog:
			financials_dialog = child
	if financials_dialog == null:
		failures.append("financials dialog did not open")
	else:
		financials_dialog._close()
	if not Game.academy["financialsViewed"].has(Game.selected_ticker):
		failures.append("financials view was not recorded")
	Game.academy_record_financials("NVDO")
	await get_tree().process_frame
	if not bool(SmaAcademy.evaluate_practice(Game.academy, SmaAcademy.unit("u11"), {})["done"]):
		failures.append("two financials views did not satisfy u11 practice")

	for demo_id in ["macro", "allocation", "risk", "strategies"]:
		academy_screen._open_demo(demo_id)
		await get_tree().process_frame
		var stage_demo: SmaDemoDialog = null
		for child in main.get_children():
			if child is SmaDemoDialog:
				stage_demo = child
		if stage_demo == null:
			failures.append("%s demo did not open" % demo_id)
			continue
		match demo_id:
			"macro":
				stage_demo._macro_fields["inflation"].value = 3.5
			"allocation":
				stage_demo._allocation_fields["stocks"].value = 70.0
			"risk":
				stage_demo._risk_fields["account"].value = 15000.0
			"strategies":
				stage_demo._on_strategy_changed(2)
		stage_demo._close()
		await get_tree().process_frame
		if not bool(Game.academy["demosCompleted"].get(demo_id, false)):
			failures.append("%s demo was not recorded" % demo_id)

	for demo_id in ["shortPnl", "margin", "stopOrder", "orderBook"]:
		academy_screen._open_demo(demo_id)
		await get_tree().process_frame
		var stage_demo: SmaDemoDialog = null
		for child in main.get_children():
			if child is SmaDemoDialog:
				stage_demo = child
		if stage_demo == null:
			failures.append("%s demo did not open" % demo_id)
			continue
		match demo_id:
			"shortPnl":
				stage_demo._short_fields["exit"].value = 45.0
			"margin":
				stage_demo._margin_fields["price"].value = 60.0
			"stopOrder":
				stage_demo._stop_fields["trail"].value = 8.0
			"orderBook":
				stage_demo._book_qty.value = 1000.0
		stage_demo._close()
		await get_tree().process_frame
		var recorded := bool(Game.academy["demosCompleted"].get(demo_id, false))
		if demo_id in ["margin", "orderBook"] and not recorded:
			failures.append("%s demo was not recorded" % demo_id)
		if demo_id in ["shortPnl", "stopOrder"] and recorded:
			failures.append("%s demo should not complete a practice" % demo_id)

	main.navigate("trade")
	await get_tree().process_frame
	trade_screen = main._screens["trade"]
	trade_screen._on_side("sell")
	trade_screen._on_type("stop")
	trade_screen._qty.value = 10
	var stop_reference := float(Game.exchange.quote("APLA").get("last", 0.0)) * 1.2
	trade_screen._stop_price.value = stop_reference
	trade_screen._submit()
	Game.step_minute()
	await get_tree().process_frame
	if not bool(SmaAcademy.evaluate_practice(Game.academy, SmaAcademy.unit("u19"),
			Game.academy_snapshot())["done"]):
		failures.append("filled stop order did not satisfy u19 practice")

	Game.submit_order({"ticker": "VISO", "side": "buy", "type": "market", "qty": 10})
	Game.selected_ticker = "VISO"
	main.navigate("trade")
	await get_tree().process_frame
	trade_screen = main._screens["trade"]
	if not trade_screen._oco_card.visible:
		failures.append("OCO card should show for an open long")
	else:
		var oco_last := float(Game.exchange.quote("VISO").get("last", 0.0))
		trade_screen._oco_qty.value = 10
		trade_screen._oco_tp.value = oco_last * 1.2
		trade_screen._oco_stop.value = oco_last * 0.8
		trade_screen._submit_oco()
		await get_tree().process_frame
		var oco_legs: Array = []
		for row in Game.exchange.open_order_rows("player"):
			if not String(row.get("ocoGroup", "")).is_empty():
				oco_legs.append(row)
		if oco_legs.size() != 2:
			failures.append("OCO UI did not create two legs")
		else:
			Game.cancel_order(String(oco_legs[0]["id"]))
			await get_tree().process_frame
			var live_legs := 0
			for row in Game.exchange.open_order_rows("player"):
				if String(row.get("ocoGroup", "")) == String(oco_legs[0]["ocoGroup"]):
					live_legs += 1
			if live_legs != 0:
				failures.append("cancelling one OCO leg left the sibling working")
	Game.submit_order({"ticker": "VISO", "side": "sell", "type": "market", "qty": 10})
	Game.selected_ticker = "APLA"
	await get_tree().process_frame

	Game.set_layout("advanced")
	await get_tree().process_frame
	main.navigate("trade")
	await get_tree().process_frame
	var advanced_trade = main._screens["trade"]
	if not advanced_trade._indicators_card.visible:
		failures.append("advanced layout should show technical indicators")
	Game.set_layout("beginner")
	await get_tree().process_frame
	academy_screen = main._screens["academy"]

	var short_open := Game.submit_order({
		"ticker": "NVDO", "side": "short", "type": "market", "qty": 5,
	})
	if not bool(short_open.get("ok", false)):
		failures.append("short open rejected: %s" % short_open.get("error", ""))
	var short_cover := Game.submit_order({
		"ticker": "NVDO", "side": "cover", "type": "market", "qty": 5,
	})
	if not bool(short_cover.get("ok", false)):
		failures.append("short cover rejected: %s" % short_cover.get("error", ""))
	if not bool(SmaAcademy.evaluate_practice(Game.academy, SmaAcademy.unit("u17"),
			Game.academy_snapshot())["done"]):
		failures.append("short round trip did not satisfy u17 practice")

	Game.academy_mark_section_read("u21", "s1")
	if Game.option_style() != "european":
		failures.append("options should start European")
	if not bool(Game.set_option_style("american").get("ok", false)):
		failures.append("option style should switch on a flat book")
	if Game.option_style() != "american":
		failures.append("American option style did not persist")
	if not bool(Game.set_option_style("european").get("ok", false)):
		failures.append("option style should switch back")
	main.navigate("options")
	await get_tree().process_frame
	var options_screen = main._screens["options"]
	if options_screen._chain.is_empty():
		failures.append("options chain did not render")
	else:
		options_screen._submit()
		await get_tree().process_frame
		options_screen._select_contract("put", options_screen._selected_strike)
		options_screen._submit()
		await get_tree().process_frame
		if Game.exchange.state["account"]["options"].size() != 2:
			failures.append("option purchases were not recorded")
		if bool(Game.set_option_style("american").get("ok", false)):
			failures.append("option style must lock while contracts are open")
		if not bool(SmaAcademy.evaluate_practice(Game.academy, SmaAcademy.unit("u22"),
				Game.academy_snapshot())["done"]):
			failures.append("call purchase did not satisfy u22 practice")
		if not bool(SmaAcademy.evaluate_practice(Game.academy, SmaAcademy.unit("u23"),
				Game.academy_snapshot())["done"]):
			failures.append("put purchase did not satisfy u23 practice")
		var option_rows: Array = Game.option_rows()
		for row in option_rows:
			if String(row.get("type", "")) == "put":
				options_screen._close_position(String(row["key"]), 1)
				break
		await get_tree().process_frame
		if Game.exchange.state["account"]["options"].size() != 1:
			failures.append("closing an option did not update the position")

	academy_screen._open_demo("greeks")
	await get_tree().process_frame
	var greeks_demo: SmaDemoDialog = null
	for child in main.get_children():
		if child is SmaDemoDialog:
			greeks_demo = child
	if greeks_demo == null:
		failures.append("greeks demo did not open")
	else:
		greeks_demo._greeks_fields["spot"].value = 55.0
		greeks_demo._close()
	await get_tree().process_frame
	if not bool(Game.academy["demosCompleted"].get("greeks", false)):
		failures.append("greeks demo was not recorded")

	academy_screen._open_demo("strategyPayoff")
	await get_tree().process_frame
	var strategy_demo: SmaDemoDialog = null
	for child in main.get_children():
		if child is SmaDemoDialog:
			strategy_demo = child
	if strategy_demo == null:
		failures.append("strategy payoff demo did not open")
	else:
		strategy_demo._payoff_strategy_preset.select(4)
		strategy_demo._update_strategy_payoff()
		if strategy_demo._payoff_strategy_labels["maxProfit"].text \
				!= I18n.t("demo.strategyPayoff.unlimited"):
			failures.append("long straddle should show unlimited profit")
		if strategy_demo._payoff_strategy_chart.values.size() != 41:
			failures.append("strategy payoff chart did not render")
		strategy_demo._close()
	await get_tree().process_frame

	var locked_strategy: Dictionary = Game.open_option_strategy(
		"cashSecuredPut", "APLA", 30, 1)
	if String(locked_strategy.get("error", "")) != "error.optionsSellLocked":
		failures.append("option strategies should stay locked before u25")

	Game.academy_mark_section_read("u25", "s1")
	await get_tree().process_frame
	var uncovered_call: Dictionary = Game.open_option_strategy(
		"coveredCall", "APLA", 30, 1)
	if String(uncovered_call.get("error", "")) != "error.needCoveredShares":
		failures.append("covered call without 100 shares should be rejected")
	main.navigate("options")
	await get_tree().process_frame
	options_screen = main._screens["options"]
	options_screen._select_contract("put", float(options_screen._chain["strikes"][1]))
	options_screen._set_mode("sell")
	await get_tree().process_frame
	options_screen._submit()
	await get_tree().process_frame
	if not bool(SmaAcademy.evaluate_practice(Game.academy, SmaAcademy.unit("u25"),
			Game.academy_snapshot())["done"]):
		failures.append("selling an option did not satisfy u25 practice")
	if not bool(SmaAcademy.evaluate_practice(Game.academy, SmaAcademy.unit("u26"),
			Game.academy_snapshot())["done"]):
		failures.append("cash-secured put did not satisfy u26 practice")
	var spread_result: Dictionary = Game.open_option_strategy(
		"bullCallSpread", "APLA", 30, 1)
	if not bool(spread_result.get("ok", false)):
		failures.append("bull call spread rejected: %s" % spread_result.get("error", ""))
	if not bool(SmaAcademy.evaluate_practice(Game.academy, SmaAcademy.unit("u27"),
			Game.academy_snapshot())["done"]):
		failures.append("call spread did not satisfy u27 practice")
	var volatility_result: Dictionary = Game.open_option_strategy(
		"longStraddle", "APLA", 30, 1)
	if not bool(volatility_result.get("ok", false)):
		failures.append("long straddle rejected: %s" % volatility_result.get("error", ""))
	if not bool(SmaAcademy.evaluate_practice(Game.academy, SmaAcademy.unit("u28"),
			Game.academy_snapshot())["done"]):
		failures.append("long straddle did not satisfy u28 practice")
	var has_short_option := false
	for position in Game.exchange.state["account"]["options"]:
		if int(position.get("qty", 0)) < 0:
			has_short_option = true
	if not has_short_option:
		failures.append("short option position was not recorded")

	var locked_future: Dictionary = Game.open_future("APLA", 30, "long", 1)
	if String(locked_future.get("error", "")) != "error.futuresLocked":
		failures.append("futures should stay locked before u29")
	Game.academy_mark_section_read("u29", "s1")
	await get_tree().process_frame
	main.navigate("futures")
	await get_tree().process_frame
	var futures_screen = main._screens["futures"]
	if futures_screen._chain.is_empty():
		failures.append("futures chain did not render")
	else:
		futures_screen._submit()
		await get_tree().process_frame
		if Game.exchange.state["account"]["futures"].size() != 1:
			failures.append("futures position was not recorded")
		if not bool(SmaAcademy.evaluate_practice(Game.academy, SmaAcademy.unit("u29"),
				Game.academy_snapshot())["done"]):
			failures.append("opening a future did not satisfy u29 practice")
	Game.submit_order({"ticker": "APLA", "side": "buy", "type": "market", "qty": 10})
	var hedge_open: Dictionary = Game.open_future("APLA", 30, "short", 1)
	if not bool(hedge_open.get("ok", false)):
		failures.append("hedge future rejected: %s" % hedge_open.get("error", ""))
	if not bool(SmaAcademy.evaluate_practice(Game.academy, SmaAcademy.unit("u30"),
			Game.academy_snapshot())["done"]):
		failures.append("stock plus short future did not satisfy u30 practice")
	academy_screen._open_demo("stressTest")
	await get_tree().process_frame
	var stress_demo: SmaDemoDialog = null
	for child in main.get_children():
		if child is SmaDemoDialog:
			stress_demo = child
	if stress_demo == null:
		failures.append("stress test demo did not open")
	else:
		stress_demo._stress_fields["equity"].value = 15000.0
		stress_demo._close()
	await get_tree().process_frame
	if not bool(Game.academy["demosCompleted"].get("stressTest", false)):
		failures.append("stress test demo was not recorded")
	if not bool(SmaAcademy.evaluate_practice(Game.academy, SmaAcademy.unit("u31"),
			Game.academy_snapshot())["done"]):
		failures.append("stress test demo did not satisfy u31 practice")
	if not bool(SmaAcademy.evaluate_practice(Game.academy, SmaAcademy.unit("u32"),
			Game.academy_snapshot())["done"]):
		failures.append("stock, option and futures trades did not satisfy u32")

	for section_id in ["s1", "s2", "s3"]:
		Game.academy_mark_section_read("u32", section_id)
	SmaAcademy.record_practice(Game.academy, "u32", Game.get_day())
	var u32_quiz := SmaAcademy.build_quiz("u32", 1)
	var u32_answers := {}
	for question in u32_quiz["questions"]:
		var question_id := String(question["id"])
		if String(question["type"]) == "numeric":
			u32_answers[question_id] = float(question.get("answer", 0.0))
		elif String(question["type"]) == "multi":
			u32_answers[question_id] = question.get("correctIds", [])
		else:
			var ids: Array = question.get("correctIds", [])
			u32_answers[question_id] = ids[0] if not ids.is_empty() else ""
	var u32_grade := SmaAcademy.grade_quiz(u32_quiz, u32_answers)
	SmaAcademy.record_quiz(Game.academy, "u32", int(u32_grade["score"]), Game.get_day())
	if not SmaAcademy.is_unit_unlocked(Game.academy, "b1"):
		failures.append("completing u32 did not unlock branch b1")
	main.navigate("academy")
	await get_tree().process_frame
	academy_screen._select_unit("b1")
	await get_tree().process_frame
	if academy_screen._selected_unit != "b1":
		failures.append("branch b1 did not open in the academy")

	Game.academy["units"]["u13"]["completed"] = true
	main.navigate("multiasset")
	await get_tree().process_frame
	var multiasset_screen = main._screens["multiasset"]
	if multiasset_screen._body.get_child_count() == 0:
		failures.append("multi-asset screen did not render")
	if not bool(Game.buy_bond("gov2", 1).get("ok", false)):
		failures.append("bond purchase failed")
	if not bool(Game.buy_fx("EURUSD", 1000).get("ok", false)):
		failures.append("FX purchase failed")
	if not bool(Game.buy_commodity("gold", 1).get("ok", false)):
		failures.append("commodity purchase failed")
	if not bool(Game.buy_crypto("BTC", 0.01).get("ok", false)):
		failures.append("crypto purchase failed")
	if Game.bond_rows().size() != 1:
		failures.append("bond position was not recorded")
	if Game.fx_rows().size() != 1:
		failures.append("FX position was not recorded")
	if Game.commodity_rows().size() != 1:
		failures.append("commodity position was not recorded")
	if Game.crypto_rows().size() != 1:
		failures.append("crypto position was not recorded")

	main.navigate("history")
	await get_tree().process_frame
	var history_screen = main._screens["history"]
	await history_screen._start_scenario("2008-crisis")
	await get_tree().process_frame
	if history_screen._dataset.is_empty():
		failures.append("history dataset did not load")
	history_screen._selected_symbol = "AAPL"
	history_screen._trade("buy")
	var history_run: Dictionary = Game.history.run("2008-crisis")
	if history_run.is_empty() or int(history_run["account"]["positions"].get("AAPL", {}).get("qty", 0)) != 10:
		failures.append("history trade did not reach the run account")
	history_screen._advance_day()
	await get_tree().process_frame

	for screen_id in ["story", "market"]:
		main.navigate(screen_id)
		await get_tree().process_frame
		await get_tree().process_frame

	# --- Phase 9 surfaces: ETFs, challenges, career, fund, quant, tax and utility pages.
	var etf_buy: Dictionary = Game.submit_order({"ticker": "MKT", "side": "buy",
		"type": "market", "qty": 5})
	if not bool(etf_buy.get("ok", false)):
		failures.append("ETF order failed")
	if int(Game.exchange.state["account"]["positions"].get("MKT", {}).get("qty", 0)) != 5:
		failures.append("ETF position missing")
	Game.academy["units"]["u3"]["completed"] = true
	var challenge: Dictionary = Game.start_challenge("firstProfit")
	if not bool(challenge.get("ok", false)):
		failures.append("challenge did not start")
	if Game.challenge_progress().is_empty():
		failures.append("challenge progress missing")
	Game.career["rank"] = 5
	var fund_created: Dictionary = Game.create_fund({
		"name": "Integration Fund", "strategy": "longOnly", "riskProfile": "balanced",
		"initialAum": 1000000.0, "managementRate": 0.02, "performanceRate": 0.2,
		"benchmarkId": "index", "hurdleRate": 0.0, "leverageEnabled": false,
		"taxProfileId": "none",
	})
	if not bool(fund_created.get("ok", false)):
		failures.append("fund creation failed")
	if not bool(Game.fund_buy("APLA", 10).get("ok", false)):
		failures.append("fund purchase failed")
	var fund_plan: Dictionary = Game.fund_generate_plan()
	if not bool(fund_plan.get("ok", false)):
		failures.append("fund plan generation failed")
	var quant_result: Dictionary = Game.quant_backtest({
		"ticker": "APLA", "strategy": "smaCross", "initialCash": 100000.0,
	})
	if not bool(quant_result.get("ok", false)):
		failures.append("quant backtest failed")
	var tax_result: Dictionary = Game.tax_estimate({"fxRate": 1.0, "accountType": "gia",
		"incomeBand": "basic", "taxableIncome": 0.0, "isaContributions": 0.0,
		"ukShares": false})
	if not bool(tax_result.get("ok", false)):
		failures.append("tax estimate failed")
	var reports: Array = Game.statement_history("APLA", 8)
	if reports.size() != 8:
		failures.append("quarterly statement history missing")
	if Game.review_summary().is_empty():
		failures.append("review summary missing")
	if Game.review_timeline(5).is_empty():
		failures.append("review timeline missing")
	Game.set_layout("advanced")
	if absf(SmaUiTheme.density - 0.88) > 0.001:
		failures.append("advanced layout density not applied")
	Game.set_layout("beginner")
	if absf(SmaUiTheme.density - 1.0) > 0.001:
		failures.append("beginner layout density not restored")
	Game.set_theme("light")
	if SmaUiTheme.mode != "light":
		failures.append("light theme not applied")
	Game.set_theme("dark")
	if SmaUiTheme.mode != "dark":
		failures.append("dark theme not restored")
	var replay := Game.replay_snapshot(Game.replay_max_day())
	if replay.is_empty() or not (replay.get("positions", []) is Array):
		failures.append("replay snapshot missing")

	for screen_id in ["etf", "challenges", "career", "fund", "quant", "tax",
			"statements", "glossary", "sandbox", "roadmap", "boundaries", "settings",
			"replay"]:
		if not main._screens.has(screen_id):
			failures.append("screen not registered: %s" % screen_id)
			continue
		main.navigate(screen_id)
		await get_tree().process_frame
		await get_tree().process_frame
		var surface = main._screens[screen_id]
		if surface.get_child_count() == 0:
			failures.append("screen did not render: %s" % screen_id)
	main.navigate("dashboard")
	await get_tree().process_frame

	var save_ok := Game.save_game(false)
	if not save_ok:
		failures.append("save failed")
	var equity_before := Game.get_equity()
	var day_before := Game.get_day()
	if not Game.load_game():
		failures.append("load failed")
	if absf(Game.get_equity() - equity_before) > 0.01:
		failures.append("equity changed across save/load")
	if Game.get_day() != day_before:
		failures.append("day changed across save/load")
	if not SmaAcademy.is_section_read(Game.academy, "u1", "s1"):
		failures.append("academy progress was not restored")
	if not bool(Game.academy["demosCompleted"].get("candle", false)):
		failures.append("demo completion was not restored")
	if not Game.academy["financialsViewed"].has("NVDO"):
		failures.append("financials views were not restored")
	if not bool(Game.academy["demosCompleted"].get("greeks", false)):
		failures.append("greeks demo completion was not restored")
	var restored_short := false
	for position in Game.exchange.state["account"]["options"]:
		if int(position.get("qty", 0)) < 0:
			restored_short = true
	if not restored_short:
		failures.append("short option position was not restored")
	if String(Game.fund.get("status", "none")) != "active":
		failures.append("fund was not restored")
	if int(Game.career.get("rank", 0)) != 5:
		failures.append("career rank was not restored")
	if String(Game.challenges.get("active", {}).get("id", "")) != "firstProfit":
		failures.append("challenge was not restored")
	if int(Game.exchange.state["account"]["positions"].get("MKT", {}).get("qty", 0)) != 5:
		failures.append("ETF position was not restored")
	if Game.exchange.state["account"]["futures"].size() != 2:
		failures.append("futures positions were not restored")
	if Game.bond_rows().size() != 1 or Game.fx_rows().size() != 1 \
			or Game.commodity_rows().size() != 1 or Game.crypto_rows().size() != 1:
		failures.append("multi-asset positions were not restored")
	var restored_history: Dictionary = Game.history.run("2008-crisis")
	if restored_history.is_empty() \
			or int(restored_history["account"]["positions"].get("AAPL", {}).get("qty", 0)) != 10:
		failures.append("history run was not restored")
	main.navigate("portfolio")
	await get_tree().process_frame
	await get_tree().process_frame

	# Full-day fast-forward runs in chunks so the UI stays responsive.
	Game.step_day()
	for i in 1200:
		await get_tree().process_frame
		if not Game.is_fast_forwarding():
			break
	if Game.is_fast_forwarding():
		failures.append("fast-forward did not finish")
	if Game.get_day() != day_before + 1:
		failures.append("fast-forward did not advance one day")
	for i in 12:
		if not Game.narrative.is_active():
			break
		var view: Dictionary = Game.narrative.current_view()
		if String(view.get("type", "")) == "choice":
			Game.narrative.choose(0)
		else:
			Game.narrative.advance()
	main.navigate("portfolio")
	await get_tree().process_frame
	await get_tree().process_frame

	main.navigate("portfolio")
	await get_tree().process_frame
	await get_tree().process_frame

	# Sandbox runs on a separate book and restores the career save on exit.
	var career_day := Game.get_day()
	var sandbox_start: Dictionary = Game.start_sandbox(50000.0, "sandbox-it", "hard")
	if not bool(sandbox_start.get("ok", false)):
		failures.append("sandbox did not start")
	if not Game.sandbox_mode:
		failures.append("sandbox flag missing")
	if absf(Game.exchange.fee_bps - 3.0) > 0.001:
		failures.append("sandbox difficulty did not change commission")
	if absf(float(Game.exchange.state["account"]["cash"]) - 50000.0) > 0.01:
		failures.append("sandbox cash not applied")
	Game.exit_sandbox()
	await get_tree().process_frame
	if Game.sandbox_mode:
		failures.append("sandbox did not exit")
	if Game.get_day() != career_day:
		failures.append("career day changed after sandbox")
	if String(Game.fund.get("status", "none")) != "active":
		failures.append("career fund was not restored after sandbox")

	# Sweep every teaching demo and quiz dialog so missing fields or signals
	# surface even when a flow is not covered above.
	main.navigate("academy")
	await get_tree().process_frame
	academy_screen = main._screens["academy"]
	for demo_id in SmaDemoDialog.SUPPORTED:
		academy_screen._open_demo(String(demo_id))
		await get_tree().process_frame
		var sweep_demo: SmaDemoDialog = null
		for child in main.get_children():
			if child is SmaDemoDialog:
				sweep_demo = child
		if sweep_demo == null:
			failures.append("demo did not open: %s" % demo_id)
			continue
		sweep_demo._close()
		await get_tree().process_frame
	for unit in SmaAcademy.units():
		var unit_id := String(unit.get("id", ""))
		if unit_id == "" or SmaAcademy.build_quiz(unit_id, 1).is_empty():
			continue
		academy_screen._open_quiz(unit_id)
		await get_tree().process_frame
		var sweep_quiz: SmaQuizDialog = null
		for child in main.get_children():
			if child is SmaQuizDialog:
				sweep_quiz = child
		if sweep_quiz == null:
			failures.append("quiz did not open: %s" % unit_id)
			continue
		sweep_quiz._close()
		await get_tree().process_frame

	main.navigate("fund")
	await get_tree().process_frame
	var fund_screen = main._screens["fund"]
	fund_screen._run_optimizer()
	await get_tree().process_frame
	if fund_screen._optimizer.is_empty():
		failures.append("fund optimizer did not produce weights")
	else:
		fund_screen._apply_optimizer()
		await get_tree().process_frame

	main.navigate("replay")
	await get_tree().process_frame
	var replay_screen = main._screens["replay"]
	replay_screen._previous()
	replay_screen._next()
	replay_screen._latest()
	await get_tree().process_frame
	if replay_screen._selected_day < 0 \
			or Game.replay_snapshot(replay_screen._selected_day).is_empty():
		failures.append("replay snapshot did not render")

	main.navigate("statements")
	await get_tree().process_frame
	var statements_screen = main._screens["statements"]
	var statement_history: Array = Game.statement_history(statements_screen._ticker, 8)
	if statement_history.size() > 1:
		statements_screen._quarter_index = 1
		statements_screen.refresh()
		await get_tree().process_frame
	if statements_screen._quarter_index >= statement_history.size():
		failures.append("statement quarter selection is out of range")

	main.navigate("history")
	await get_tree().process_frame
	var sweep_history = main._screens["history"]
	for scenario_id in ["2008-crisis", "2015-long", "2020-covid", "2022-hikes"]:
		await sweep_history._start_scenario(scenario_id)
		await get_tree().process_frame
		if sweep_history._dataset.is_empty():
			failures.append("history scenario did not load: %s" % scenario_id)
			continue
		sweep_history._advance_day()
		await get_tree().process_frame

	if not SmaDisplay.MODES.has(String(Game.settings.get("displayMode", ""))):
		failures.append("stored display mode is not supported")
	if not SmaDisplay.PRESETS.has(String(Game.settings.get("windowPreset", ""))):
		failures.append("stored window preset is not supported")

	for preset in SmaDisplay.PRESETS:
		Game.set_window_preset(preset)
		if String(Game.settings.get("windowPreset", "")) != preset:
			failures.append("window preset did not persist: %s" % preset)
	Game.set_window_preset("bogus")
	if String(Game.settings.get("windowPreset", "")) != "auto":
		failures.append("invalid window preset did not fall back to auto")

	for mode in SmaDisplay.MODES:
		Game.set_display_mode(mode)
		if String(Game.settings.get("displayMode", "")) != mode:
			failures.append("display mode did not persist: %s" % mode)
	Game.set_display_mode("bogus")
	if String(Game.settings.get("displayMode", "")) != "windowed":
		failures.append("invalid display mode did not fall back to windowed")

	Game.set_display_mode("fullscreen")
	for preset in SmaDisplay.PRESETS:
		Game.set_window_preset(preset)
		if String(Game.settings.get("displayMode", "")) != "fullscreen":
			failures.append("preset changes escaped fullscreen: %s" % preset)

	if DisplayServer.get_name() != "headless" \
			and OS.get_environment("SMA_KEEP_WINDOW") != "1":
		await get_tree().process_frame
		if DisplayServer.window_get_mode() != DisplayServer.WINDOW_MODE_FULLSCREEN:
			failures.append("fullscreen mode was not applied to the window")
		Game.set_display_mode("windowed")
		await get_tree().process_frame
		if DisplayServer.window_get_mode() != DisplayServer.WINDOW_MODE_WINDOWED:
			failures.append("windowed mode was not restored")
		if Game.get_window().min_size != SmaDisplay.MIN_SIZE:
			failures.append("window minimum size was not applied")

	Game.set_display_mode("windowed")
	Game.set_window_preset("auto")

	if failures.is_empty():
		print("INTEGRATION OK equity=%.2f day=%d stories=%d" % [
			Game.get_equity(), Game.get_day(), Game.narrative.stories.size()])
		SmaSaveService.clear(Game.save_path)
		Game.save_path = SmaSaveService.SAVE_PATH
		get_tree().quit(0)
	else:
		for failure in failures:
			printerr("INTEGRATION FAIL: ", failure)
		SmaSaveService.clear(Game.save_path)
		Game.save_path = SmaSaveService.SAVE_PATH
		get_tree().quit(1)
