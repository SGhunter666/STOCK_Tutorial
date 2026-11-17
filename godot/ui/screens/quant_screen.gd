## Quant Lab: backtests, parameter optimisation with an out-of-sample split,
## factor research, pooled regression and a small stock-selection model. Nothing
## on this page mutates the trading account.
class_name SmaQuantScreen
extends SmaScreen

var _body: VBoxContainer
var _draft: Dictionary = {}
var _mode := "backtest"
var _result: Dictionary = {}
var _result_mode := ""
var _factor_result: Dictionary = {}
var _fields: Dictionary = {}


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
	_fields.clear()
	if game == null or not game.started:
		return
	if _draft.is_empty():
		_draft = SmaQuant.normalize_config(game.quant)
		if String(_draft["ticker"]) == "":
			_draft["ticker"] = game.selected_ticker
		_mode = String(_draft["mode"])
	_render_header()
	if not SmaAcademy.is_unit_complete(game.academy, "u16"):
		_render_locked()
		return
	_render_modes()
	_render_config()
	_render_result()
	_body.add_child(SmaKit.muted(I18n.t("quant.note"), 10))


func _render_header() -> void:
	var header := SmaKit.hbox(10)
	var titles := SmaKit.vbox(2)
	titles.add_child(SmaKit.label(I18n.t("quant.title"), 20))
	var subtitle := SmaKit.muted(I18n.t("quant.subtitle"), 12)
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	titles.add_child(subtitle)
	header.add_child(titles)
	header.add_child(SmaKit.hspacer())
	header.add_child(SmaKit.label(I18n.t("quant.pill"), 11, SmaUiTheme.ACCENT))
	_body.add_child(header)


func _render_locked() -> void:
	var card := SmaKit.card(14)
	var box := SmaKit.vbox(6)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("quant.lockedTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("quant.lockedText"), 12))
	box.add_child(SmaKit.button(I18n.t("quant.goAcademy"), _go_academy, true))
	_body.add_child(card)


func _go_academy() -> void:
	var main := get_tree().get_first_node_in_group("main")
	if main != null and main.has_method("navigate"):
		main.navigate("academy")


func _render_modes() -> void:
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	var row := SmaKit.hbox(6)
	for mode in SmaQuant.MODES:
		var button := SmaKit.toggle(I18n.t("quant.mode.%s" % mode))
		button.button_pressed = mode == _mode
		button.custom_minimum_size.y = 32
		button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		button.pressed.connect(_set_mode.bind(mode))
		row.add_child(button)
	box.add_child(row)
	var description := SmaKit.muted(I18n.t("quant.mode.%sDesc" % _mode), 11)
	description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(description)
	_body.add_child(card)


func _set_mode(mode: String) -> void:
	_mode = mode
	_result = {}
	_result_mode = ""
	_factor_result = {}
	_draft["mode"] = mode
	game.set_quant_config(_draft)
	refresh()


func _render_config() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(8)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("quant.configTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("quant.configSubtitle"), 11))
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 6)
	box.add_child(grid)
	if _mode == "backtest" or _mode == "optimize":
		grid.add_child(_ticker_field())
		grid.add_child(_strategy_field())
		grid.add_child(_cash_field())
		grid.add_child(_commission_field())
		var definition := SmaQuant.strategy(String(_draft["strategy"]))
		for parameter in definition["params"]:
			grid.add_child(_param_field(parameter))
		if _mode == "backtest":
			grid.add_child(_factor_field())
			grid.add_child(_simple_spin("quant.factorLookbackLabel", "factorLookback", 20, 250, 1))
		else:
			grid.add_child(_objective_field())
			grid.add_child(_simple_spin("quant.splitLabel", "splitPct", 50, 90, 1))
	elif _mode == "regression":
		grid.add_child(_simple_spin("quant.reg.lookbackLabel", "mlLookback", 20, 50, 1))
		grid.add_child(_simple_spin("quant.reg.horizonLabel", "mlHorizon", 5, 30, 1))
	else:
		grid.add_child(_simple_spin("quant.ml.lookbackLabel", "mlLookback", 20, 50, 1))
		grid.add_child(_simple_spin("quant.ml.horizonLabel", "mlHorizon", 5, 30, 1))
		grid.add_child(_simple_spin("quant.ml.topNLabel", "mlTopN", 3, 10, 1))
		grid.add_child(_simple_spin("quant.ml.testPctLabel", "mlTestPct", 20, 50, 1))
		grid.add_child(_model_field())
		grid.add_child(_autotune_field())
	var actions := SmaKit.hbox(8)
	var run_key := "quant.run"
	if _mode == "optimize":
		run_key = "quant.runOptimize"
	elif _mode == "regression":
		run_key = "quant.runRegression"
	elif _mode == "ml":
		run_key = "quant.runMl"
	actions.add_child(SmaKit.button(I18n.t(run_key), _run, true))
	box.add_child(actions)
	var hint := "quant.mode.%sDesc" % _mode
	box.add_child(SmaKit.muted(I18n.t(hint), 10))
	_body.add_child(card)


func _field_box(label_key: String, control: Control) -> VBoxContainer:
	var box := SmaKit.vbox(1)
	box.add_child(SmaKit.caption(I18n.t(label_key)))
	box.add_child(control)
	return box


func _ticker_field() -> VBoxContainer:
	var select := OptionButton.new()
	var tickers: Array = SmaCompanyCatalog.load_companies().keys()
	tickers.sort()
	var current := String(_draft.get("ticker", ""))
	for index in tickers.size():
		var ticker := String(tickers[index])
		select.add_item(ticker)
		if ticker == current:
			select.selected = index
	select.custom_minimum_size.x = 150
	_fields["ticker"] = select
	return _field_box("quant.tickerLabel", select)


func _strategy_field() -> VBoxContainer:
	var select := OptionButton.new()
	var keys: Array = SmaQuant.STRATEGIES.keys()
	for index in keys.size():
		select.add_item(I18n.t(String(SmaQuant.STRATEGIES[keys[index]]["nameKey"])))
		if String(keys[index]) == String(_draft["strategy"]):
			select.selected = index
	select.custom_minimum_size.x = 170
	select.item_selected.connect(func(index):
		_draft["strategy"] = String(keys[index])
		_draft["params"] = SmaQuant.normalize_params(String(keys[index]), {})
		_draft = SmaQuant.normalize_config(_draft)
		_result = {}
		refresh())
	_fields["strategy"] = select
	return _field_box("quant.strategyLabel", select)


func _cash_field() -> VBoxContainer:
	var select := OptionButton.new()
	for index in SmaQuant.CASH_OPTIONS.size():
		select.add_item(SmaFormat.money(float(SmaQuant.CASH_OPTIONS[index])), index)
		if absf(float(SmaQuant.CASH_OPTIONS[index]) - float(_draft["initialCash"])) < 0.01:
			select.selected = index
	select.custom_minimum_size.x = 130
	_fields["initialCash"] = select
	return _field_box("quant.cashLabel", select)


func _commission_field() -> VBoxContainer:
	var input := SpinBox.new()
	input.min_value = 0
	input.max_value = 10
	input.step = 1
	input.value = float(_draft["commission"])
	input.custom_minimum_size.x = 100
	_fields["commission"] = input
	return _field_box("quant.commissionLabel", input)


func _param_field(parameter: Dictionary) -> VBoxContainer:
	var input := SpinBox.new()
	input.min_value = float(parameter["min"])
	input.max_value = float(parameter["max"])
	input.step = float(parameter["step"])
	var params: Dictionary = _draft.get("params", {})
	input.value = float(params.get(String(parameter["id"]), parameter["default"]))
	input.custom_minimum_size.x = 105
	_fields["param:%s" % String(parameter["id"])] = input
	return _field_box(String(parameter["labelKey"]), input)


func _factor_field() -> VBoxContainer:
	var select := OptionButton.new()
	for index in SmaQuant.FACTOR_OPTIONS.size():
		var factor := String(SmaQuant.FACTOR_OPTIONS[index])
		select.add_item(I18n.t("quant.factor.%s" % factor))
		if factor == String(_draft["factor"]):
			select.selected = index
	select.custom_minimum_size.x = 150
	select.item_selected.connect(func(_index):
		_factor_result = {}
		refresh())
	_fields["factor"] = select
	return _field_box("quant.factorLabel", select)


func _objective_field() -> VBoxContainer:
	var select := OptionButton.new()
	for index in SmaQuant.OBJECTIVES.size():
		var objective := String(SmaQuant.OBJECTIVES[index])
		select.add_item(I18n.t("quant.objective.%s" % objective))
		if objective == String(_draft["objective"]):
			select.selected = index
	select.custom_minimum_size.x = 150
	_fields["objective"] = select
	return _field_box("quant.objectiveLabel", select)


func _model_field() -> VBoxContainer:
	var select := OptionButton.new()
	for index in SmaQuant.ML_MODELS.size():
		var model := String(SmaQuant.ML_MODELS[index])
		select.add_item(I18n.t("quant.ml.model%s" % model.capitalize()))
		if model == String(_draft["mlModel"]):
			select.selected = index
	select.custom_minimum_size.x = 150
	_fields["mlModel"] = select
	return _field_box("quant.ml.modelLabel", select)


func _autotune_field() -> VBoxContainer:
	var select := OptionButton.new()
	select.add_item(I18n.t("quant.ml.autoTuneOff"))
	select.add_item(I18n.t("quant.ml.autoTuneOn"))
	select.selected = 1 if bool(_draft["mlAutoTune"]) else 0
	select.custom_minimum_size.x = 130
	_fields["mlAutoTune"] = select
	return _field_box("quant.ml.autoTuneLabel", select)


func _simple_spin(label_key: String, key: String, minimum: float, maximum: float,
		step: float) -> VBoxContainer:
	var input := SpinBox.new()
	input.min_value = minimum
	input.max_value = maximum
	input.step = step
	input.value = float(_draft.get(key, minimum))
	input.custom_minimum_size.x = 105
	_fields[key] = input
	return _field_box(label_key, input)


func _read_config() -> Dictionary:
	var config: Dictionary = _draft.duplicate(true)
	if _fields.has("ticker"):
		var ticker_select: OptionButton = _fields["ticker"]
		config["ticker"] = ticker_select.get_item_text(ticker_select.selected)
	if _fields.has("initialCash"):
		var cash_select: OptionButton = _fields["initialCash"]
		config["initialCash"] = SmaQuant.CASH_OPTIONS[cash_select.selected]
	if _fields.has("commission"):
		config["commission"] = (_fields["commission"] as SpinBox).value
	var params: Dictionary = config.get("params", {}).duplicate(true)
	for key in _fields.keys():
		if String(key).begins_with("param:"):
			params[String(key).substr(6)] = (_fields[key] as SpinBox).value
	config["params"] = params
	if _fields.has("factor"):
		var factor_select: OptionButton = _fields["factor"]
		config["factor"] = SmaQuant.FACTOR_OPTIONS[factor_select.selected]
	if _fields.has("objective"):
		var objective_select: OptionButton = _fields["objective"]
		config["objective"] = SmaQuant.OBJECTIVES[objective_select.selected]
	if _fields.has("mlModel"):
		var model_select: OptionButton = _fields["mlModel"]
		config["mlModel"] = SmaQuant.ML_MODELS[model_select.selected]
	if _fields.has("mlAutoTune"):
		config["mlAutoTune"] = (_fields["mlAutoTune"] as OptionButton).selected == 1
	for key in ["factorLookback", "splitPct", "mlLookback", "mlHorizon", "mlTopN", "mlTestPct"]:
		if _fields.has(key):
			config[key] = int((_fields[key] as SpinBox).value)
	config["mode"] = _mode
	_draft = SmaQuant.normalize_config(config)
	game.set_quant_config(_draft)
	return _draft


func _run() -> void:
	var config := _read_config()
	match _mode:
		"backtest":
			_result = game.quant_backtest(config)
			_factor_result = game.quant_factor_research(String(config["factor"]),
				int(config["factorLookback"]))
		"optimize":
			_result = game.quant_optimize(config)
		"regression":
			_result = game.quant_regression(int(config["mlLookback"]), int(config["mlHorizon"]))
		"ml":
			_result = game.quant_ml(config)
	_result_mode = _mode
	refresh()


func _render_result() -> void:
	if _result.is_empty() and _mode == "backtest":
		var config := _read_config()
		_result = game.quant_backtest(config)
		_factor_result = game.quant_factor_research(String(config["factor"]),
			int(config["factorLookback"]))
		_result_mode = _mode
	if _result.is_empty():
		return
	if _mode != _result_mode:
		return
	if not bool(_result.get("ok", false)):
		var card := SmaKit.card(12)
		var box := SmaKit.vbox(3)
		card.add_child(box)
		box.add_child(SmaKit.label(I18n.t("quant.resultTitle"), 14))
		box.add_child(SmaKit.muted(I18n.t(String(_result.get("error",
			"quant.error.history")), {"min": SmaQuant.MIN_BARS}), 12))
		_body.add_child(card)
		return
	if _mode == "backtest":
		_render_backtest()
	elif _mode == "optimize":
		_render_optimize()
	elif _mode == "regression":
		_render_regression()
	else:
		_render_ml()


func _render_backtest() -> void:
	var metrics: Dictionary = _result["metrics"]
	var grid := _stat_grid([
		["quant.stats.totalReturn", SmaFormat.pct(float(metrics["totalReturnPct"]), 2),
			I18n.t("quant.stats.benchmark", {
				"value": SmaFormat.pct(float(metrics["benchmarkReturnPct"]), 2)}),
			float(metrics["totalReturnPct"])],
		["quant.stats.cagr", SmaFormat.pct(float(metrics["cagrPct"]), 2),
			I18n.t("quant.stats.excess", {
				"value": SmaFormat.pct(float(metrics["excessReturnPct"]), 2)}),
			float(metrics["cagrPct"])],
		["quant.stats.maxDrawdown", SmaFormat.pct_plain(float(metrics["maxDrawdownPct"]), 2),
			I18n.t("quant.stats.finalEquity", {
				"value": SmaFormat.money(float(metrics["finalEquity"]))}),
			-float(metrics["maxDrawdownPct"])],
		["quant.stats.sharpe", SmaFormat.num(float(metrics["sharpe"]), 2),
			I18n.t("quant.stats.volatility", {
				"value": SmaFormat.pct_plain(float(metrics["volatilityPct"]), 1)}), 0.0],
		["quant.stats.winRate", SmaFormat.pct_plain(float(metrics["winRatePct"]), 1),
			I18n.t("quant.stats.trades", {"count": int(metrics["trades"])}), 0.0],
		["quant.stats.exposure", SmaFormat.pct_plain(float(metrics["exposurePct"]), 1),
			I18n.t("quant.stats.openPosition") if bool(metrics["openPosition"])
				else I18n.t("quant.stats.flat"), 0.0],
	])
	_body.add_child(grid)
	_add_chart(_result["equityCurve"], "quant.chartTitle", "quant.chartNote")
	_render_trades()
	if not _factor_result.is_empty():
		_render_factor()


func _stat_grid(specs: Array) -> GridContainer:
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	for spec in specs:
		var card := SmaKit.card(10)
		var box := SmaKit.vbox(2)
		card.add_child(box)
		box.add_child(SmaKit.caption(I18n.t(String(spec[0]))))
		box.add_child(SmaKit.label(String(spec[1]), 15, SmaKit.value_color(float(spec[3]))
			if float(spec[3]) != 0.0 else SmaUiTheme.TEXT))
		box.add_child(SmaKit.muted(String(spec[2]), 10))
		grid.add_child(card)
	return grid


func _add_chart(points: Array, title_key: String, note_key: String) -> void:
	if points.is_empty():
		return
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t(title_key), 14))
	var values: Array = []
	for point in points:
		values.append(float(point.get("equity", point.get("top", 0.0))))
	var chart := SmaLineChart.new()
	chart.custom_minimum_size.y = 200
	box.add_child(chart)
	var first := String(points[0].get("day", ""))
	var last := String(points[-1].get("day", ""))
	chart.set_series(values, SmaUiTheme.ACCENT, "money", first, last)
	box.add_child(SmaKit.muted(I18n.t(note_key), 10))
	_body.add_child(card)


func _render_trades() -> void:
	var trades: Array = _result["trades"]
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("quant.tradesTitle"), 14))
	box.add_child(SmaKit.muted(I18n.t("quant.tradesSubtitle", {
		"count": trades.size()}), 11))
	if trades.is_empty():
		box.add_child(SmaKit.muted(I18n.t("quant.tradesEmpty"), 12))
	else:
		box.add_child(SmaKit.header_row(
			["quant.trade.entry", "quant.trade.exit", "quant.trade.qty",
				"quant.trade.pnl", "quant.trade.return", "quant.trade.bars"],
			[1.5, 1.5, 0.8, 1.0, 1.0, 0.7],
			[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_LEFT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))
		var rows: Array = trades.slice(maxi(0, trades.size() - 10))
		rows.reverse()
		for trade in rows:
			var pnl := float(trade["pnl"])
			var return_pct := float(trade["returnPct"])
			box.add_child(SmaKit.data_row([
				SmaFormat.money(float(trade["entryPrice"])),
				I18n.t("quant.trade.stillOpen") if bool(trade.get("open", false))
					else SmaFormat.money(float(trade["exitPrice"])),
				SmaFormat.num(float(trade["qty"]), 0),
				SmaFormat.signed_money(pnl), SmaFormat.pct(return_pct, 2),
				SmaFormat.num(float(trade["barsHeld"]), 0),
			], [1.5, 1.5, 0.8, 1.0, 1.0, 0.7],
			[SmaUiTheme.TEXT, SmaUiTheme.TEXT, SmaUiTheme.TEXT,
				SmaKit.value_color(pnl), SmaKit.value_color(return_pct), SmaUiTheme.MUTED],
			[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_LEFT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))
	_body.add_child(card)


func _render_factor() -> void:
	var rows: Array = _factor_result.get("rows", [])
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("quant.factorTitle"), 14))
	box.add_child(SmaKit.muted(I18n.t("quant.factorSubtitle", {
		"count": int(_factor_result.get("count", 0)),
		"days": int(_factor_result.get("lookback", 0)),
	}), 11))
	box.add_child(SmaKit.header_row(
		["quant.factor.ticker", "quant.factor.sector", "quant.factor.metric"],
		[1.2, 1.2, 0.8],
		[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT]))
	for row in rows.slice(0, 8):
		var metric := float(row["metric"])
		var metric_text := SmaFormat.num(metric, 1) + "×" \
			if String(_factor_result["factor"]) == "value" else SmaFormat.pct(metric, 1)
		box.add_child(SmaKit.data_row([
			"%d · %s" % [int(row["rank"]), String(row["ticker"])],
			SmaKit.sector_label(String(row["sector"])), metric_text,
		], [1.2, 1.2, 0.8], [SmaUiTheme.TEXT, SmaUiTheme.MUTED, SmaUiTheme.TEXT],
		[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT]))
	_body.add_child(card)


func _render_optimize() -> void:
	var best: Dictionary = _result["best"]
	var in_metrics: Dictionary = best["inSample"]
	var out_metrics: Dictionary = _result.get("outSample", {}).get("metrics", {})
	var baseline: Dictionary = _result.get("baselineOut", {}).get("metrics", {})
	var grid := _stat_grid([
		["quant.opt.inSampleReturn", SmaFormat.pct(float(in_metrics["totalReturnPct"]), 2),
			I18n.t("quant.opt.inSharpe", {"value": SmaFormat.num(float(in_metrics["sharpe"]), 2)}),
			float(in_metrics["totalReturnPct"])],
		["quant.opt.outSampleReturn", SmaFormat.pct(float(out_metrics.get("totalReturnPct", 0.0)), 2)
			if not out_metrics.is_empty() else "—",
			I18n.t("quant.opt.outSharpe", {"value": SmaFormat.num(float(out_metrics.get("sharpe", 0.0)), 2)})
			if not out_metrics.is_empty() else "", float(out_metrics.get("totalReturnPct", 0.0))],
		["quant.opt.outDrawdown", SmaFormat.pct_plain(float(out_metrics.get("maxDrawdownPct", 0.0)), 2)
			if not out_metrics.is_empty() else "—",
			I18n.t("quant.opt.split", {"value": int(_result["splitPct"])}), 0.0],
		["quant.opt.baseline", SmaFormat.pct(float(baseline.get("totalReturnPct", 0.0)), 2)
			if not baseline.is_empty() else "—",
			I18n.t("quant.opt.pickCount", {"count": int(_result["comboCount"])}),
			float(baseline.get("totalReturnPct", 0.0))],
	])
	_body.add_child(grid)
	var overfit := bool(_result.get("overfitRisk", false))
	_body.add_child(SmaKit.label(I18n.t("quant.opt.overfitWarning" if overfit
		else "quant.opt.overfitClear"), 11,
		SmaUiTheme.WARNING if overfit else SmaUiTheme.POSITIVE))
	var params_card := SmaKit.card(12)
	var params_box := SmaKit.vbox(4)
	params_card.add_child(params_box)
	params_box.add_child(SmaKit.label(I18n.t("quant.opt.bestTitle"), 14))
	for key in best["params"].keys():
		params_box.add_child(_kv(String(key), SmaFormat.num(float(best["params"][key]), 0)))
	_body.add_child(params_card)
	var candidates: Array = _result["candidates"]
	var table_card := SmaKit.card(12)
	var table_box := SmaKit.vbox(4)
	table_card.add_child(table_box)
	table_box.add_child(SmaKit.label(I18n.t("quant.opt.tableTitle"), 14))
	table_box.add_child(SmaKit.header_row(
		["quant.opt.params", "quant.opt.inReturn", "quant.stats.sharpe", "quant.opt.score"],
		[2.0, 1.0, 0.8, 0.8],
		[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT,
			HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))
	for candidate in candidates:
		var parts: Array = []
		for key in candidate["params"].keys():
			parts.append("%s %s" % [key, SmaFormat.num(float(candidate["params"][key]), 0)])
		table_box.add_child(SmaKit.data_row([
			" · ".join(parts), SmaFormat.pct(float(candidate["inSample"]["totalReturnPct"]), 2),
			SmaFormat.num(float(candidate["inSample"]["sharpe"]), 2),
			SmaFormat.num(float(candidate["score"]), 2),
		], [2.0, 1.0, 0.8, 0.8]))
	_body.add_child(table_card)


func _kv(label: String, value: String) -> HBoxContainer:
	var row := SmaKit.hbox(8)
	row.add_child(SmaKit.muted(label, 11))
	row.add_child(SmaKit.hspacer())
	row.add_child(SmaKit.label(value, 11))
	return row


func _render_regression() -> void:
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 8)
	for spec in [
		["quant.reg.samples", SmaFormat.num(float(_result["samples"]), 0),
			I18n.t("quant.reg.dates", {"count": int(_result["dates"])})],
		["quant.reg.r2", SmaFormat.num(float(_result["r2"]), 3),
			I18n.t("quant.reg.intercept", {"value": SmaFormat.num(float(_result["intercept"]), 3)})],
		["quant.reg.lookback", SmaFormat.num(float(_result["lookback"]), 0),
			I18n.t("quant.reg.horizon", {"value": int(_result["horizon"])})],
	]:
		var card := SmaKit.card(10)
		var box := SmaKit.vbox(1)
		card.add_child(box)
		box.add_child(SmaKit.caption(I18n.t(String(spec[0]))))
		box.add_child(SmaKit.label(String(spec[1]), 15))
		box.add_child(SmaKit.muted(String(spec[2]), 10))
		grid.add_child(card)
	_body.add_child(grid)
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("quant.reg.tableTitle"), 14))
	box.add_child(SmaKit.header_row(["quant.reg.factor", "quant.reg.coefficient", "quant.reg.ic"],
		[1.5, 1.0, 1.0],
		[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))
	for factor in _result["factors"]:
		var coefficient := float(factor["coefficient"])
		var information := float(factor["ic"])
		box.add_child(SmaKit.data_row([
			I18n.t("quant.factor.%s" % String(factor["id"])),
			SmaFormat.num(coefficient, 3), SmaFormat.num(information, 3),
		], [1.5, 1.0, 1.0],
		[SmaUiTheme.TEXT, SmaKit.value_color(coefficient), SmaKit.value_color(information)],
		[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))
	box.add_child(SmaKit.muted(I18n.t("quant.reg.disclaimer"), 10))
	_body.add_child(card)


func _render_ml() -> void:
	var portfolio: Dictionary = _result["portfolio"]
	var model: Dictionary = _result["model"]
	var grid := _stat_grid([
		["quant.ml.topReturn", SmaFormat.pct(float(portfolio["totalReturnPct"]), 2),
			I18n.t("quant.ml.benchmark", {
				"value": SmaFormat.pct(float(portfolio["benchmarkReturnPct"]), 2)}),
			float(portfolio["totalReturnPct"])],
		["quant.ml.excess", SmaFormat.pct(float(portfolio["excessReturnPct"]), 2),
			I18n.t("quant.ml.hitRate", {
				"value": SmaFormat.pct_plain(float(portfolio["hitRatePct"]), 1)}),
			float(portfolio["excessReturnPct"])],
		["quant.ml.testAccuracy", SmaFormat.pct_plain(float(model["testAccuracy"]) * 100.0, 1),
			I18n.t("quant.ml.trainAccuracy", {
				"value": SmaFormat.pct_plain(float(model["accuracy"]) * 100.0, 1)}), 0.0],
		["quant.ml.rebalances", SmaFormat.num(float(portfolio["rebalances"]), 0),
			I18n.t("quant.ml.avgExcess", {
				"value": SmaFormat.pct(float(portfolio["avgExcessPct"]), 2)}), 0.0],
	])
	_body.add_child(grid)
	var overfit := bool(_result.get("overfitRisk", false))
	_body.add_child(SmaKit.label(I18n.t("quant.ml.overfitWarning" if overfit
		else "quant.ml.overfitClear"), 11,
		SmaUiTheme.WARNING if overfit else SmaUiTheme.POSITIVE))
	var model_card := SmaKit.card(12)
	var model_box := SmaKit.vbox(4)
	model_card.add_child(model_box)
	model_box.add_child(SmaKit.label(I18n.t("quant.ml.modelTitle"), 14))
	model_box.add_child(SmaKit.muted(I18n.t("quant.ml.modelSubtitle", {
		"train": int(_result["trainSamples"]), "test": int(_result["testSamples"]),
	}), 11))
	model_box.add_child(_kv(I18n.t("quant.ml.modelType"),
		I18n.t("quant.ml.model%s" % String(model["type"]).capitalize())))
	model_box.add_child(_kv(I18n.t("quant.ml.hiddenUnits"),
		"%d / %d" % [int(model["hidden1"]), int(model["hidden2"])]))
	for factor in SmaQuant.ML_FACTORS:
		model_box.add_child(_kv(I18n.t("quant.factor.%s" % factor),
			SmaFormat.num(float(model["featureImportance"].get(factor, 0.0)), 3)))
	model_box.add_child(_kv(I18n.t("quant.ml.splitDate"), String(_result["splitDate"])))
	_body.add_child(model_card)
	var picks_card := SmaKit.card(12)
	var picks_box := SmaKit.vbox(4)
	picks_card.add_child(picks_box)
	picks_box.add_child(SmaKit.label(I18n.t("quant.ml.picksTitle"), 14))
	picks_box.add_child(SmaKit.header_row(
		["quant.ml.date", "quant.ml.picks", "quant.ml.pickReturn",
			"quant.ml.universeReturn", "quant.ml.excess"],
		[1.0, 2.2, 1.0, 1.0, 1.0],
		[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT,
			HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))
	for pick in _result["picks"]:
		var excess := float(pick["excess"])
		picks_box.add_child(SmaKit.data_row([
			String(pick["date"]), " · ".join(pick["tickers"]),
			SmaFormat.pct(float(pick["topReturn"]), 2),
			SmaFormat.pct(float(pick["universeReturn"]), 2),
			SmaFormat.pct(excess, 2),
		], [1.0, 2.2, 1.0, 1.0, 1.0],
		[SmaUiTheme.TEXT, SmaUiTheme.TEXT, SmaUiTheme.TEXT, SmaUiTheme.TEXT,
			SmaKit.value_color(excess)],
		[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT,
			HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))
	_body.add_child(picks_card)
	_add_chart(_result["curve"], "quant.ml.chartTitle", "quant.ml.chartNote")
