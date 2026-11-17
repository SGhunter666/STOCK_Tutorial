## Interactive teaching demos for stage three. Each demo requires a real action
## (identify candles, compare moving averages, run a DCF) before the practice is
## recorded; opening the dialog alone never completes a unit.
class_name SmaDemoDialog
extends Control

signal closed

const SUPPORTED := ["candle", "indicators", "dcf", "macro", "allocation", "risk",
	"strategies", "shortPnl", "margin", "stopOrder", "orderBook",
	"optionPayoff", "greeks", "strategyPayoff", "futuresPnl", "hedge", "stressTest"]

var game: Node
var demo_id: String
var _body: VBoxContainer
var _footer_note: Label
var _completed := false

var _rng: SmaRng
var _candle_round := 0
var _candle_correct := 0
var _illustration: SmaCandleIllustration
var _candle_feedback: Label
var _candle_bull: Button
var _candle_bear: Button

var _closes: Array = []
var _viewed_periods := {}
var _sma_label: Label
var _indicator_feedback: Label
var _indicator_answer_five: Button
var _indicator_answer_ten: Button

var _dcf_fields := {}
var _dcf_result: Label
var _dcf_error: Label

var _macro_fields := {}
var _macro_real_rate: Label
var _macro_regime: Label
var _macro_discount: Label

var _allocation_fields := {}
var _allocation_labels := {}

var _risk_fields := {}
var _risk_labels := {}
var _risk_updating := false

var _strategy_option: OptionButton
var _strategy_labels := {}
var _strategy_tickers := {}
var _strategy_note: Label
var _strategy_used_synthetic := false

var _short_fields := {}
var _short_labels := {}

var _margin_fields := {}
var _margin_labels := {}

var _stop_fields := {}
var _stop_labels := {}
var _stop_updating := false

var _book_ticker_option: OptionButton
var _book_qty: SpinBox
var _book_rows_box: VBoxContainer
var _book_labels := {}
var _book_tickers: Array = []

var _payoff_type: OptionButton
var _payoff_fields := {}
var _payoff_labels := {}
var _payoff_chart: SmaPayoffChart

var _greeks_type: OptionButton
var _greeks_fields := {}
var _greeks_labels := {}

var _payoff_strategy_ticker: OptionButton
var _payoff_strategy_preset: OptionButton
var _payoff_strategy_expiry: OptionButton
var _payoff_strategy_qty: SpinBox
var _payoff_strategy_labels := {}
var _payoff_strategy_chart: SmaPayoffChart

var _futures_side: OptionButton
var _futures_fields := {}
var _futures_labels := {}

var _hedge_fields := {}
var _hedge_labels := {}

var _stress_fields := {}
var _stress_labels := {}


static func supports(target_id: String) -> bool:
	return SUPPORTED.has(target_id)


func setup(game_ref: Node, target_demo: String) -> void:
	game = game_ref
	demo_id = target_demo
	_build()
	if demo_id == "candle":
		_build_candle()
	elif demo_id == "indicators":
		_build_indicators()
	elif demo_id == "dcf":
		_build_dcf()
	elif demo_id == "macro":
		_build_macro()
	elif demo_id == "allocation":
		_build_allocation()
	elif demo_id == "risk":
		_build_risk()
	elif demo_id == "strategies":
		_build_strategies()
	elif demo_id == "shortPnl":
		_build_short_pnl()
	elif demo_id == "margin":
		_build_margin()
	elif demo_id == "stopOrder":
		_build_stop_order()
	elif demo_id == "orderBook":
		_build_order_book()
	elif demo_id == "optionPayoff":
		_build_option_payoff()
	elif demo_id == "greeks":
		_build_greeks()
	elif demo_id == "strategyPayoff":
		_build_strategy_payoff()
	elif demo_id == "futuresPnl":
		_build_futures_pnl()
	elif demo_id == "hedge":
		_build_hedge()
	elif demo_id == "stressTest":
		_build_stress_test()
	else:
		_body.add_child(SmaKit.muted(I18n.t("academy.demoUnavailable")))


func _build() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	z_index = 57
	var dim := ColorRect.new()
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.color = Color(0.02, 0.04, 0.07, 0.84)
	add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)
	var panel := SmaKit.card(20)
	panel.custom_minimum_size = Vector2(820, 0)
	center.add_child(panel)
	var root := SmaKit.vbox(10)
	panel.add_child(root)
	var header := SmaKit.hbox(10)
	header.add_child(SmaKit.caption("LAB"))
	header.add_child(SmaKit.label(I18n.t("demo.%s.title" % demo_id), 20))
	header.add_child(SmaKit.hspacer())
	header.add_child(SmaKit.button(I18n.t("common.close"), _close))
	root.add_child(header)
	root.add_child(SmaKit.muted(I18n.t("demo.%s.desc" % demo_id), 12))
	root.add_child(SmaKit.separator())
	var scroll := SmaKit.scroll(460 if demo_id == "optionPayoff" else 360)
	_body = SmaKit.vbox(10)
	scroll.add_child(_body)
	root.add_child(scroll)
	_footer_note = SmaKit.caption(I18n.t("demo.lab.note"))
	root.add_child(_footer_note)


func _complete() -> void:
	if _completed:
		return
	_completed = true
	_footer_note.text = I18n.t("demo.lab.completed")
	_footer_note.add_theme_color_override("font_color", SmaUiTheme.POSITIVE)
	game.academy_complete_demo(demo_id)


# ---------------------------------------------------------------------------
# Candlestick anatomy
# ---------------------------------------------------------------------------

func _build_candle() -> void:
	_rng = SmaRng.new("demo:candle")
	_body.add_child(SmaKit.muted(I18n.t("demo.lab.candle.prompt"), 13))
	_illustration = SmaCandleIllustration.new()
	_body.add_child(_illustration)
	var buttons := SmaKit.hbox(8)
	_candle_bull = SmaKit.button(I18n.t("demo.lab.candle.bull"), _answer_candle.bind("bull"), true)
	_candle_bear = SmaKit.button(I18n.t("demo.lab.candle.bear"), _answer_candle.bind("bear"))
	_candle_bull.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_candle_bear.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	buttons.add_child(_candle_bull)
	buttons.add_child(_candle_bear)
	_body.add_child(buttons)
	_candle_feedback = SmaKit.muted("")
	_body.add_child(_candle_feedback)
	_next_candle()


func _next_candle() -> void:
	var open_price := SmaFormat.round_to(_rng.range_float(20.0, 80.0), 2)
	var close_price := SmaFormat.round_to(open_price + _rng.range_float(-4.0, 4.0), 2)
	if absf(close_price - open_price) < 0.05:
		close_price += 0.25
	var high := SmaFormat.round_to(maxf(open_price, close_price) + _rng.range_float(0.2, 3.0), 2)
	var low := SmaFormat.round_to(minf(open_price, close_price) - _rng.range_float(0.2, 3.0), 2)
	_illustration.set_data(open_price, high, low, close_price)
	_candle_feedback.text = I18n.t("demo.lab.candle.round", {"round": _candle_round + 1, "total": 3})
	_candle_feedback.add_theme_color_override("font_color", SmaUiTheme.MUTED)
	_candle_bull.disabled = false
	_candle_bear.disabled = false


func _answer_candle(kind: String) -> void:
	var bull := close_price_from_illustration() >= open_price_from_illustration()
	var correct := (kind == "bull" and bull) or (kind == "bear" and not bull)
	if not correct:
		_candle_feedback.text = I18n.t("demo.lab.candle.wrong")
		_candle_feedback.add_theme_color_override("font_color", SmaUiTheme.WARNING)
		return
	_candle_correct += 1
	_candle_round += 1
	_candle_feedback.text = I18n.t("demo.lab.candle.correct")
	_candle_feedback.add_theme_color_override("font_color", SmaUiTheme.POSITIVE)
	if _candle_correct >= 3:
		_candle_bull.disabled = true
		_candle_bear.disabled = true
		_complete()
	else:
		_next_candle()


func open_price_from_illustration() -> float:
	return _illustration.open_price


func close_price_from_illustration() -> float:
	return _illustration.close_price


# ---------------------------------------------------------------------------
# Moving averages
# ---------------------------------------------------------------------------

func _build_indicators() -> void:
	_rng = SmaRng.new("demo:indicators")
	var price := _rng.range_float(20.0, 60.0)
	for index in 12:
		price += _rng.range_float(-2.5, 3.0)
		_closes.append(SmaFormat.round_to(price, 2))
	_body.add_child(SmaKit.muted(I18n.t("demo.lab.indicators.prompt"), 13))
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 18)
	grid.add_theme_constant_override("v_separation", 5)
	grid.add_child(SmaKit.caption(I18n.t("demo.lab.indicators.index")))
	grid.add_child(SmaKit.caption(I18n.t("demo.lab.indicators.price")))
	grid.add_child(SmaKit.caption(I18n.t("demo.lab.indicators.index")))
	grid.add_child(SmaKit.caption(I18n.t("demo.lab.indicators.price")))
	for index in 6:
		grid.add_child(SmaKit.caption(str(index + 1)))
		grid.add_child(SmaKit.label(SmaFormat.num(float(_closes[index]), 2), 12))
		grid.add_child(SmaKit.caption(str(index + 7)))
		grid.add_child(SmaKit.label(SmaFormat.num(float(_closes[index + 6]), 2), 12))
	_body.add_child(grid)
	var period_row := SmaKit.hbox(8)
	period_row.add_child(SmaKit.caption(I18n.t("demo.lab.indicators.period")))
	period_row.add_child(SmaKit.button(I18n.t("demo.lab.indicators.viewFive"),
		_view_period.bind(5)))
	period_row.add_child(SmaKit.button(I18n.t("demo.lab.indicators.viewTen"),
		_view_period.bind(10)))
	period_row.add_child(SmaKit.hspacer())
	_sma_label = SmaKit.label("", 14)
	period_row.add_child(_sma_label)
	_body.add_child(period_row)
	var question := SmaKit.hbox(8)
	question.add_child(SmaKit.muted(I18n.t("demo.lab.indicators.question"), 13))
	question.add_child(SmaKit.hspacer())
	_indicator_answer_five = SmaKit.button(I18n.t("demo.lab.indicators.answerFive"),
		_answer_indicator.bind(5))
	_indicator_answer_ten = SmaKit.button(I18n.t("demo.lab.indicators.answerTen"),
		_answer_indicator.bind(10), true)
	_indicator_answer_five.disabled = true
	_indicator_answer_ten.disabled = true
	question.add_child(_indicator_answer_five)
	question.add_child(_indicator_answer_ten)
	_body.add_child(question)
	_indicator_feedback = SmaKit.muted("")
	_body.add_child(_indicator_feedback)


func _view_period(period: int) -> void:
	var slice: Array = _closes.slice(_closes.size() - period)
	var sum := 0.0
	for value in slice:
		sum += float(value)
	var average := sum / float(slice.size())
	_sma_label.text = "SMA %d = %s" % [period, SmaFormat.num(average, 2)]
	_viewed_periods[period] = true
	if _viewed_periods.has(5) and _viewed_periods.has(10):
		_indicator_answer_five.disabled = false
		_indicator_answer_ten.disabled = false


func _answer_indicator(period: int) -> void:
	if not (_viewed_periods.has(5) and _viewed_periods.has(10)):
		_indicator_feedback.text = I18n.t("demo.lab.indicators.viewBoth")
		return
	if period != 10:
		_indicator_feedback.text = I18n.t("demo.lab.indicators.wrong")
		_indicator_feedback.add_theme_color_override("font_color", SmaUiTheme.WARNING)
		return
	_indicator_feedback.text = I18n.t("demo.lab.indicators.correct")
	_indicator_feedback.add_theme_color_override("font_color", SmaUiTheme.POSITIVE)
	_indicator_answer_five.disabled = true
	_indicator_answer_ten.disabled = true
	_complete()


# ---------------------------------------------------------------------------
# DCF
# ---------------------------------------------------------------------------

func _build_dcf() -> void:
	_body.add_child(SmaKit.muted(I18n.t("demo.lab.dcf.prompt"), 13))
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 16)
	grid.add_theme_constant_override("v_separation", 8)
	for spec in [
		["fcf", "demo.lab.dcf.fcf", 1000.0, 10.0, 100000.0, 100.0],
		["growth", "demo.lab.dcf.growth", 8.0, -20.0, 40.0, 0.5],
		["discount", "demo.lab.dcf.discount", 10.0, 1.0, 40.0, 0.5],
		["terminal", "demo.lab.dcf.terminal", 3.0, -5.0, 10.0, 0.5],
		["years", "demo.lab.dcf.years", 5.0, 1.0, 10.0, 1.0],
	]:
		grid.add_child(SmaKit.caption(I18n.t(String(spec[1]))))
		var spin := SpinBox.new()
		spin.min_value = float(spec[3])
		spin.max_value = float(spec[4])
		spin.step = float(spec[5])
		spin.value = float(spec[2])
		spin.custom_minimum_size.x = 160
		grid.add_child(spin)
		_dcf_fields[String(spec[0])] = spin
	_body.add_child(grid)
	var run := SmaKit.button(I18n.t("demo.lab.dcf.calculate"), _calculate_dcf, true)
	run.custom_minimum_size.x = 180
	_body.add_child(run)
	_dcf_result = SmaKit.label("—", 20, SmaUiTheme.ACCENT)
	_body.add_child(_dcf_result)
	_dcf_error = SmaKit.muted("")
	_body.add_child(_dcf_error)


func _calculate_dcf() -> void:
	var fcf := float(_dcf_fields["fcf"].value)
	var growth := float(_dcf_fields["growth"].value) / 100.0
	var discount := float(_dcf_fields["discount"].value) / 100.0
	var terminal_growth := float(_dcf_fields["terminal"].value) / 100.0
	var years := int(_dcf_fields["years"].value)
	if discount <= terminal_growth:
		_dcf_error.text = I18n.t("demo.lab.dcf.error")
		_dcf_error.add_theme_color_override("font_color", SmaUiTheme.NEGATIVE)
		return
	_dcf_error.text = ""
	var projected := fcf
	var present_value := 0.0
	for year in range(1, years + 1):
		projected *= 1.0 + growth
		present_value += projected / pow(1.0 + discount, year)
	var terminal_value := projected * (1.0 + terminal_growth) / (discount - terminal_growth)
	present_value += terminal_value / pow(1.0 + discount, years)
	_dcf_result.text = "%s %s" % [I18n.t("demo.lab.dcf.intrinsic"),
		"$" + SmaFormat.num(present_value, 0) + "M"]
	_complete()


func _close() -> void:
	closed.emit()
	queue_free()


# ---------------------------------------------------------------------------
# Shared input/result helpers for the stage-four labs
# ---------------------------------------------------------------------------

func _spin_grid(specs: Array) -> Dictionary:
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 16)
	grid.add_theme_constant_override("v_separation", 8)
	var fields := {}
	for spec in specs:
		grid.add_child(SmaKit.caption(I18n.t(String(spec[1]))))
		var spin := SpinBox.new()
		spin.min_value = float(spec[3])
		spin.max_value = float(spec[4])
		spin.step = float(spec[5])
		spin.value = float(spec[2])
		spin.custom_minimum_size.x = 170
		grid.add_child(spin)
		fields[String(spec[0])] = spin
	return {"grid": grid, "fields": fields}


func _result_row(box: VBoxContainer, label_key: String) -> Label:
	var row := SmaKit.hbox(8)
	row.add_child(SmaKit.caption(I18n.t(label_key)))
	row.add_child(SmaKit.hspacer())
	var value := SmaKit.label("—", 14)
	row.add_child(value)
	box.add_child(row)
	return value


func _note(key: String) -> Label:
	var label := SmaKit.muted(I18n.t(key), 11)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label


# ---------------------------------------------------------------------------
# Macro scenario
# ---------------------------------------------------------------------------

func _build_macro() -> void:
	var base := _macro_snapshot()
	var built := _spin_grid([
		["rate", "demo.macro.rate", base["policyRate"], 0.0, 12.0, 0.1],
		["inflation", "demo.macro.inflation", base["inflation"], -2.0, 12.0, 0.1],
		["growth", "demo.macro.growth", base["growth"], -4.0, 8.0, 0.1],
	])
	_macro_fields = built["fields"]
	_body.add_child(built["grid"])
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(6)
	card.add_child(box)
	_macro_real_rate = _result_row(box, "demo.macro.realRate")
	_macro_regime = _result_row(box, "demo.macro.regime")
	_macro_discount = _result_row(box, "demo.macro.discount")
	_body.add_child(card)
	_body.add_child(_note("demo.macro.note"))
	for key in ["rate", "inflation", "growth"]:
		_macro_fields[key].value_changed.connect(_on_macro_changed)
	_update_macro()


func _macro_snapshot() -> Dictionary:
	var day := 0
	var seed_text := "sim-exchange-v1"
	if game != null:
		if game.has_method("get_day"):
			day = int(game.get_day())
		if game.exchange != null:
			seed_text = String(game.exchange.state.get("seed", seed_text))
	var phase := _seed_phase(seed_text)
	var policy_rate := _round1(2.6 + 1.6 * _wave(day, 240.0, phase) \
		+ 0.7 * _wave(day, 60.0, phase + 1.0))
	var inflation := _round1(2.3 + 1.1 * _wave(day, 150.0, phase + 0.6) \
		+ 0.4 * _wave(day, 45.0, phase))
	var growth := _round1(2.1 + 1.3 * _wave(day, 300.0, phase + 1.2))
	return {"policyRate": policy_rate, "inflation": inflation, "growth": growth}


func _seed_phase(text: String) -> float:
	var hash := 0
	for index in text.length():
		hash = (hash * 31 + text.unicode_at(index)) % 1000
	return float(hash) / 1000.0 * TAU


func _wave(day: int, period: float, phase: float) -> float:
	return sin(float(day) / period * TAU + phase)


func _round1(value: float) -> float:
	return roundf(value * 10.0) / 10.0


func _on_macro_changed(_value: float) -> void:
	_update_macro()
	_complete()


func _update_macro() -> void:
	var rate := float(_macro_fields["rate"].value)
	var inflation := float(_macro_fields["inflation"].value)
	var growth := float(_macro_fields["growth"].value)
	var real_rate := _round1(rate - inflation)
	_macro_real_rate.text = SmaFormat.num(real_rate, 1) + "%"
	_macro_discount.text = SmaFormat.num(rate + 5.0, 1) + "%"
	var regime := "neutral"
	if growth >= 2.6:
		regime = "expansion"
	elif growth <= 1.2:
		regime = "slowdown"
	elif inflation >= 3.2:
		regime = "inflation"
	_macro_regime.text = I18n.t("macro.regime.%s" % regime)


# ---------------------------------------------------------------------------
# Asset allocation
# ---------------------------------------------------------------------------

func _build_allocation() -> void:
	var built := _spin_grid([
		["stocks", "demo.allocation.stocks", 60.0, 0.0, 100.0, 5.0],
		["bonds", "demo.allocation.bonds", 30.0, 0.0, 100.0, 5.0],
	])
	_allocation_fields = built["fields"]
	_body.add_child(built["grid"])
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	_allocation_labels["stocks"] = _result_row(box, "demo.allocation.stockWeight")
	_allocation_labels["bonds"] = _result_row(box, "demo.allocation.bondWeight")
	_allocation_labels["cash"] = _result_row(box, "demo.allocation.cashWeight")
	_allocation_labels["expected"] = _result_row(box, "demo.allocation.expected")
	_allocation_labels["volatility"] = _result_row(box, "demo.allocation.volatility")
	_body.add_child(card)
	_body.add_child(_note("demo.allocation.note"))
	for key in ["stocks", "bonds"]:
		_allocation_fields[key].value_changed.connect(_on_allocation_changed)
	_update_allocation()


func _on_allocation_changed(_value: float) -> void:
	_update_allocation()
	_complete()


func _update_allocation() -> void:
	var stock := float(_allocation_fields["stocks"].value)
	var bond := float(_allocation_fields["bonds"].value)
	var cash := maxf(0.0, 100.0 - stock - bond)
	var total := stock + bond + cash
	var stock_weight := stock / total if total > 0.0 else 0.0
	var bond_weight := bond / total if total > 0.0 else 0.0
	var cash_weight := cash / total if total > 0.0 else 0.0
	_allocation_labels["stocks"].text = SmaFormat.num(stock_weight * 100.0, 0) + "%"
	_allocation_labels["bonds"].text = SmaFormat.num(bond_weight * 100.0, 0) + "%"
	_allocation_labels["cash"].text = SmaFormat.num(cash_weight * 100.0, 0) + "%"
	var expected := stock_weight * 7.0 + bond_weight * 3.5 + cash_weight * 1.5
	var volatility := stock_weight * 16.0 + bond_weight * 6.0 + cash_weight * 0.5
	_allocation_labels["expected"].text = SmaFormat.num(expected, 1) + "%"
	_allocation_labels["volatility"].text = SmaFormat.num(volatility, 1) + "%"


# ---------------------------------------------------------------------------
# Position sizing
# ---------------------------------------------------------------------------

func _build_risk() -> void:
	var built := _spin_grid([
		["account", "demo.risk.account", 10000.0, 100.0, 1000000.0, 100.0],
		["risk", "demo.risk.riskPct", 1.0, 0.1, 10.0, 0.1],
		["entry", "demo.risk.entry", 40.0, 1.0, 1000000.0, 0.5],
		["stop", "demo.risk.stop", 36.0, 0.5, 1000000.0, 0.5],
	])
	_risk_fields = built["fields"]
	_body.add_child(built["grid"])
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	_risk_labels["amount"] = _result_row(box, "demo.risk.riskAmount")
	_risk_labels["perShare"] = _result_row(box, "demo.risk.perShare")
	_risk_labels["shares"] = _result_row(box, "demo.risk.shares")
	_risk_labels["position"] = _result_row(box, "demo.risk.position")
	_risk_labels["exposure"] = _result_row(box, "demo.risk.exposure")
	_body.add_child(card)
	_body.add_child(_note("demo.risk.note"))
	for key in ["account", "risk", "entry", "stop"]:
		_risk_fields[key].value_changed.connect(_on_risk_changed)
	_update_risk()


func _on_risk_changed(_value: float) -> void:
	if _risk_updating:
		return
	_risk_updating = true
	var entry := float(_risk_fields["entry"].value)
	var stop := float(_risk_fields["stop"].value)
	if stop >= entry:
		_risk_fields["stop"].set_value_no_signal(maxf(0.5, entry * 0.9))
	_risk_updating = false
	_update_risk()
	_complete()


func _update_risk() -> void:
	var account := float(_risk_fields["account"].value)
	var risk_pct := float(_risk_fields["risk"].value)
	var entry := float(_risk_fields["entry"].value)
	var stop := float(_risk_fields["stop"].value)
	var risk_amount := account * risk_pct / 100.0
	var per_share := maxf(0.01, entry - stop)
	var shares := floorf(maxf(0.0, risk_amount / per_share))
	var position := shares * entry
	var exposure := position / account * 100.0 if account > 0.0 else 0.0
	_risk_labels["amount"].text = SmaFormat.money(risk_amount)
	_risk_labels["perShare"].text = SmaFormat.money(per_share)
	_risk_labels["shares"].text = SmaFormat.num(shares, 0)
	_risk_labels["position"].text = SmaFormat.money(position)
	_risk_labels["exposure"].text = SmaFormat.num(exposure, 1) + "%"


# ---------------------------------------------------------------------------
# Style strategy comparison
# ---------------------------------------------------------------------------

func _build_strategies() -> void:
	_strategy_tickers.clear()
	if game != null and game.exchange != null:
		for ticker in SmaCompanyCatalog.load_companies().keys():
			var style := SmaAcademy.style_of(String(ticker))
			if style == "":
				continue
			if not _strategy_tickers.has(style):
				_strategy_tickers[style] = []
			_strategy_tickers[style].append(String(ticker))
	var row := SmaKit.hbox(10)
	row.add_child(SmaKit.label(I18n.t("demo.strategies.horizon"), 13))
	var option := OptionButton.new()
	for days in [30, 60, 90]:
		option.add_item(I18n.t("demo.strategies.sessions", {"days": days}))
		option.set_item_metadata(option.item_count - 1, days)
	option.select(1)
	option.item_selected.connect(_on_strategy_changed)
	_strategy_option = option
	row.add_child(option)
	row.add_child(SmaKit.hspacer())
	_body.add_child(row)
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	for style in ["growth", "value", "dividend", "cyclical"]:
		_strategy_labels[style] = _result_row(box, "style.%s" % style)
	_body.add_child(card)
	_strategy_note = SmaKit.caption(I18n.t("demo.strategies.synthetic"))
	_strategy_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_strategy_note.visible = false
	_body.add_child(_strategy_note)
	_body.add_child(_note("demo.strategies.note"))
	_update_strategies(60)


func _on_strategy_changed(index: int) -> void:
	_update_strategies(int(_strategy_option.get_item_metadata(index)))
	_complete()


func _update_strategies(horizon: int) -> void:
	_strategy_used_synthetic = false
	for style in _strategy_labels.keys():
		var value := _style_return(String(style), horizon)
		var label: Label = _strategy_labels[style]
		label.text = SmaFormat.pct(0.0 if absf(value) < 0.005 else value, 2)
		label.add_theme_color_override("font_color", SmaKit.value_color(value))
	if _strategy_note != null:
		_strategy_note.visible = _strategy_used_synthetic


func _style_return(style: String, horizon: int) -> float:
	var actual: Variant = _actual_style_return(style, horizon)
	if actual != null:
		return actual
	_strategy_used_synthetic = true
	return _synthetic_style_return(style, horizon)


func _actual_style_return(style: String, horizon: int) -> Variant:
	var tickers: Array = _strategy_tickers.get(style, [])
	if tickers.is_empty() or game == null or game.exchange == null:
		return null
	var paths: Array = []
	for ticker in tickers:
		var candles: Array = game.exchange.get_candles(String(ticker), "1D")
		if candles.size() < 90:
			continue
		var closes: Array = []
		for bar in candles.slice(candles.size() - horizon):
			closes.append(float(bar.get("c", 0.0)))
		if closes.is_empty() or float(closes[0]) <= 0.0:
			continue
		var base_price := float(closes[0])
		var normalized: Array = []
		for value in closes:
			normalized.append(float(value) / base_price)
		paths.append(normalized)
	if paths.is_empty():
		return null
	var last_sum := 0.0
	for path in paths:
		last_sum += float(path[path.size() - 1])
	return (last_sum / float(paths.size()) - 1.0) * 100.0


func _synthetic_style_return(style: String, horizon: int) -> float:
	var drift := 0.0003
	var vol := 0.012
	match style:
		"growth":
			drift = 0.0007
			vol = 0.019
		"value":
			drift = 0.0003
			vol = 0.011
		"dividend":
			drift = 0.0002
			vol = 0.008
		"cyclical":
			drift = 0.0004
			vol = 0.015
	var day := int(game.get_day()) if game != null and game.has_method("get_day") else 0
	var rng := SmaRng.new("demo:strategies:%s:%d" % [style, day])
	var path: Array = []
	var price := 100.0
	for index in 90:
		price *= 1.0 + drift + rng.range_float(-vol, vol)
		path.append(price)
	var window: Array = path.slice(path.size() - horizon)
	var base_price := float(window[0])
	return (float(window[-1]) / base_price - 1.0) * 100.0


# ---------------------------------------------------------------------------
# Short P&L
# ---------------------------------------------------------------------------

func _build_short_pnl() -> void:
	var built := _spin_grid([
		["entry", "demo.shortPnl.entry", 50.0, 1.0, 1000000.0, 0.5],
		["exit", "demo.shortPnl.exit", 40.0, 0.5, 1000000.0, 0.5],
		["shares", "demo.shortPnl.shares", 100.0, 1.0, 1000000.0, 1.0],
	])
	_short_fields = built["fields"]
	_body.add_child(built["grid"])
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	_short_labels["proceeds"] = _result_row(box, "demo.shortPnl.proceeds")
	_short_labels["coverCost"] = _result_row(box, "demo.shortPnl.coverCost")
	_short_labels["pnl"] = _result_row(box, "demo.shortPnl.pnl")
	_short_labels["return"] = _result_row(box, "demo.shortPnl.return")
	_short_labels["collateral"] = _result_row(box, "demo.shortPnl.collateral")
	_body.add_child(card)
	_body.add_child(_note("demo.shortPnl.note"))
	for key in ["entry", "exit", "shares"]:
		_short_fields[key].value_changed.connect(_on_short_changed)
	_update_short_pnl()


func _on_short_changed(_value: float) -> void:
	_update_short_pnl()


func _update_short_pnl() -> void:
	var entry := float(_short_fields["entry"].value)
	var exit := float(_short_fields["exit"].value)
	var shares := floorf(float(_short_fields["shares"].value))
	var proceeds := entry * shares
	var cover_cost := exit * shares
	var pnl := proceeds - cover_cost
	var return_pct := pnl / proceeds * 100.0 if proceeds > 0.0 else 0.0
	var collateral := proceeds * 0.5
	_short_labels["proceeds"].text = SmaFormat.money(proceeds)
	_short_labels["coverCost"].text = SmaFormat.money(cover_cost)
	_short_labels["pnl"].text = SmaFormat.signed_money(pnl)
	_short_labels["pnl"].add_theme_color_override("font_color", SmaKit.value_color(pnl))
	_short_labels["return"].text = SmaFormat.pct(return_pct, 2)
	_short_labels["return"].add_theme_color_override("font_color", SmaKit.value_color(return_pct))
	_short_labels["collateral"].text = SmaFormat.money(collateral)


# ---------------------------------------------------------------------------
# Margin and leverage
# ---------------------------------------------------------------------------

func _build_margin() -> void:
	var built := _spin_grid([
		["cash", "demo.margin.cash", 10000.0, 100.0, 10000000.0, 100.0],
		["price", "demo.margin.price", 50.0, 1.0, 1000000.0, 0.5],
		["shares", "demo.margin.shares", 300.0, 1.0, 1000000.0, 1.0],
	])
	_margin_fields = built["fields"]
	_body.add_child(built["grid"])
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	_margin_labels["value"] = _result_row(box, "demo.margin.value")
	_margin_labels["loan"] = _result_row(box, "demo.margin.loan")
	_margin_labels["equity"] = _result_row(box, "demo.margin.equity")
	_margin_labels["leverage"] = _result_row(box, "demo.margin.leverage")
	_margin_labels["interest"] = _result_row(box, "demo.margin.interest")
	_body.add_child(card)
	_body.add_child(_note("demo.margin.note"))
	for key in ["cash", "price", "shares"]:
		_margin_fields[key].value_changed.connect(_on_margin_changed)
	_update_margin()


func _on_margin_changed(_value: float) -> void:
	_update_margin()
	_complete()


func _update_margin() -> void:
	var cash := float(_margin_fields["cash"].value)
	var price := float(_margin_fields["price"].value)
	var shares := floorf(float(_margin_fields["shares"].value))
	var value := price * shares
	var loan := maxf(0.0, value - cash)
	var equity := value - loan
	var leverage := value / cash if cash > 0.0 else 0.0
	var interest := loan * 0.08 / 252.0
	_margin_labels["value"].text = SmaFormat.money(value)
	_margin_labels["loan"].text = SmaFormat.money(loan)
	_margin_labels["equity"].text = SmaFormat.money(equity)
	_margin_labels["leverage"].text = SmaFormat.num(leverage, 2) + "×"
	_margin_labels["interest"].text = SmaFormat.money(interest)


# ---------------------------------------------------------------------------
# Stop and trailing stop
# ---------------------------------------------------------------------------

func _build_stop_order() -> void:
	var built := _spin_grid([
		["entry", "demo.stopOrder.entry", 100.0, 1.0, 1000000.0, 0.5],
		["stop", "demo.stopOrder.stop", 92.0, 0.5, 1000000.0, 0.5],
		["trail", "demo.stopOrder.trail", 6.0, 0.5, 1000000.0, 0.5],
		["shares", "demo.stopOrder.shares", 100.0, 1.0, 1000000.0, 1.0],
	])
	_stop_fields = built["fields"]
	_body.add_child(built["grid"])
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	_stop_labels["perShare"] = _result_row(box, "demo.stopOrder.perShare")
	_stop_labels["distance"] = _result_row(box, "demo.stopOrder.distance")
	_stop_labels["risk"] = _result_row(box, "demo.stopOrder.risk")
	_stop_labels["trailing"] = _result_row(box, "demo.stopOrder.trailing")
	_body.add_child(card)
	_body.add_child(_note("demo.stopOrder.note"))
	for key in ["entry", "stop", "trail", "shares"]:
		_stop_fields[key].value_changed.connect(_on_stop_changed)
	_update_stop_order()


func _on_stop_changed(_value: float) -> void:
	if _stop_updating:
		return
	_stop_updating = true
	var entry := float(_stop_fields["entry"].value)
	var stop := float(_stop_fields["stop"].value)
	if stop >= entry:
		_stop_fields["stop"].set_value_no_signal(maxf(0.1, entry * 0.9))
	_stop_updating = false
	_update_stop_order()


func _update_stop_order() -> void:
	var entry := float(_stop_fields["entry"].value)
	var stop := float(_stop_fields["stop"].value)
	var trail := float(_stop_fields["trail"].value)
	var shares := floorf(float(_stop_fields["shares"].value))
	var per_share := maxf(0.0, entry - stop)
	var risk := per_share * shares
	var distance := per_share / entry * 100.0 if entry > 0.0 else 0.0
	var trailing_stop := maxf(0.0, entry - trail)
	_stop_labels["perShare"].text = SmaFormat.money(per_share)
	_stop_labels["distance"].text = SmaFormat.num(distance, 1) + "%"
	_stop_labels["risk"].text = SmaFormat.money(risk)
	_stop_labels["trailing"].text = SmaFormat.money(trailing_stop)


# ---------------------------------------------------------------------------
# Order book and slippage
# ---------------------------------------------------------------------------

func _build_order_book() -> void:
	var companies := SmaCompanyCatalog.load_companies()
	var tickers: Array = []
	for ticker in companies.keys():
		tickers.append(String(ticker))
	tickers.sort_custom(func(a, b): return float(companies[a].get("marketCap", 0.0)) \
		> float(companies[b].get("marketCap", 0.0)))
	_book_tickers = tickers.slice(0, mini(12, tickers.size()))
	var current := String(game.selected_ticker) if game != null else ""
	if current != "" and not _book_tickers.has(current):
		if _book_tickers.size() >= 12:
			_book_tickers[11] = current
		else:
			_book_tickers.append(current)
	var controls := SmaKit.hbox(10)
	controls.add_child(SmaKit.label(I18n.t("demo.orderBook.ticker"), 13))
	var option := OptionButton.new()
	var selected_index := 0
	for index in _book_tickers.size():
		var ticker := String(_book_tickers[index])
		option.add_item(ticker)
		option.set_item_metadata(index, ticker)
		if ticker == current:
			selected_index = index
	option.select(selected_index)
	option.item_selected.connect(_on_book_ticker_changed)
	_book_ticker_option = option
	controls.add_child(option)
	controls.add_child(SmaKit.label(I18n.t("demo.orderBook.qty"), 13))
	var qty := SpinBox.new()
	qty.min_value = 50
	qty.max_value = 1000000
	qty.step = 50
	qty.value = 500
	qty.custom_minimum_size.x = 130
	qty.value_changed.connect(_on_book_qty_changed)
	_book_qty = qty
	controls.add_child(qty)
	controls.add_child(SmaKit.hspacer())
	_body.add_child(controls)
	var book_card := SmaKit.card(8)
	_book_rows_box = SmaKit.vbox(1)
	book_card.add_child(_book_rows_box)
	_body.add_child(book_card)
	var result_card := SmaKit.card(10)
	var result_box := SmaKit.vbox(5)
	result_card.add_child(result_box)
	_book_labels["avg"] = _result_row(result_box, "demo.orderBook.avgPrice")
	_book_labels["slippage"] = _result_row(result_box, "demo.orderBook.slippage")
	_book_labels["filled"] = _result_row(result_box, "demo.orderBook.filled")
	_body.add_child(result_card)
	_body.add_child(_note("demo.orderBook.note"))
	_update_order_book()


func _on_book_ticker_changed(_index: int) -> void:
	_update_order_book()
	_complete()


func _on_book_qty_changed(_value: float) -> void:
	_update_order_book()
	_complete()


func _update_order_book() -> void:
	var ticker := ""
	if _book_ticker_option != null and _book_ticker_option.selected >= 0:
		ticker = String(_book_ticker_option.get_item_metadata(_book_ticker_option.selected))
	var book: Dictionary = game.exchange.get_book(ticker, 5) if game != null \
		and game.exchange != null and ticker != "" else {"asks": [], "bids": []}
	var asks: Array = book.get("asks", [])
	var bids: Array = book.get("bids", [])
	SmaKit.clear_children(_book_rows_box)
	for index in range(asks.size() - 1, -1, -1):
		_add_book_row("demo.orderBook.ask", asks[index], SmaUiTheme.NEGATIVE)
	for level in bids:
		_add_book_row("demo.orderBook.bid", level, SmaUiTheme.POSITIVE)
	var qty := int(_book_qty.value) if _book_qty != null else 0
	var remaining := qty
	var filled := 0
	var notional := 0.0
	for level in asks:
		if remaining <= 0:
			break
		var take := mini(remaining, int(level.get("size", 0)))
		if take <= 0:
			continue
		notional += float(level.get("price", 0.0)) * take
		filled += take
		remaining -= take
	var average := notional / float(filled) if filled > 0 else 0.0
	var best_ask := float(asks[0].get("price", 0.0)) if not asks.is_empty() else 0.0
	var slippage := (average / best_ask - 1.0) * 100.0 if filled > 0 and best_ask > 0.0 else 0.0
	_book_labels["avg"].text = SmaFormat.money(average) if filled > 0 else "—"
	_book_labels["slippage"].text = SmaFormat.num(slippage, 2) + "%" if filled > 0 else "—"
	_book_labels["filled"].text = "%s / %s" % [SmaFormat.quantity(filled),
		SmaFormat.quantity(qty)]


func _add_book_row(label_key: String, level: Dictionary, color: Color) -> void:
	var row := SmaKit.hbox(8)
	var side := SmaKit.label(I18n.t(label_key), 11, color)
	side.custom_minimum_size.x = 52
	row.add_child(side)
	row.add_child(SmaKit.hspacer())
	var price := SmaKit.label(SmaFormat.money(float(level.get("price", 0.0))), 11)
	price.custom_minimum_size.x = 100
	price.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(price)
	var size := SmaKit.label(SmaFormat.quantity(float(level.get("size", 0.0))), 11,
		SmaUiTheme.MUTED)
	size.custom_minimum_size.x = 100
	size.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(size)
	_book_rows_box.add_child(row)


# ---------------------------------------------------------------------------
# Option payoff at expiry
# ---------------------------------------------------------------------------

func _build_option_payoff() -> void:
	var type_row := SmaKit.hbox(8)
	type_row.add_child(SmaKit.caption(I18n.t("demo.optionPayoff.type")))
	var type_option := OptionButton.new()
	type_option.add_item(I18n.t("options.call"))
	type_option.set_item_metadata(0, "call")
	type_option.add_item(I18n.t("options.put"))
	type_option.set_item_metadata(1, "put")
	type_option.select(0)
	type_option.item_selected.connect(_on_payoff_type_changed)
	_payoff_type = type_option
	type_row.add_child(type_option)
	type_row.add_child(SmaKit.hspacer())
	_body.add_child(type_row)
	var built := _spin_grid([
		["strike", "demo.optionPayoff.strike", 50.0, 1.0, 1000000.0, 0.5],
		["premium", "demo.optionPayoff.premium", 3.0, 0.1, 100000.0, 0.1],
		["qty", "demo.optionPayoff.qty", 1.0, 1.0, 10000.0, 1.0],
		["spot", "demo.optionPayoff.spot", 50.0, 1.0, 1000000.0, 0.5],
	])
	_payoff_fields = built["fields"]
	_body.add_child(built["grid"])
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	_payoff_labels["pnl"] = _result_row(box, "demo.optionPayoff.atExpiry")
	_payoff_labels["breakeven"] = _result_row(box, "demo.optionPayoff.breakeven")
	_payoff_labels["maxLoss"] = _result_row(box, "demo.optionPayoff.maxLoss")
	_body.add_child(card)
	_payoff_chart = SmaPayoffChart.new()
	_payoff_chart.custom_minimum_size = Vector2(640, 180)
	_body.add_child(_payoff_chart)
	_body.add_child(_note("demo.optionPayoff.note"))
	for key in ["strike", "premium", "qty", "spot"]:
		_payoff_fields[key].value_changed.connect(_on_payoff_value_changed)
	_update_option_payoff()


func _on_payoff_type_changed(_index: int) -> void:
	_update_option_payoff()


func _on_payoff_value_changed(_value: float) -> void:
	_update_option_payoff()


func _update_option_payoff() -> void:
	var option_type := "call"
	if _payoff_type != null:
		option_type = String(_payoff_type.get_item_metadata(_payoff_type.selected))
	var payoff := SmaOptions.payoff_at_expiry({
		"type": option_type,
		"spot": float(_payoff_fields["spot"].value),
		"strike": float(_payoff_fields["strike"].value),
		"premium": float(_payoff_fields["premium"].value),
		"qty": int(_payoff_fields["qty"].value),
	})
	_payoff_labels["pnl"].text = SmaFormat.signed_money(float(payoff["pnl"]))
	_payoff_labels["pnl"].add_theme_color_override("font_color",
		SmaKit.value_color(float(payoff["pnl"])))
	_payoff_labels["breakeven"].text = SmaFormat.money(float(payoff["breakeven"]))
	_payoff_labels["maxLoss"].text = SmaFormat.money(float(payoff["maxLoss"]))
	_payoff_labels["maxLoss"].add_theme_color_override("font_color", SmaUiTheme.NEGATIVE)
	var strike := float(_payoff_fields["strike"].value)
	var premium := float(_payoff_fields["premium"].value)
	var qty := int(_payoff_fields["qty"].value)
	var low := maxf(1.0, strike * 0.6)
	var high := strike * 1.4
	var values: Array = []
	for index in 41:
		var price := lerpf(low, high, float(index) / 40.0)
		values.append(float(SmaOptions.payoff_at_expiry({
			"type": option_type, "spot": price, "strike": strike,
			"premium": premium, "qty": qty,
		})["pnl"]))
	if _payoff_chart != null:
		_payoff_chart.set_values(values, SmaFormat.money(low), SmaFormat.money(high))


# ---------------------------------------------------------------------------
# Greeks lab
# ---------------------------------------------------------------------------

func _build_greeks() -> void:
	var type_row := SmaKit.hbox(8)
	type_row.add_child(SmaKit.caption(I18n.t("demo.greeks.type")))
	var type_option := OptionButton.new()
	type_option.add_item(I18n.t("options.call"))
	type_option.set_item_metadata(0, "call")
	type_option.add_item(I18n.t("options.put"))
	type_option.set_item_metadata(1, "put")
	type_option.select(0)
	type_option.item_selected.connect(_on_greeks_type_changed)
	_greeks_type = type_option
	type_row.add_child(type_option)
	type_row.add_child(SmaKit.hspacer())
	_body.add_child(type_row)
	var built := _spin_grid([
		["spot", "demo.greeks.spot", 50.0, 1.0, 1000000.0, 0.5],
		["strike", "demo.greeks.strike", 50.0, 1.0, 1000000.0, 0.5],
		["vol", "demo.greeks.vol", 30.0, 1.0, 200.0, 1.0],
		["days", "demo.greeks.days", 60.0, 1.0, 720.0, 1.0],
	])
	_greeks_fields = built["fields"]
	_body.add_child(built["grid"])
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	for spec in [["price", "demo.greeks.price"], ["delta", "options.delta"],
			["gamma", "options.gamma"], ["theta", "options.theta"],
			["vega", "Vega"], ["rho", "Rho"],
			["intrinsic", "demo.greeks.intrinsic"],
			["timeValue", "demo.greeks.timeValue"]]:
		_greeks_labels[String(spec[0])] = _result_row(box, String(spec[1]))
	_body.add_child(card)
	_body.add_child(_note("demo.greeks.note"))
	for key in ["spot", "strike", "vol", "days"]:
		_greeks_fields[key].value_changed.connect(_on_greeks_value_changed)
	_update_greeks()


func _on_greeks_type_changed(_index: int) -> void:
	_update_greeks()
	_complete()


func _on_greeks_value_changed(_value: float) -> void:
	_update_greeks()
	_complete()


func _update_greeks() -> void:
	var option_type := "call"
	if _greeks_type != null:
		option_type = String(_greeks_type.get_item_metadata(_greeks_type.selected))
	var mark := SmaOptions.black_scholes({
		"type": option_type,
		"spot": float(_greeks_fields["spot"].value),
		"strike": float(_greeks_fields["strike"].value),
		"years": float(_greeks_fields["days"].value) / 252.0,
		"vol": float(_greeks_fields["vol"].value) / 100.0,
	})
	_greeks_labels["price"].text = SmaFormat.money(float(mark["price"]))
	_greeks_labels["delta"].text = SmaFormat.num(float(mark["delta"]), 3)
	_greeks_labels["gamma"].text = SmaFormat.num(float(mark["gamma"]), 4)
	_greeks_labels["theta"].text = SmaFormat.money(float(mark["theta"]))
	_greeks_labels["vega"].text = SmaFormat.num(float(mark["vega"]), 2)
	_greeks_labels["rho"].text = SmaFormat.num(float(mark["rho"]), 3)
	_greeks_labels["intrinsic"].text = SmaFormat.money(float(mark["intrinsic"]))
	_greeks_labels["timeValue"].text = SmaFormat.money(float(mark["timeValue"]))


# ---------------------------------------------------------------------------
# Strategy payoff lab
# ---------------------------------------------------------------------------

func _build_strategy_payoff() -> void:
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 6)
	var companies := SmaCompanyCatalog.load_companies()
	var tickers := companies.keys()
	tickers.sort()
	var ticker_option := OptionButton.new()
	for index in tickers.size():
		var ticker := String(tickers[index])
		ticker_option.add_item("%s · %s" % [ticker, String(companies[ticker].get("name", ticker))])
		ticker_option.set_item_metadata(index, ticker)
	ticker_option.select(0)
	_payoff_strategy_ticker = ticker_option
	grid.add_child(_select_field("demo.strategyPayoff.ticker", ticker_option))
	var preset_option := OptionButton.new()
	for index in SmaOptionStrategies.DEFS.size():
		var definition: Dictionary = SmaOptionStrategies.DEFS[index]
		preset_option.add_item(I18n.t(String(definition["nameKey"])))
		preset_option.set_item_metadata(index, String(definition["id"]))
	preset_option.select(0)
	_payoff_strategy_preset = preset_option
	grid.add_child(_select_field("demo.strategyPayoff.strategy", preset_option))
	var expiry_option := OptionButton.new()
	for index in SmaOptions.EXPIRY_DAYS.size():
		var days := int(SmaOptions.EXPIRY_DAYS[index])
		expiry_option.add_item(I18n.t("options.expiryOption", {"days": days}))
		expiry_option.set_item_metadata(index, days)
	expiry_option.select(0)
	_payoff_strategy_expiry = expiry_option
	grid.add_child(_select_field("demo.strategyPayoff.expiry", expiry_option))
	var qty_spin := SpinBox.new()
	qty_spin.min_value = 1
	qty_spin.max_value = 100
	qty_spin.step = 1
	qty_spin.value = 1
	qty_spin.custom_minimum_size.x = 90
	_payoff_strategy_qty = qty_spin
	grid.add_child(_select_field("demo.strategyPayoff.qty", qty_spin))
	_body.add_child(grid)
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	for spec in [["netCost", "demo.strategyPayoff.netCost"],
			["maxLoss", "demo.strategyPayoff.maxLoss"],
			["maxProfit", "demo.strategyPayoff.maxProfit"]]:
		_payoff_strategy_labels[String(spec[0])] = _result_row(box, String(spec[1]))
	_body.add_child(card)
	_payoff_strategy_chart = SmaPayoffChart.new()
	_payoff_strategy_chart.custom_minimum_size = Vector2(640, 160)
	_body.add_child(_payoff_strategy_chart)
	_body.add_child(_note("demo.strategyPayoff.note"))
	ticker_option.item_selected.connect(_on_strategy_payoff_changed)
	preset_option.item_selected.connect(_on_strategy_payoff_changed)
	expiry_option.item_selected.connect(_on_strategy_payoff_changed)
	qty_spin.value_changed.connect(_on_strategy_payoff_value_changed)
	_update_strategy_payoff()


func _select_field(label_key: String, control: Control) -> VBoxContainer:
	var box := SmaKit.vbox(3)
	box.add_child(SmaKit.caption(I18n.t(label_key)))
	box.add_child(control)
	return box


func _on_strategy_payoff_changed(_index: int) -> void:
	_update_strategy_payoff()


func _on_strategy_payoff_value_changed(_value: float) -> void:
	_update_strategy_payoff()


func _update_strategy_payoff() -> void:
	if _payoff_strategy_ticker == null or _payoff_strategy_chart == null:
		return
	var ticker := String(_payoff_strategy_ticker.get_item_metadata(
		_payoff_strategy_ticker.selected))
	var strategy_id := String(_payoff_strategy_preset.get_item_metadata(
		_payoff_strategy_preset.selected))
	var days := int(_payoff_strategy_expiry.get_item_metadata(
		_payoff_strategy_expiry.selected))
	var quantity := maxi(1, int(_payoff_strategy_qty.value))
	var chain: Dictionary = game.option_chain(ticker) if game != null else {}
	var strategy: Dictionary = SmaOptionStrategies.build(
		strategy_id, chain, days, quantity)
	if strategy.is_empty():
		_payoff_strategy_labels["netCost"].text = "—"
		_payoff_strategy_labels["maxLoss"].text = "—"
		_payoff_strategy_labels["maxProfit"].text = "—"
		_payoff_strategy_chart.set_values([], "", "")
		return
	var spot := float(chain.get("spot", 0.0))
	var low := spot * 0.7
	var high := spot * 1.3
	var values: Array = []
	for index in 41:
		var price := lerpf(low, high, float(index) / 40.0)
		values.append(SmaOptionStrategies.payoff(strategy, price))
	_payoff_strategy_chart.set_values(values, SmaFormat.money(low), SmaFormat.money(high))
	var net_cost := float(strategy["netCost"])
	_payoff_strategy_labels["netCost"].text = SmaFormat.signed_money(-net_cost)
	_payoff_strategy_labels["netCost"].add_theme_color_override("font_color",
		SmaUiTheme.POSITIVE if net_cost < 0.0 else SmaUiTheme.TEXT)
	_payoff_strategy_labels["maxLoss"].text = SmaFormat.money(float(strategy["maxLoss"]))
	_payoff_strategy_labels["maxLoss"].add_theme_color_override("font_color",
		SmaUiTheme.NEGATIVE)
	var max_profit: Variant = strategy["maxProfit"]
	_payoff_strategy_labels["maxProfit"].text = I18n.t("demo.strategyPayoff.unlimited") \
		if max_profit == null else SmaFormat.money(float(max_profit))
	_payoff_strategy_labels["maxProfit"].add_theme_color_override("font_color",
		SmaUiTheme.POSITIVE)


# ---------------------------------------------------------------------------
# Futures P&L
# ---------------------------------------------------------------------------

func _build_futures_pnl() -> void:
	var side_row := SmaKit.hbox(8)
	side_row.add_child(SmaKit.caption(I18n.t("demo.futuresPnl.side")))
	var side_option := OptionButton.new()
	side_option.add_item(I18n.t("futures.long"))
	side_option.set_item_metadata(0, "long")
	side_option.add_item(I18n.t("futures.short"))
	side_option.set_item_metadata(1, "short")
	side_option.select(0)
	side_option.item_selected.connect(_on_futures_side_changed)
	_futures_side = side_option
	side_row.add_child(side_option)
	side_row.add_child(SmaKit.hspacer())
	_body.add_child(side_row)
	var built := _spin_grid([
		["entry", "demo.futuresPnl.entry", 50.0, 1.0, 1000000.0, 0.5],
		["exit", "demo.futuresPnl.exit", 55.0, 1.0, 1000000.0, 0.5],
		["qty", "demo.futuresPnl.qty", 1.0, 1.0, 10000.0, 1.0],
	])
	_futures_fields = built["fields"]
	_body.add_child(built["grid"])
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	for spec in [["notional", "demo.futuresPnl.notional"],
			["margin", "demo.futuresPnl.margin"],
			["pnl", "demo.futuresPnl.pnl"],
			["return", "demo.futuresPnl.return"]]:
		_futures_labels[String(spec[0])] = _result_row(box, String(spec[1]))
	_body.add_child(card)
	_body.add_child(_note("demo.futuresPnl.note"))
	for key in ["entry", "exit", "qty"]:
		_futures_fields[key].value_changed.connect(_on_futures_value_changed)
	_update_futures_pnl()


func _on_futures_side_changed(_index: int) -> void:
	_update_futures_pnl()


func _on_futures_value_changed(_value: float) -> void:
	_update_futures_pnl()


func _update_futures_pnl() -> void:
	var side := "long"
	if _futures_side != null:
		side = String(_futures_side.get_item_metadata(_futures_side.selected))
	var direction := -1.0 if side == "short" else 1.0
	var entry := float(_futures_fields["entry"].value)
	var exit := float(_futures_fields["exit"].value)
	var qty := float(_futures_fields["qty"].value)
	var pnl := (exit - entry) * direction * qty * SmaFutures.MULTIPLIER
	var notional := entry * qty * SmaFutures.MULTIPLIER
	var margin := notional * SmaFutures.MARGIN_RATE
	_futures_labels["notional"].text = SmaFormat.money(notional)
	_futures_labels["margin"].text = SmaFormat.money(margin)
	_futures_labels["pnl"].text = SmaFormat.signed_money(pnl)
	_futures_labels["pnl"].add_theme_color_override("font_color", SmaKit.value_color(pnl))
	_futures_labels["return"].text = SmaFormat.pct(pnl / margin * 100.0, 1) \
		if margin > 0.0 else "—"
	_futures_labels["return"].add_theme_color_override("font_color", SmaKit.value_color(pnl))


# ---------------------------------------------------------------------------
# Hedge ratio
# ---------------------------------------------------------------------------

func _build_hedge() -> void:
	var built := _spin_grid([
		["shares", "demo.hedge.shares", 1000.0, 100.0, 1000000.0, 100.0],
		["stockPrice", "demo.hedge.stockPrice", 50.0, 1.0, 1000000.0, 0.5],
		["ratio", "demo.hedge.ratio", 1.0, 0.1, 2.0, 0.1],
		["futuresPrice", "demo.hedge.futuresPrice", 50.0, 1.0, 1000000.0, 0.5],
	])
	_hedge_fields = built["fields"]
	_body.add_child(built["grid"])
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	for spec in [["stockValue", "demo.hedge.stockValue"],
			["contracts", "demo.hedge.contracts"],
			["residual", "demo.hedge.residual"]]:
		_hedge_labels[String(spec[0])] = _result_row(box, String(spec[1]))
	_body.add_child(card)
	_body.add_child(_note("demo.hedge.note"))
	for key in ["shares", "stockPrice", "ratio", "futuresPrice"]:
		_hedge_fields[key].value_changed.connect(_on_hedge_value_changed)
	_update_hedge()


func _on_hedge_value_changed(_value: float) -> void:
	_update_hedge()
	_complete()


func _update_hedge() -> void:
	var shares := float(_hedge_fields["shares"].value)
	var stock_price := float(_hedge_fields["stockPrice"].value)
	var ratio := float(_hedge_fields["ratio"].value)
	var futures_price := float(_hedge_fields["futuresPrice"].value)
	var stock_value := shares * stock_price
	var notional := futures_price * SmaFutures.MULTIPLIER
	var contracts := stock_value * ratio / notional if notional > 0.0 else 0.0
	var residual := stock_value - contracts * notional
	_hedge_labels["stockValue"].text = SmaFormat.money(stock_value)
	_hedge_labels["contracts"].text = SmaFormat.num(contracts, 2)
	_hedge_labels["residual"].text = SmaFormat.money(residual)


# ---------------------------------------------------------------------------
# Stress test
# ---------------------------------------------------------------------------

func _build_stress_test() -> void:
	var built := _spin_grid([
		["equity", "demo.stressTest.equity", 10000.0, 1000.0, 10000000.0, 100.0],
		["leverage", "demo.stressTest.leverage", 2.0, 1.0, 5.0, 0.5],
		["shock", "demo.stressTest.shock", 20.0, 1.0, 80.0, 1.0],
	])
	_stress_fields = built["fields"]
	_body.add_child(built["grid"])
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	for spec in [["loss", "demo.stressTest.loss"],
			["remaining", "demo.stressTest.remaining"],
			["status", "demo.stressTest.status"]]:
		_stress_labels[String(spec[0])] = _result_row(box, String(spec[1]))
	_body.add_child(card)
	_body.add_child(_note("demo.stressTest.note"))
	for key in ["equity", "leverage", "shock"]:
		_stress_fields[key].value_changed.connect(_on_stress_value_changed)
	_update_stress_test()


func _on_stress_value_changed(_value: float) -> void:
	_update_stress_test()
	_complete()


func _update_stress_test() -> void:
	var equity := float(_stress_fields["equity"].value)
	var leverage := float(_stress_fields["leverage"].value)
	var shock := float(_stress_fields["shock"].value)
	var loss := equity * leverage * shock / 100.0
	var remaining := equity - loss
	_stress_labels["loss"].text = SmaFormat.money(loss)
	_stress_labels["loss"].add_theme_color_override("font_color", SmaUiTheme.NEGATIVE)
	_stress_labels["remaining"].text = SmaFormat.money(remaining)
	_stress_labels["remaining"].add_theme_color_override("font_color",
		SmaUiTheme.POSITIVE if remaining >= 0.0 else SmaUiTheme.NEGATIVE)
	_stress_labels["status"].text = I18n.t("demo.stressTest.survive") \
		if remaining >= 0.0 else I18n.t("demo.stressTest.wipeout")
	_stress_labels["status"].add_theme_color_override("font_color",
		SmaUiTheme.POSITIVE if remaining >= 0.0 else SmaUiTheme.NEGATIVE)
