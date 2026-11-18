extends Node

## Renders each screen to PNG for visual review. Run with a real renderer:
##   godot --path godot res://tests/screenshot.tscn

const DEFAULT_OUT_DIR := "/tmp/sma_shots"

var out_dir := DEFAULT_OUT_DIR
var main: Node


func _ready() -> void:
	var override := OS.get_environment("SMA_SHOT_DIR")
	if override != "":
		out_dir = override
	DirAccess.make_dir_recursive_absolute(out_dir)
	Game.save_path = "user://saves/screenshot.json"
	SmaSaveService.clear(Game.save_path)
	var scene: PackedScene = load("res://ui/main.tscn")
	main = scene.instantiate()
	add_child(main)
	await _settle(8)
	await _shot("start")

	Game.new_game("screenshot-seed")
	await _settle(8)
	await _shot("dialogue")

	for i in 20:
		if not Game.narrative.is_active():
			break
		var view: Dictionary = Game.narrative.current_view()
		if String(view.get("type", "")) == "choice":
			Game.narrative.choose(0)
		else:
			Game.narrative.advance()
	await _settle(4)

	main.navigate("market")
	await _settle(6)
	await _shot("market")

	main.navigate("trade")
	await _settle(6)
	await _shot("trade")
	main._screens["trade"]._on_type("stop")
	await _settle(4)
	await _shot("trade_stop")
	main._screens["trade"]._on_type("trailing")
	await _settle(4)
	await _shot("trade_trailing")
	main._screens["trade"]._on_type("market")
	await _settle(2)

	Game.submit_order({"ticker": "APLA", "side": "buy", "type": "market", "qty": 40})
	for i in 10:
		if not Game.narrative.is_active():
			break
		var story_view: Dictionary = Game.narrative.current_view()
		if String(story_view.get("type", "")) == "choice":
			Game.narrative.choose(0)
		else:
			Game.narrative.advance()
	for i in 8:
		Game.step_minute()
	await _settle(6)
	var trade_screen = main._screens["trade"]
	trade_screen._right_scroll.scroll_vertical = 100000
	await _settle(4)
	await _shot("trade_filled")
	Game.academy_mark_section_read("u4", "s3")
	trade_screen.refresh()
	trade_screen._right_scroll.scroll_vertical = 0
	await _settle(4)
	if trade_screen._oco_card.visible:
		var oco_last := float(Game.exchange.quote(Game.selected_ticker).get("last", 0.0))
		trade_screen._oco_tp.value = SmaFormat.round_to(oco_last * 1.1, 2)
		trade_screen._oco_stop.value = SmaFormat.round_to(oco_last * 0.9, 2)
		await _settle(4)
		await _shot("trade_oco")
	Game.set_layout("advanced")
	await _settle(6)
	main.navigate("trade")
	await _settle(6)
	await _shot("trade_advanced")
	Game.set_layout("beginner")
	await _settle(6)
	main.navigate("trade")
	await _settle(4)

	main.navigate("portfolio")
	await _settle(6)
	await _shot("portfolio")

	main.navigate("dashboard")
	await _settle(6)
	await _shot("dashboard")

	main.navigate("academy")
	await _settle(8)
	await _shot("academy")
	var academy_screen = main._screens["academy"]
	academy_screen._open_glossary("stock")
	await _settle(6)
	await _shot("glossary")
	for child in main.get_children():
		if child is SmaGlossaryDialog:
			child._close()
	await _settle(3)
	academy_screen._open_quiz("u1")
	await _settle(6)
	await _shot("quiz")
	for child in main.get_children():
		if child is SmaQuizDialog:
			child._close()
	await _settle(3)
	for unit_id in ["u1", "u2", "u3", "u4"]:
		Game.academy["units"][unit_id]["completed"] = true
	academy_screen._select_unit("u5")
	await _settle(6)
	await _shot("academy_stage2")
	for unit_id in ["u5", "u6", "u7", "u8"]:
		Game.academy["units"][unit_id]["completed"] = true
	academy_screen._select_unit("u9")
	await _settle(6)
	await _shot("academy_stage3")
	academy_screen._open_demo("candle")
	await _settle(6)
	await _shot("demo_candle")
	for child in main.get_children():
		if child is SmaDemoDialog:
			child._close()
	await _settle(3)
	academy_screen._open_demo("indicators")
	await _settle(6)
	for child in main.get_children():
		if child is SmaDemoDialog:
			child._view_period(5)
			child._view_period(10)
			child._answer_indicator(10)
	await _settle(4)
	await _shot("demo_indicators")
	for child in main.get_children():
		if child is SmaDemoDialog:
			child._close()
	await _settle(3)
	academy_screen._open_demo("dcf")
	await _settle(6)
	for child in main.get_children():
		if child is SmaDemoDialog:
			child._calculate_dcf()
	await _settle(4)
	await _shot("demo_dcf")
	for child in main.get_children():
		if child is SmaDemoDialog:
			child._close()
	await _settle(3)
	main.navigate("trade")
	await _settle(6)
	main._screens["trade"]._open_financials()
	await _settle(6)
	await _shot("financials")
	for child in main.get_children():
		if child is SmaFinancialsDialog:
			child._close()
	await _settle(3)
	main.navigate("academy")
	await _settle(4)
	for unit_id in ["u9", "u10", "u11"]:
		Game.academy["units"][unit_id]["completed"] = true
	for unit_id in ["u10", "u11", "u12"]:
		academy_screen._select_unit(unit_id)
		await _settle(4)
		await _shot("academy_%s" % unit_id)
	for unit_id in ["u12", "u13", "u14", "u15"]:
		Game.academy["units"][unit_id]["completed"] = true
	for unit_id in ["u13", "u14", "u15", "u16"]:
		academy_screen._select_unit(unit_id)
		await _settle(4)
		await _shot("academy_%s" % unit_id)
	for demo_id in ["macro", "allocation", "risk", "strategies"]:
		academy_screen._open_demo(demo_id)
		await _settle(6)
		await _shot("demo_%s" % demo_id)
		for child in main.get_children():
			if child is SmaDemoDialog:
				child._close()
		await _settle(3)
	for unit_id in ["u16", "u17", "u18", "u19"]:
		Game.academy["units"][unit_id]["completed"] = true
	for unit_id in ["u17", "u18", "u19", "u20"]:
		academy_screen._select_unit(unit_id)
		await _settle(4)
		await _shot("academy_%s" % unit_id)
	for demo_id in ["shortPnl", "margin", "stopOrder", "orderBook"]:
		academy_screen._open_demo(demo_id)
		await _settle(6)
		await _shot("demo_%s" % demo_id)
		for child in main.get_children():
			if child is SmaDemoDialog:
				child._close()
		await _settle(3)
	for unit_id in ["u20", "u21", "u22", "u23"]:
		Game.academy["units"][unit_id]["completed"] = true
	for unit_id in ["u21", "u22", "u23", "u24"]:
		academy_screen._select_unit(unit_id)
		await _settle(4)
		await _shot("academy_%s" % unit_id)
	for unit_id in ["u24", "u25", "u26", "u27"]:
		Game.academy["units"][unit_id]["completed"] = true
	for unit_id in ["u25", "u26", "u27", "u28"]:
		academy_screen._select_unit(unit_id)
		await _settle(4)
		await _shot("academy_%s" % unit_id)
	for unit_id in ["u28", "u29", "u30", "u31"]:
		Game.academy["units"][unit_id]["completed"] = true
	for unit_id in ["u29", "u30", "u31", "u32"]:
		academy_screen._select_unit(unit_id)
		await _settle(4)
		await _shot("academy_%s" % unit_id)
	for demo_id in ["optionPayoff", "greeks", "strategyPayoff",
			"futuresPnl", "hedge", "stressTest"]:
		academy_screen._open_demo(demo_id)
		await _settle(6)
		await _shot("demo_%s" % demo_id)
		for child in main.get_children():
			if child is SmaDemoDialog:
				child._close()
		await _settle(3)

	Game.academy["units"]["u32"]["completed"] = true
	for unit_id in ["b1", "b2", "b3", "b4", "b5", "b6"]:
		academy_screen._select_unit(unit_id)
		await _settle(4)
		await _shot("academy_%s" % unit_id)
	var academy_left_scroll: ScrollContainer = academy_screen.get_child(0) \
		.get_child(1).get_child(0).get_child(0)
	academy_left_scroll.scroll_vertical = 100000
	await _settle(4)
	await _shot("academy_branches")
	academy_left_scroll.scroll_vertical = 0

	main.navigate("macro")
	await _settle(6)
	await _shot("macro")

	Game.academy_mark_section_read("u21", "s1")
	main.navigate("options")
	await _settle(6)
	await _shot("options")
	Game.set_option_style("american")
	main.navigate("options")
	await _settle(6)
	await _shot("options_american")
	Game.set_option_style("european")
	main.navigate("options")
	await _settle(4)
	var chain := Game.option_chain("APLA")
	if not chain.is_empty():
		var contract := SmaOptions.find_contract(chain, "call", float(chain["strikes"][3]),
			int(chain["expiries"][0]["expiryDay"]))
		Game.buy_option("APLA", "call", float(contract["strike"]),
			int(contract["expiryDay"]), 1)
		main._screens["options"].refresh()
		await _settle(4)
		await _shot("options_position")

	Game.academy_mark_section_read("u25", "s1")
	main.navigate("options")
	await _settle(6)
	var options_screen = main._screens["options"]
	if not options_screen._chain.is_empty():
		options_screen._select_contract("put",
			float(options_screen._chain["strikes"][1]))
		options_screen._set_mode("sell")
		await _settle(4)
		await _shot("options_sell")
		options_screen._submit()
		await _settle(4)
		await _shot("options_short")
		var strategy_result: Dictionary = Game.open_option_strategy(
			"bullCallSpread", "APLA", 30, 1)
		if bool(strategy_result.get("ok", false)):
			main._screens["options"].refresh()
			await _settle(4)
			await _shot("options_strategy")
		var options_scroll: ScrollContainer = options_screen.get_child(0).get_child(0)
		options_scroll.scroll_vertical = 100000
		await _settle(6)
		await _shot("options_positions")
		options_scroll.scroll_vertical = 0

	Game.academy_mark_section_read("u29", "s1")
	main.navigate("futures")
	await _settle(6)
	await _shot("futures")
	var futures_screen = main._screens["futures"]
	if not futures_screen._chain.is_empty():
		futures_screen._submit()
		await _settle(4)
		futures_screen._set_side("short")
		await _settle(4)
		futures_screen._submit()
		await _settle(4)
		await _shot("futures_positions")

	main.navigate("multiasset")
	await _settle(6)
	await _shot("multiasset")
	Game.buy_bond("gov2", 2)
	Game.buy_fx("EURUSD", 1000)
	Game.buy_commodity("gold", 2)
	Game.buy_crypto("BTC", 0.01)
	main._screens["multiasset"].refresh()
	await _settle(4)
	await _shot("multiasset_positions")
	var asset_scroll: ScrollContainer = main._screens["multiasset"].get_child(0).get_child(0)
	asset_scroll.scroll_vertical = 100000
	await _settle(4)
	await _shot("multiasset_bottom")
	asset_scroll.scroll_vertical = 0

	main.navigate("history")
	await _settle(6)
	await _shot("history_scenarios")
	var history_screen = main._screens["history"]
	await history_screen._start_scenario("2008-crisis")
	await _settle(8)
	await _shot("history_lab")
	history_screen._advance_day()
	await _settle(6)
	await _shot("history_lab_day")

	main.navigate("story")
	await _settle(6)
	await _shot("story")

	Game.narrative.start_story("opening")
	await _settle(6)
	await _shot("dialogue_replay")
	for i in 12:
		if not Game.narrative.is_active():
			break
		var replay_view: Dictionary = Game.narrative.current_view()
		if String(replay_view.get("type", "")) == "choice":
			Game.narrative.choose(0)
		else:
			Game.narrative.advance()
	await _settle(3)

	Game.step_day()
	await _settle(3)
	await _shot("fast_forward")
	for i in 1200:
		if not Game.is_fast_forwarding():
			break
		await get_tree().process_frame
	for i in 12:
		if not Game.narrative.is_active():
			break
		var view: Dictionary = Game.narrative.current_view()
		if String(view.get("type", "")) == "choice":
			Game.narrative.choose(0)
		else:
			Game.narrative.advance()
	main.navigate("market")
	await _settle(6)
	await _shot("market_day1")

	main.navigate("replay")
	await _settle(8)
	await _shot("replay")
	main._screens["replay"]._previous()
	await _settle(6)
	await _shot("replay_scrub")

	main.navigate("news")
	await _settle(6)
	await _shot("news")

	main.navigate("etf")
	await _settle(6)
	await _shot("etf")
	Game.submit_order({"ticker": "MKT", "side": "buy", "type": "market", "qty": 10})
	main._screens["etf"].refresh()
	await _settle(4)
	await _shot("etf_position")

	main.navigate("challenges")
	await _settle(6)
	await _shot("challenges")
	Game.start_challenge("firstProfit")
	main._screens["challenges"].refresh()
	await _settle(4)
	await _shot("challenges_active")
	Game.abandon_challenge()

	Game.career["rank"] = 5
	main.navigate("career")
	await _settle(6)
	await _shot("career")
	var career_scroll: ScrollContainer = main._screens["career"].get_child(0).get_child(0)
	career_scroll.scroll_vertical = 100000
	await _settle(4)
	await _shot("career_ladder")
	career_scroll.scroll_vertical = 0

	Game.create_fund({
		"name": "Atlas Capital", "strategy": "longOnly", "riskProfile": "balanced",
		"initialAum": 1000000.0, "managementRate": 0.02, "performanceRate": 0.2,
		"benchmarkId": "index", "hurdleRate": 0.0, "leverageEnabled": false,
		"taxProfileId": "none",
	})
	Game.fund_buy("APLA", 200)
	Game.fund_buy("MSFY", 150)
	main.navigate("fund")
	await _settle(8)
	await _shot("fund")
	var fund_scroll: ScrollContainer = main._screens["fund"].get_child(0).get_child(0)
	fund_scroll.scroll_vertical = 100000
	await _settle(4)
	await _shot("fund_bottom")
	fund_scroll.scroll_vertical = 0
	Game.fund_generate_plan()
	main._screens["fund"].refresh()
	await _settle(6)
	fund_scroll.scroll_vertical = 700
	await _settle(4)
	await _shot("fund_plan")
	fund_scroll.scroll_vertical = 0
	main._screens["fund"]._run_optimizer()
	await _settle(8)
	fund_scroll.ensure_control_visible(fund_scroll.get_child(0).get_child(7))
	await _settle(6)
	await _shot("fund_optimizer")
	fund_scroll.scroll_vertical = 0

	main.navigate("quant")
	await _settle(10)
	await _shot("quant")
	var quant_scroll: ScrollContainer = main._screens["quant"].get_child(0).get_child(0)
	quant_scroll.scroll_vertical = 600
	await _settle(4)
	await _shot("quant_results")
	quant_scroll.scroll_vertical = 0
	main.navigate("tax")
	await _settle(6)
	await _shot("tax")
	var tax_scroll: ScrollContainer = main._screens["tax"].get_child(0).get_child(0)
	tax_scroll.scroll_vertical = 100000
	await _settle(4)
	await _shot("tax_bottom")
	tax_scroll.scroll_vertical = 0
	main.navigate("statements")
	await _settle(6)
	await _shot("statements")
	main.navigate("glossary")
	await _settle(6)
	await _shot("glossary_page")
	main.navigate("sandbox")
	await _settle(6)
	await _shot("sandbox")
	main.navigate("roadmap")
	await _settle(6)
	await _shot("roadmap")
	main.navigate("boundaries")
	await _settle(6)
	await _shot("boundaries")
	main.navigate("settings")
	await _settle(6)
	await _shot("settings")
	var settings_scroll: ScrollContainer = main._screens["settings"].get_child(0).get_child(0)
	settings_scroll.scroll_vertical = 100000
	await _settle(4)
	await _shot("settings_bottom")

	Game.set_layout("advanced")
	await _settle(6)
	main.navigate("dashboard")
	await _settle(6)
	await _shot("dashboard_advanced")
	Game.set_layout("beginner")
	await _settle(4)

	Game.set_theme("light")
	await _settle(8)
	main.navigate("dashboard")
	await _settle(8)
	await _shot("dashboard_light")
	main.navigate("market")
	await _settle(6)
	await _shot("market_light")
	main.navigate("replay")
	await _settle(8)
	await _shot("replay_light")
	main.navigate("settings")
	await _settle(6)
	await _shot("settings_light")
	main.navigate("trade")
	await _settle(8)
	main._screens["trade"]._on_timeframe("1D")
	await _settle(6)
	await _shot("trade_light")
	main.navigate("quant")
	await _settle(8)
	await _shot("quant_light")
	main.navigate("fund")
	await _settle(8)
	await _shot("fund_light")
	main.navigate("academy")
	await _settle(8)
	main._screens["academy"]._open_demo("optionPayoff")
	await _settle(8)
	await _shot("demo_optionPayoff_light")
	for child in main.get_children():
		if child is SmaDemoDialog:
			child._close()
	await _settle(4)

	Game.set_theme("dark")
	await _settle(6)

	I18n.set_locale("en")
	Game.settings["locale"] = "en"
	await _settle(10)
	main.navigate("dashboard")
	await _settle(8)
	await _shot("dashboard_en")
	main.navigate("market")
	await _settle(6)
	await _shot("market_en")
	main.navigate("trade")
	await _settle(8)
	main._screens["trade"]._on_timeframe("1D")
	await _settle(6)
	await _shot("trade_en")
	main.navigate("replay")
	await _settle(8)
	await _shot("replay_en")
	main.navigate("fund")
	await _settle(8)
	main._screens["fund"]._run_optimizer()
	await _settle(8)
	var fund_scroll_en: ScrollContainer = main._screens["fund"].get_child(0).get_child(0)
	fund_scroll_en.ensure_control_visible(fund_scroll_en.get_child(0).get_child(7))
	await _settle(6)
	await _shot("fund_optimizer_en")
	I18n.set_locale("zh_CN")
	Game.settings["locale"] = "zh_CN"
	await _settle(10)

	SmaSaveService.clear(Game.save_path)
	Game.save_path = SmaSaveService.SAVE_PATH
	get_tree().quit(0)


func _settle(frames: int) -> void:
	for i in frames:
		await get_tree().process_frame
	await get_tree().create_timer(0.12).timeout


func _shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var path := "%s/%s.png" % [out_dir, name]
	image.save_png(path)
	print("SHOT ", path, " ", image.get_width(), "x", image.get_height())
