## Fund management screen: create a fund, trade its book, manage clients and
## staff and monitor fees, redemptions, risk limits, attribution and peers.
class_name SmaFundScreen
extends SmaScreen

var _body: VBoxContainer
var _selected_ticker := ""
var _trade_qty := 10
var _research: Dictionary = {}
var _optimizer: Dictionary = {}
var _optimizer_method := "minVariance"
var _optimizer_lookback := 60
var _optimizer_max_weight := 25
var _optimizer_cash := 10


func _build() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	var root := SmaKit.vbox(10)
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(root)
	var scroll := SmaKit.scroll()
	root.add_child(scroll)
	_body = SmaKit.vbox(12)
	scroll.add_child(_body)


func refresh(_reason: String = "") -> void:
	if not built:
		return
	SmaKit.clear_children(_body)
	if game == null or not game.started:
		return
	_render_header()
	if not game.fund_unlocked():
		_render_locked()
		return
	var status := String(game.fund.get("status", "none"))
	if status != "active":
		_render_setup(status == "closed")
		return
	_render_metrics()
	_render_trading()
	_render_plan()
	_render_research()
	_render_optimizer()
	_render_clients()
	_render_team()
	_render_operations()
	_render_risk_model()
	_render_attribution()
	_render_leaderboard()
	_render_insights()
	_render_events()
	_body.add_child(SmaKit.muted(I18n.t("fund.note"), 10))


func _render_header() -> void:
	var header := SmaKit.hbox(10)
	var titles := SmaKit.vbox(2)
	titles.add_child(SmaKit.label(I18n.t("fund.title"), 20))
	var subtitle := SmaKit.muted(I18n.t("fund.subtitle"), 12)
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	titles.add_child(subtitle)
	header.add_child(titles)
	header.add_child(SmaKit.hspacer())
	var status := String(game.fund.get("status", "none"))
	if status == "active":
		header.add_child(SmaKit.label(I18n.t("fund.status.active"), 11, SmaUiTheme.POSITIVE))
	elif status == "closed":
		header.add_child(SmaKit.label(I18n.t("fund.status.closed"), 11, SmaUiTheme.WARNING))
	_body.add_child(header)


func _render_locked() -> void:
	var card := SmaKit.card(14)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("fund.lockedTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("fund.lockedText", {
		"rank": SmaFund.RANK_REQUIREMENT, "current": int(game.career.get("rank", 1)),
	}), 12))
	box.add_child(SmaKit.muted(I18n.t("fund.lockedHint"), 11))
	box.add_child(SmaKit.button(I18n.t("fund.goCareer"), _go_career, true))
	_body.add_child(card)


func _go_career() -> void:
	var main := get_tree().get_first_node_in_group("main")
	if main != null and main.has_method("navigate"):
		main.navigate("career")


func _render_setup(reopening: bool) -> void:
	if reopening:
		var closure := SmaKit.card(12)
		var closure_box := SmaKit.vbox(3)
		closure.add_child(closure_box)
		closure_box.add_child(SmaKit.label(I18n.t("fund.close.title"), 14))
		closure_box.add_child(SmaKit.muted(I18n.t("fund.closeReason.%s" % String(
			game.fund.get("closeReason", ""))), 11))
		_body.add_child(closure)
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(8)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("fund.reopenTitle" if reopening
		else "fund.setupTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("fund.setupSubtitle"), 11))
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 6)
	box.add_child(grid)

	var name_input := LineEdit.new()
	name_input.text = "Atlas Capital"
	name_input.max_length = 36
	name_input.custom_minimum_size.x = 200
	grid.add_child(_field("fund.nameLabel", name_input))

	var strategy := OptionButton.new()
	var strategy_keys: Array = SmaFund.STRATEGIES.keys()
	for index in strategy_keys.size():
		strategy.add_item(I18n.t(String(SmaFund.STRATEGIES[strategy_keys[index]]["nameKey"])))
	strategy.selected = 0
	strategy.custom_minimum_size.x = 180
	grid.add_child(_field("fund.strategyLabel", strategy))

	var risk := OptionButton.new()
	var risk_keys: Array = SmaFund.RISK_PROFILES.keys()
	for index in risk_keys.size():
		risk.add_item(I18n.t(String(SmaFund.RISK_PROFILES[risk_keys[index]]["nameKey"])))
	risk.selected = 1
	risk.custom_minimum_size.x = 160
	grid.add_child(_field("fund.riskLabel", risk))

	var aum := OptionButton.new()
	for index in SmaFund.AUM_OPTIONS.size():
		aum.add_item(SmaFormat.compact(float(SmaFund.AUM_OPTIONS[index])))
	aum.selected = 1
	aum.custom_minimum_size.x = 130
	grid.add_child(_field("fund.aumLabel", aum))

	var management := OptionButton.new()
	management.add_item(I18n.t("fund.managementFeeOption", {"value": 1}))
	management.add_item(I18n.t("fund.managementFeeOption", {"value": 2}))
	management.selected = 1
	grid.add_child(_field("fund.managementFeeLabel", management))

	var performance := OptionButton.new()
	performance.add_item(I18n.t("fund.performanceFeeOption", {"value": 10}))
	performance.add_item(I18n.t("fund.performanceFeeOption", {"value": 20}))
	performance.selected = 1
	grid.add_child(_field("fund.performanceFeeLabel", performance))

	var benchmark := OptionButton.new()
	var benchmark_keys: Array = SmaFund.BENCHMARKS.keys()
	for index in benchmark_keys.size():
		benchmark.add_item(I18n.t(String(SmaFund.BENCHMARKS[benchmark_keys[index]]["nameKey"])))
	grid.add_child(_field("fund.benchmarkLabel", benchmark))

	var hurdle := OptionButton.new()
	for value in SmaFund.HURDLE_OPTIONS:
		hurdle.add_item(I18n.t("fund.hurdleOption", {"value": int(float(value) * 100.0)}))
	grid.add_child(_field("fund.hurdleLabel", hurdle))

	var leverage := OptionButton.new()
	leverage.add_item(I18n.t("fund.leverageOff"))
	leverage.add_item(I18n.t("fund.leverageOn"))
	grid.add_child(_field("fund.leverageLabel", leverage))

	var tax := OptionButton.new()
	var tax_keys: Array = SmaFund.TAX_PROFILES.keys()
	for index in tax_keys.size():
		tax.add_item(I18n.t(String(SmaFund.TAX_PROFILES[tax_keys[index]]["nameKey"])))
	grid.add_child(_field("fund.taxLabel", tax))

	var create := SmaKit.button(I18n.t("fund.reopen" if reopening else "fund.create"),
		Callable(), true)
	create.pressed.connect(func():
		game.create_fund({
			"name": name_input.text,
			"strategy": String(strategy_keys[strategy.selected]),
			"riskProfile": String(risk_keys[risk.selected]),
			"initialAum": SmaFund.AUM_OPTIONS[aum.selected],
			"managementRate": 0.01 if management.selected == 0 else 0.02,
			"performanceRate": 0.1 if performance.selected == 0 else 0.2,
			"benchmarkId": String(benchmark_keys[benchmark.selected]),
			"hurdleRate": SmaFund.HURDLE_OPTIONS[hurdle.selected],
			"leverageEnabled": leverage.selected == 1,
			"taxProfileId": String(tax_keys[tax.selected]),
		})
		refresh())
	box.add_child(create)
	box.add_child(SmaKit.muted(I18n.t("fund.setupNote", {
		"fee": "2%", "interval": SmaFund.FEE_INTERVAL}), 10))
	_body.add_child(card)


func _field(label_key: String, control: Control) -> VBoxContainer:
	var box := SmaKit.vbox(1)
	box.add_child(SmaKit.caption(I18n.t(label_key)))
	box.add_child(control)
	return box


func _render_metrics() -> void:
	var metrics: Dictionary = game.fund_metrics()
	if metrics.is_empty():
		return
	var nav_point := 1.0
	var values: Array = []
	for entry in game.fund.get("history", []):
		values.append(float(entry.get("navPerUnit", 1.0)))
	values.append(float(metrics["navPerUnit"]))
	var chart_card := SmaKit.card(12)
	var chart_box := SmaKit.vbox(4)
	chart_card.add_child(chart_box)
	chart_box.add_child(SmaKit.label(I18n.t("fund.chart.title"), 14))
	var chart := SmaLineChart.new()
	chart.custom_minimum_size.y = 150
	chart_box.add_child(chart)
	chart.set_series(values, SmaUiTheme.ACCENT, "number")
	chart_box.add_child(SmaKit.muted(I18n.t("fund.chart.note"), 10))
	_body.add_child(chart_card)

	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	grid.add_child(_stat("fund.stats.aum", SmaFormat.compact(float(metrics["nav"])),
		I18n.t("fund.stats.aumSub", {"count": game.fund["clients"].size()})))
	grid.add_child(_stat("fund.stats.navPerUnit",
		SmaFormat.money(float(metrics["navPerUnit"]), 4),
		I18n.t("fund.stats.navSub", {"units": SmaFormat.num(float(metrics["units"]), 0)})))
	grid.add_child(_stat("fund.stats.totalReturn",
		SmaFormat.pct(float(metrics["totalReturn"]), 2),
		I18n.t("fund.stats.vsBenchmark", {
			"value": SmaFormat.pct(float(metrics["alpha"]), 2)}),
		float(metrics["totalReturn"])))
	grid.add_child(_stat("fund.stats.drawdown",
		SmaFormat.pct_plain(float(metrics["drawdown"]), 2),
		I18n.t("fund.stats.drawdownSub", {"limit": SmaFund.MAX_DRAWDOWN}),
		-float(metrics["drawdown"])))
	grid.add_child(_stat("fund.stats.cashRatio",
		SmaFormat.pct_plain(float(metrics["cashRatio"]), 2),
		I18n.t("fund.stats.cashSub", {
			"min": SmaFormat.num(float(metrics["cashFloorPct"]), 2) + "%"})))
	grid.add_child(_stat("fund.stats.companyCash",
		SmaFormat.money(float(game.fund["companyCash"])),
		I18n.t("fund.stats.companyCashSub", {
			"value": SmaFormat.money(float(game.fund.get("withdrawnToPersonal", 0.0)))})))
	grid.add_child(_stat("fund.stats.managementFees",
		SmaFormat.money(float(game.fund["managementFees"])),
		I18n.t("fund.stats.feeSub", {"days": maxi(0, int(game.fund["lastFeeDay"])
			+ SmaFund.FEE_INTERVAL - game.get_day())})))
	grid.add_child(_stat("fund.stats.performanceFees",
		SmaFormat.money(float(game.fund["performanceFees"])),
		I18n.t("fund.stats.hwmSub", {
			"value": SmaFormat.money(float(game.fund["highWaterMark"]), 4)})))
	_body.add_child(grid)
	_render_risk(metrics)


func _stat(label_key: String, value: String, sub: String, tone: float = 0.0) -> PanelContainer:
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(2)
	card.add_child(box)
	box.add_child(SmaKit.caption(I18n.t(label_key)))
	box.add_child(SmaKit.label(value, 15, SmaKit.value_color(tone) if tone != 0.0
		else SmaUiTheme.TEXT))
	box.add_child(SmaKit.muted(sub, 10))
	return card


func _render_risk(metrics: Dictionary) -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("fund.risk.title"), 14))
	var rows := [
		["fund.risk.cash", SmaFormat.pct_plain(float(metrics["cashRatio"]), 2),
			I18n.t("fund.risk.cashFloor", {
				"value": SmaFormat.num(float(metrics["cashFloorPct"]), 2) + "%"}),
			bool(metrics["cashBreach"])],
		["fund.risk.leverage", SmaFormat.num(float(metrics["leverage"]), 2) + "x",
			I18n.t("fund.risk.maxLeverage", {
				"value": SmaFormat.num(float(metrics["leverageLimit"]), 2) + "x"}),
			bool(metrics["leverageBreach"])],
		["fund.risk.topPosition", String(metrics["topTicker"]),
			I18n.t("fund.risk.maxPosition", {
				"value": SmaFormat.pct_plain(float(metrics["maxPositionPct"]), 2)}),
			bool(metrics["positionBreach"])],
		["fund.risk.drawdown", SmaFormat.pct_plain(float(metrics["drawdown"]), 2),
			I18n.t("fund.risk.maxDrawdown", {"value": str(SmaFund.MAX_DRAWDOWN)}),
			float(metrics["drawdown"]) >= SmaFund.MAX_DRAWDOWN],
	]
	for row in rows:
		var line := SmaKit.hbox(8)
		line.add_child(SmaKit.label(I18n.t(String(row[0])), 11))
		line.add_child(SmaKit.hspacer())
		line.add_child(SmaKit.label(String(row[1]), 11))
		line.add_child(SmaKit.muted(String(row[2]), 10))
		line.add_child(SmaKit.label(I18n.t("fund.risk.breach" if bool(row[3])
			else "fund.risk.ok"), 10,
			SmaUiTheme.WARNING if bool(row[3]) else SmaUiTheme.POSITIVE))
		box.add_child(line)
	box.add_child(SmaKit.muted(I18n.t("fund.risk.days", {
		"days": int(metrics["riskDays"]), "max": SmaFund.MAX_RISK_DAYS}), 10))
	_body.add_child(card)


func _render_trading() -> void:
	var metrics: Dictionary = game.fund_metrics()
	var tickers: Array = SmaCompanyCatalog.load_companies().keys()
	tickers.sort()
	if _selected_ticker == "" or not tickers.has(_selected_ticker):
		_selected_ticker = String(tickers[0])
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(6)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("fund.trade.title"), 14))
	box.add_child(SmaKit.muted(I18n.t("fund.trade.subtitle"), 11))
	box.add_child(SmaKit.muted(I18n.t("fund.trade.cash", {
		"value": SmaFormat.money(float(game.fund["account"]["cash"]))}), 11))
	var row := SmaKit.hbox(8)
	var select := OptionButton.new()
	for index in tickers.size():
		select.add_item(String(tickers[index]))
		if String(tickers[index]) == _selected_ticker:
			select.selected = index
	select.custom_minimum_size.x = 160
	select.item_selected.connect(func(index):
		_selected_ticker = String(tickers[index]))
	row.add_child(select)
	var qty := SpinBox.new()
	qty.min_value = 1
	qty.max_value = 1000000
	qty.step = 1
	qty.value = _trade_qty
	qty.custom_minimum_size.x = 110
	qty.value_changed.connect(func(value): _trade_qty = int(value))
	row.add_child(qty)
	row.add_child(SmaKit.button(I18n.t("fund.trade.buy"), _buy, true))
	row.add_child(SmaKit.button(I18n.t("fund.trade.sell"), _sell))
	box.add_child(row)
	var positions := SmaFund.position_rows(game.fund["account"], game.fund_quotes())
	if positions.is_empty():
		box.add_child(SmaKit.muted(I18n.t("fund.trade.noPositions"), 12))
	else:
		box.add_child(SmaKit.header_row(
			["fund.trade.ticker", "fund.trade.qty", "fund.trade.avgCost",
				"fund.trade.value", "fund.trade.pnl", "fund.trade.weight"],
			[1.0, 0.8, 1.0, 1.0, 1.0, 0.8],
			[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))
		for position in positions:
			var pnl := float(position["pnl"])
			var weight := float(position["value"]) / maxf(1.0, float(metrics["nav"])) * 100.0
			box.add_child(SmaKit.data_row([
				String(position["ticker"]), SmaFormat.num(float(position["qty"]), 0),
				SmaFormat.money(float(position["avgCost"])),
				SmaFormat.money(float(position["value"])),
				SmaFormat.signed_money(pnl), SmaFormat.pct_plain(weight, 1),
			], [1.0, 0.8, 1.0, 1.0, 1.0, 0.8],
			[SmaUiTheme.TEXT, SmaUiTheme.TEXT, SmaUiTheme.MUTED, SmaUiTheme.TEXT,
				SmaKit.value_color(pnl), SmaUiTheme.MUTED],
			[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))
	_body.add_child(card)


func _buy() -> void:
	game.fund_buy(_selected_ticker, _trade_qty)
	refresh()


func _sell() -> void:
	game.fund_sell(_selected_ticker, _trade_qty)
	refresh()


func _render_plan() -> void:
	var config: Dictionary = game.fund.get("quantPlan", {})
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(7)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("fund.plan.title"), 14))
	box.add_child(SmaKit.muted(I18n.t("fund.plan.subtitle"), 11))
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 12)
	box.add_child(grid)
	var enabled := OptionButton.new()
	enabled.add_item(I18n.t("fund.plan.off"))
	enabled.add_item(I18n.t("fund.plan.on"))
	enabled.selected = 1 if bool(config.get("enabled", false)) else 0
	grid.add_child(_field("fund.plan.enableLabel", enabled))
	var strategy := OptionButton.new()
	var strategy_keys: Array = SmaQuant.STRATEGIES.keys()
	for index in strategy_keys.size():
		strategy.add_item(I18n.t(String(SmaQuant.STRATEGIES[strategy_keys[index]]["nameKey"])))
		if String(strategy_keys[index]) == String(config.get("strategyId", "smaCross")):
			strategy.selected = index
	grid.add_child(_field("fund.plan.strategyLabel", strategy))
	var top_n := SpinBox.new()
	top_n.min_value = 2
	top_n.max_value = 10
	top_n.value = int(config.get("topN", 5))
	grid.add_child(_field("fund.plan.topNLabel", top_n))
	var rebalance := SpinBox.new()
	rebalance.min_value = 5
	rebalance.max_value = 60
	rebalance.value = int(config.get("rebalanceDays", 21))
	grid.add_child(_field("fund.plan.intervalLabel", rebalance))
	var auto := OptionButton.new()
	auto.add_item(I18n.t("fund.plan.off"))
	auto.add_item(I18n.t("fund.plan.on"))
	auto.selected = 1 if bool(config.get("autoRebalance", false)) else 0
	grid.add_child(_field("fund.plan.autoLabel", auto))
	var cash_buffer := SpinBox.new()
	cash_buffer.min_value = 0
	cash_buffer.max_value = 50
	cash_buffer.value = float(config.get("cashBuffer", 0.1)) * 100.0
	grid.add_child(_field("fund.plan.cashBufferLabel", cash_buffer))
	var params: Dictionary = config.get("params", {})
	var param_fields := {}
	var definition := SmaQuant.strategy(String(strategy_keys[strategy.selected]))
	for parameter in definition["params"]:
		var input := SpinBox.new()
		input.min_value = float(parameter["min"])
		input.max_value = float(parameter["max"])
		input.step = float(parameter["step"])
		input.value = float(params.get(String(parameter["id"]), parameter["default"]))
		param_fields[String(parameter["id"])] = input
		grid.add_child(_field(String(parameter["labelKey"]), input))
	var actions := SmaKit.hbox(8)
	var store := SmaKit.button(I18n.t("fund.plan.generate"), Callable(), true)
	store.pressed.connect(func():
		var next_params := {}
		for key in param_fields.keys():
			next_params[key] = (param_fields[key] as SpinBox).value
		game.fund_set_strategy({
			"enabled": enabled.selected == 1, "strategyId": String(strategy_keys[strategy.selected]),
			"params": next_params, "topN": int(top_n.value),
			"rebalanceDays": int(rebalance.value),
			"cashBuffer": cash_buffer.value / 100.0,
			"autoRebalance": auto.selected == 1,
			"lastPlanDay": config.get("lastPlanDay", null),
			"lastAutoDay": config.get("lastAutoDay", null),
			"plan": null,
		})
		game.fund_generate_plan()
		refresh())
	actions.add_child(store)
	box.add_child(actions)
	var plan: Variant = config.get("plan", null)
	if typeof(plan) == TYPE_DICTIONARY and not plan.is_empty():
		box.add_child(SmaKit.muted(I18n.t("fund.plan.generated", {
			"day": SmaCalendar.iso_date(int(plan.get("day", 0)))}), 10))
		box.add_child(SmaKit.muted(I18n.t("fund.plan.nav", {
			"value": SmaFormat.money(float(plan.get("nav", 0.0)))}), 10))
		var trades: Array = plan.get("trades", [])
		if trades.is_empty():
			box.add_child(SmaKit.muted(I18n.t("fund.plan.aligned"), 11))
		else:
			box.add_child(SmaKit.header_row(
				["fund.plan.side", "fund.plan.ticker", "fund.plan.qty", "fund.plan.price"],
				[0.5, 1.0, 0.8, 1.0]))
			for trade in trades.slice(0, 10):
				box.add_child(SmaKit.data_row([
					I18n.t("trade.%s" % String(trade["side"])), String(trade["ticker"]),
					SmaFormat.num(float(trade["qty"]), 0),
					SmaFormat.money(float(trade["price"])),
				], [0.5, 1.0, 0.8, 1.0]))
			box.add_child(SmaKit.button(I18n.t("fund.plan.apply"), _apply_plan, true))
	else:
		box.add_child(SmaKit.muted(I18n.t("fund.plan.noPlan"), 11))
	_body.add_child(card)


func _apply_plan() -> void:
	game.fund_apply_plan()
	refresh()


func _render_research() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("fund.research.title"), 14))
	box.add_child(SmaKit.muted(I18n.t("fund.research.subtitle"), 11))
	box.add_child(SmaKit.button(I18n.t("fund.research.run"), _run_research, true))
	if _research.is_empty():
		box.add_child(SmaKit.muted(I18n.t("fund.research.empty"), 11))
	elif not bool(_research.get("ok", false)):
		box.add_child(SmaKit.muted(I18n.t(String(_research.get("error",
			"fund.research.empty"))), 11))
	else:
		var best: Dictionary = _research["best"]
		var config: Dictionary = best["config"]
		box.add_child(SmaKit.muted(I18n.t("fund.research.window", {
			"start": String(_research["startDay"]), "end": String(_research["endDay"]),
		}), 10))
		box.add_child(SmaKit.muted(I18n.t("fund.research.bestTitle", {
			"strategy": I18n.t(String(SmaQuant.strategy(String(
				_research["strategyId"]))["nameKey"]))}), 11))
		box.add_child(SmaKit.muted("%d · %d%% · %d" % [int(config["topN"]),
			int(float(config["cashBuffer"]) * 100.0), int(config["rebalanceDays"])], 11))
		box.add_child(SmaKit.muted(I18n.t("fund.research.split", {
			"value": int(_research["splitPct"])}), 10))
		box.add_child(SmaKit.button(I18n.t("fund.research.apply"),
			_apply_research.bind(config), true))
	_body.add_child(card)


func _run_research() -> void:
	_research = game.fund_research()
	refresh()


func _apply_research(config: Dictionary) -> void:
	game.fund_apply_research(config)
	_research = {}
	refresh()


func _render_optimizer() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(6)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("fund.optimizer.title"), 14))
	box.add_child(SmaKit.muted(I18n.t("fund.optimizer.subtitle"), 11))
	var row := SmaKit.hbox(10)
	var method := OptionButton.new()
	for index in SmaFund.OPTIMIZER_METHODS.size():
		var key := String(SmaFund.OPTIMIZER_METHODS[index])
		method.add_item(I18n.t("fund.optimizer.%s" % key))
		if key == _optimizer_method:
			method.selected = index
	method.item_selected.connect(func(index):
		_optimizer_method = String(SmaFund.OPTIMIZER_METHODS[index])
		_optimizer = {})
	row.add_child(_field("fund.optimizer.methodLabel", method))
	var lookback := SpinBox.new()
	lookback.min_value = 20
	lookback.max_value = 250
	lookback.value = _optimizer_lookback
	lookback.value_changed.connect(func(value): _optimizer_lookback = int(value))
	row.add_child(_field("fund.optimizer.lookbackLabel", lookback))
	var max_weight := SpinBox.new()
	max_weight.min_value = 5
	max_weight.max_value = 50
	max_weight.value = _optimizer_max_weight
	max_weight.value_changed.connect(func(value): _optimizer_max_weight = int(value))
	row.add_child(_field("fund.optimizer.maxWeightLabel", max_weight))
	var cash := SpinBox.new()
	cash.min_value = 5
	cash.max_value = 50
	cash.value = _optimizer_cash
	cash.value_changed.connect(func(value): _optimizer_cash = int(value))
	row.add_child(_field("fund.optimizer.cashBufferLabel", cash))
	box.add_child(row)
	box.add_child(SmaKit.button(I18n.t("fund.optimizer.run"), _run_optimizer, true))
	box.add_child(SmaKit.muted(I18n.t("fund.optimizer.%sDesc" % _optimizer_method), 10))
	box.add_child(SmaKit.muted(I18n.t("fund.optimizer.note"), 10))
	if _optimizer.is_empty():
		box.add_child(SmaKit.muted(I18n.t("fund.optimizer.empty"), 11))
	elif not bool(_optimizer.get("ok", false)):
		box.add_child(SmaKit.muted(I18n.t(String(_optimizer.get("error",
			"fund.optimizer.empty"))), 11))
	else:
		box.add_child(SmaKit.muted(I18n.t("fund.optimizer.expectedReturn", {
			"value": SmaFormat.pct(float(_optimizer["expectedReturnPct"]), 2)}), 10))
		box.add_child(SmaKit.muted(I18n.t("fund.optimizer.expectedVol", {
			"value": SmaFormat.pct_plain(float(_optimizer["expectedVolatilityPct"]), 2)})
			+ " · " + I18n.t("fund.optimizer.equalVol", {
				"value": SmaFormat.pct_plain(float(_optimizer["equalWeightVolatilityPct"]), 2)})
			+ " · " + I18n.t("fund.optimizer.cashWeight", {
				"value": SmaFormat.pct_plain(float(_optimizer["cashWeightPct"]), 1)}), 10))
		box.add_child(SmaKit.muted(I18n.t("fund.optimizer.diversification", {
			"value": SmaFormat.pct_plain(float(_optimizer["diversificationPct"]), 1)})
			+ " · " + I18n.t("fund.optimizer.sharpe", {
				"value": SmaFormat.num(float(_optimizer["expectedSharpe"]), 2)}), 10))
		box.add_child(SmaKit.muted(I18n.t("fund.optimizer.tableTitle", {
			"count": SmaFormat.num(float(_optimizer["universe"]), 0)}), 10))
		box.add_child(SmaKit.header_row(
			["fund.optimizer.ticker", "fund.optimizer.sector", "fund.optimizer.weight",
				"fund.optimizer.assetReturn", "fund.optimizer.assetVol",
				"fund.optimizer.riskContribution"],
			[0.8, 1.2, 0.8, 0.9, 0.8, 0.9],
			[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_LEFT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))
		for weight in _optimizer["weights"].slice(0, 14):
			box.add_child(SmaKit.data_row([
				String(weight["ticker"]), SmaKit.sector_label(String(weight["sector"])),
				SmaFormat.pct_plain(float(weight["weightPct"]), 1),
				SmaFormat.pct(float(weight["expectedReturnPct"]), 2),
				SmaFormat.pct_plain(float(weight.get("volatilityPct", 0.0)), 1),
				SmaFormat.pct_plain(float(weight.get("riskContributionPct", 0.0)), 1),
			], [0.8, 1.2, 0.8, 0.9, 0.8, 0.9],
			[SmaUiTheme.TEXT, SmaUiTheme.MUTED, SmaUiTheme.TEXT, SmaKit.value_color(
				float(weight["expectedReturnPct"])), SmaUiTheme.MUTED, SmaUiTheme.TEXT],
			[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_LEFT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))
		box.add_child(SmaKit.button(I18n.t("fund.optimizer.apply"),
			_apply_optimizer, true))
		box.add_child(SmaKit.muted(I18n.t("fund.optimizer.applyNote"), 10))
		box.add_child(SmaKit.muted(I18n.t("fund.optimizer.disclaimer"), 10))
	_body.add_child(card)


func _run_optimizer() -> void:
	_optimizer = game.fund_optimize(_optimizer_method, _optimizer_lookback,
		float(_optimizer_max_weight) / 100.0, float(_optimizer_cash) / 100.0)
	refresh()


func _apply_optimizer() -> void:
	if bool(_optimizer.get("ok", false)):
		game.fund_apply_optimizer(_optimizer["weights"])
	_optimizer = {}
	refresh()


func _render_clients() -> void:
	var metrics: Dictionary = game.fund_metrics()
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("fund.clients.title", {
		"count": game.fund["clients"].size()}), 14))
	for client in game.fund["clients"]:
		var value := float(client["units"]) * float(metrics.get("navPerUnit", 1.0))
		var request: Variant = client.get("request", null)
		var line := SmaKit.hbox(8)
		line.add_child(SmaKit.label(String(client["name"]), 11))
		line.add_child(SmaKit.muted(I18n.t(String(client["typeKey"])), 10))
		line.add_child(SmaKit.hspacer())
		line.add_child(SmaKit.muted(SmaFormat.money(value), 10))
		line.add_child(SmaKit.muted(I18n.t("fund.clients.trust") + " " +
			SmaFormat.num(float(client["trust"]), 0), 10))
		if request != null:
			line.add_child(SmaKit.label(I18n.t("fund.clients.requestPending", {
				"days": maxi(0, int(request["dueDay"]) - game.get_day())}), 10,
				SmaUiTheme.WARNING))
			line.add_child(SmaKit.button(I18n.t("fund.clients.settle"),
				_settle.bind(String(client["id"]))))
		else:
			line.add_child(SmaKit.label(I18n.t("fund.clients.active"), 10,
				SmaUiTheme.POSITIVE))
		box.add_child(line)
	box.add_child(SmaKit.label(I18n.t("fund.clients.candidates"), 12))
	if game.fund["candidates"].is_empty():
		box.add_child(SmaKit.muted(I18n.t("fund.clients.noCandidates"), 11))
	for candidate in game.fund["candidates"]:
		var line := SmaKit.hbox(8)
		line.add_child(SmaKit.label(String(candidate["name"]), 11))
		line.add_child(SmaKit.muted(I18n.t("fund.clients.principal", {
			"value": SmaFormat.money(float(candidate["principal"]))}), 10))
		line.add_child(SmaKit.hspacer())
		line.add_child(SmaKit.button(I18n.t("fund.clients.accept"),
			_accept_client.bind(String(candidate["id"]))))
		box.add_child(line)
	_body.add_child(card)


func _settle(client_id: String) -> void:
	game.fund_settle_redemption(client_id)
	refresh()


func _accept_client(candidate_id: String) -> void:
	game.fund_accept_client(candidate_id)
	refresh()


func _render_team() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("fund.team.title"), 14))
	box.add_child(SmaKit.muted(I18n.t("fund.team.subtitle"), 11))
	for role in SmaFund.ROLES:
		var hired: Dictionary = {}
		for employee in game.fund["employees"]:
			if String(employee.get("role", "")) == String(role["id"]):
				hired = employee
				break
		var line := SmaKit.hbox(8)
		line.add_child(SmaKit.label(I18n.t(String(role["nameKey"])), 11))
		line.add_child(SmaKit.muted(I18n.t("fund.team.salary", {
			"value": SmaFormat.money(float(role["salary"]))}), 10))
		line.add_child(SmaKit.muted(I18n.t("fund.team.skill", {
			"value": int(role["skill"])}), 10))
		line.add_child(SmaKit.hspacer())
		if hired.is_empty():
			line.add_child(SmaKit.button(I18n.t("fund.team.hire"),
				_hire.bind(String(role["id"])), true))
		else:
			line.add_child(SmaKit.label(String(hired["name"]), 10, SmaUiTheme.MUTED))
			line.add_child(SmaKit.button(I18n.t("fund.team.fire"),
				_fire.bind(String(role["id"]))))
		box.add_child(line)
	box.add_child(SmaKit.muted(I18n.t("fund.team.note", {
		"max": SmaFund.MAX_UNPAID_DAYS}), 10))
	_body.add_child(card)


func _hire(role_id: String) -> void:
	game.fund_hire(role_id)
	refresh()


func _fire(role_id: String) -> void:
	game.fund_fire(role_id)
	refresh()


func _render_operations() -> void:
	var fund: Dictionary = game.fund
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("fund.ops.title"), 14))
	for pair in [
		["fund.ops.managementRate", SmaFormat.num(float(fund["managementRate"]) * 100.0, 1) + "%"],
		["fund.ops.performanceRate", SmaFormat.num(float(fund["performanceRate"]) * 100.0, 1) + "%"],
		["fund.ops.hurdle", SmaFormat.num(float(fund["hurdleRate"]) * 100.0, 1) + "%"],
		["fund.ops.hwm", SmaFormat.money(float(fund["highWaterMark"]), 4)],
		["fund.ops.payrollDue", SmaFormat.money(float(fund["payrollDue"]))],
		["fund.ops.operatingDue", SmaFormat.money(float(fund["operatingDue"]))],
		["fund.ops.feePayable", SmaFormat.money(float(fund["feePayable"]))],
		["fund.ops.companyCash", SmaFormat.money(float(fund["companyCash"]))],
		["fund.ops.taxesPaid", SmaFormat.money(float(fund["account"].get("taxesPaid", 0.0)))],
	]:
		box.add_child(_kv(String(pair[0]), String(pair[1])))
	box.add_child(SmaKit.button(I18n.t("fund.ops.withdraw"), _withdraw))
	_body.add_child(card)


func _withdraw() -> void:
	game.fund_withdraw_company_cash()
	refresh()


func _kv(label_key: String, value: String) -> HBoxContainer:
	var row := SmaKit.hbox(8)
	row.add_child(SmaKit.muted(I18n.t(label_key), 11))
	row.add_child(SmaKit.hspacer())
	row.add_child(SmaKit.label(value, 11))
	return row


func _render_risk_model() -> void:
	var result: Dictionary = game.fund_risk_model()
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("fund.riskModel.title"), 14))
	if not bool(result.get("ok", false)):
		box.add_child(SmaKit.muted(I18n.t(String(result.get("error",
			"fund.riskModel.history"))), 11))
		_body.add_child(card)
		return
	box.add_child(SmaKit.muted(I18n.t("fund.riskModel.totalRisk", {
		"value": SmaFormat.pct_plain(float(result["totalRiskPct"]), 2)}), 11))
	for row in result["contributions"]:
		box.add_child(_kv("fund.riskModel.%s" % String(row["id"]),
			SmaFormat.pct(float(row["contributionPct"]), 2)))
	for row in result["stress"]:
		box.add_child(_kv("fund.riskModel.%s" % String(row["id"]),
			SmaFormat.pct(float(row["impactPct"]), 2)))
	_body.add_child(card)


func _render_attribution() -> void:
	var attribution: Dictionary = game.fund_attribution()
	if attribution.is_empty():
		return
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("fund.attr.title"), 14))
	box.add_child(SmaKit.muted(I18n.t("fund.attr.subtitle", {
		"beta": SmaFormat.num(float(attribution["beta"]), 2)}), 11))
	var contributions: Dictionary = attribution["contributions"]
	for key in ["market", "sector", "cash", "fees", "selection"]:
		box.add_child(_kv("fund.attr.%s" % key,
			SmaFormat.pct(float(contributions[key]), 2)))
	_body.add_child(card)


func _render_leaderboard() -> void:
	var metrics: Dictionary = game.fund_metrics()
	if metrics.is_empty():
		return
	var rows: Array = game.fund_leaderboard()
	rows.append({"id": "player", "name": String(game.fund["name"]),
		"totalReturn": float(metrics["totalReturn"]), "aum": float(metrics["nav"]),
		"player": true})
	rows.sort_custom(func(a, b): return float(a["totalReturn"]) > float(b["totalReturn"]))
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("fund.leaderboard.title"), 14))
	for index in rows.size():
		var row: Dictionary = rows[index]
		var name := String(row.get("name", "")) if bool(row.get("player", false)) \
			else I18n.t(String(row.get("nameKey", "")))
		box.add_child(SmaKit.data_row([
			"%d" % (index + 1), name,
			SmaFormat.pct(float(row["totalReturn"]), 2),
			SmaFormat.compact(float(row["aum"])),
		], [0.3, 2.0, 1.0, 1.0],
		[SmaUiTheme.MUTED, SmaUiTheme.ACCENT if bool(row.get("player", false))
			else SmaUiTheme.TEXT, SmaKit.value_color(float(row["totalReturn"])),
			SmaUiTheme.MUTED]))
	_body.add_child(card)


func _render_insights() -> void:
	var insights: Array = game.fund.get("insights", [])
	if insights.is_empty():
		return
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(3)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("fund.insights.title"), 14))
	for insight in insights.slice(maxi(0, insights.size() - 6)):
		var text := ""
		var kind := String(insight.get("kind", ""))
		if kind == "research":
			text = I18n.t("fund.insight.research", {
				"ticker": String(insight["ticker"]),
				"rating": I18n.t("fund.rating.%s" % String(insight["rating"])),
				"momentum": SmaFormat.pct(float(insight["momentum"]), 2)})
		elif kind == "quant":
			text = I18n.t("fund.insight.quant", {
				"ticker": String(insight["ticker"]),
				"momentum": SmaFormat.pct(float(insight["momentum"]), 2)})
		elif kind == "risk":
			text = I18n.t("fund.insight.risk", {
				"cash": SmaFormat.pct_plain(float(insight["cashRatio"]), 2),
				"top": SmaFormat.pct_plain(float(insight["topWeight"]), 2),
				"drawdown": SmaFormat.pct_plain(float(insight["drawdown"]), 2)})
		elif kind == "macro":
			var snapshot: Dictionary = insight.get("snapshot", {})
			text = I18n.t("fund.insight.macro", {
				"rate": SmaFormat.pct_plain(float(snapshot.get("policyRate", 0.0)), 2),
				"inflation": SmaFormat.pct_plain(float(snapshot.get("inflation", 0.0)), 2),
				"growth": SmaFormat.pct_plain(float(snapshot.get("growth", 0.0)), 2),
				"regime": I18n.t("macro.regime.%s" % String(snapshot.get("regime", "neutral")))})
		if text != "":
			box.add_child(SmaKit.muted("%s · %s" % [
				I18n.t("fund.role.%s.name" % String(insight.get("role", ""))), text], 10))
	_body.add_child(card)


func _render_events() -> void:
	var events: Array = game.fund.get("events", [])
	if events.is_empty():
		return
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(3)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("fund.events.title"), 14))
	for event in events.slice(0, 8):
		box.add_child(SmaKit.muted(_event_text(event), 10))
	_body.add_child(card)


func _event_text(event: Dictionary) -> String:
	var event_type := String(event.get("type", ""))
	match event_type:
		"created":
			return I18n.t("fund.event.created", {
				"amount": SmaFormat.money(float(event.get("amount", 0.0)))})
		"subscription":
			return I18n.t("fund.event.subscription", {
				"name": String(event.get("name", "")),
				"amount": SmaFormat.money(float(event.get("amount", 0.0)))})
		"redemption", "redemptionPaid":
			return I18n.t("fund.event.redemption", {
				"name": String(event.get("name", "")),
				"amount": SmaFormat.money(float(event.get("amount", 0.0)))})
		"redemptionRequest":
			return I18n.t("fund.event.redemptionRequest", {
				"name": String(event.get("name", ""))})
		"dividend":
			return I18n.t("fund.event.dividend", {
				"amount": SmaFormat.money(float(event.get("amount", 0.0)))})
		"managementFee":
			return I18n.t("fund.event.managementFee", {
				"amount": SmaFormat.money(float(event.get("amount", 0.0)))})
		"performanceFee":
			return I18n.t("fund.event.performanceFee", {
				"amount": SmaFormat.money(float(event.get("amount", 0.0)))})
		"payroll":
			return I18n.t("fund.event.payroll", {
				"amount": SmaFormat.money(float(event.get("amount", 0.0)))})
		"payrollShort":
			return I18n.t("fund.event.payrollShort", {
				"amount": SmaFormat.money(float(event.get("amount", 0.0)))})
		"operatingCost":
			return I18n.t("fund.event.operatingCost", {
				"amount": SmaFormat.money(float(event.get("amount", 0.0)))})
		"keyPerson":
			return I18n.t("fund.event.keyPerson", {
				"name": String(event.get("name", "")),
				"role": I18n.t("fund.role.%s.name" % String(event.get("role", "")))})
		"candidate":
			return I18n.t("fund.event.candidate", {
				"name": String(event.get("name", "")),
				"amount": SmaFormat.money(float(event.get("amount", 0.0)))})
		"closed":
			return I18n.t("fund.event.closed", {
				"reason": I18n.t("fund.closeReason.%s" % String(event.get("reason", "")))})
	return I18n.t("fund.event.other")
