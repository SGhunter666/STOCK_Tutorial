## Historical replay lab. Datasets are loaded on demand; the run account is
## independent from the academy exchange. No candle or quote is produced beyond
## the current day and tick.
class_name SmaHistoryScreen
extends SmaScreen

const TIMEFRAMES := ["5m", "15m", "1h", "1d", "1w", "1mo", "1y"]

var _list_view: VBoxContainer
var _lab_view: VBoxContainer
var _scenario_id := ""
var _dataset: Dictionary = {}
var _selected_symbol := ""
var _timeframe := "1d"
var _playing := false
var _speed := 1
var _accum := 0.0
var _ui_accum := 0.0
var _loading_id := ""

var _date_label: Label
var _tick_label: Label
var _equity_label: Label
var _return_label: Label
var _play_button: Button
var _chart: SmaCandleChart
var _chart_note: Label
var _quote_labels: Dictionary = {}
var _summary_labels: Dictionary = {}
var _ticker_rows: Dictionary = {}
var _ticker_groups: Dictionary = {}
var _ticker_list: VBoxContainer
var _ticker_search: LineEdit
var _pack_filter: OptionButton
var _pack_values: Array[String] = [""]
var _position_box: VBoxContainer
var _event_list: VBoxContainer
var _qty: SpinBox
var _ticket_feedback: Label
var _estimate_label: Label


func _build() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	var root := SmaKit.vbox(12)
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(root)
	_list_view = SmaKit.vbox(12)
	_lab_view = SmaKit.vbox(10)
	_lab_view.visible = false
	root.add_child(_list_view)
	root.add_child(_lab_view)
	visibility_changed.connect(func(): if not visible: _playing = false)


func refresh(_reason: String = "") -> void:
	if game == null or not game.started:
		return
	if _scenario_id == "":
		_list_view.visible = true
		_lab_view.visible = false
		_rebuild_scenarios()
		return
	_list_view.visible = false
	_lab_view.visible = true
	if _lab_view.get_child_count() == 0:
		_build_lab()
	_update_all()


func on_tick() -> void:
	pass


func _process(delta: float) -> void:
	if not visible or _scenario_id == "" or _dataset.is_empty() or not _playing:
		return
	var interval := 1.0 / float(_speed)
	_accum += delta
	var ticks := 0
	while _accum >= interval and ticks < 4:
		_accum -= interval
		_tick()
		ticks += 1
	if ticks > 0:
		_ui_accum += delta
		if _ui_accum >= 0.12:
			_ui_accum = 0.0
			_update_ticker_prices()
			_update_all()


# ---------------------------------------------------------------------------
# Scenario selection
# ---------------------------------------------------------------------------

func _rebuild_scenarios() -> void:
	SmaKit.clear_children(_list_view)
	var heading := SmaKit.vbox(2)
	heading.add_child(SmaKit.caption(I18n.t("history.scenarioEyebrow")))
	heading.add_child(SmaKit.title(I18n.t("history.title"), 24))
	heading.add_child(SmaKit.muted(I18n.t("history.subtitle"), 13))
	_list_view.add_child(heading)
	if _loading_id != "":
		_list_view.add_child(SmaKit.label(I18n.t("history.loadingData",
			{"name": I18n.t(String(Game.history.scenario(_loading_id).get("titleKey", _loading_id)))}),
			15, SmaUiTheme.ACCENT))
		return
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 12)
	_list_view.add_child(grid)
	for entry in Game.history.scenarios():
		grid.add_child(_scenario_card(entry))
	var note := SmaKit.muted(I18n.t("history.disclaimer"))
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_list_view.add_child(note)
	var source_note := SmaKit.caption(I18n.t("history.sourceNote"))
	source_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_list_view.add_child(source_note)


func _scenario_card(entry: Dictionary) -> Control:
	var card := SmaKit.card(14)
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.custom_minimum_size.y = 250
	var box := SmaKit.vbox(8)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t(String(entry["titleKey"])), 18))
	box.add_child(SmaKit.label(I18n.t(String(entry["subtitleKey"])), 12, SmaUiTheme.ACCENT))
	var desc := SmaKit.muted(I18n.t(String(entry["descKey"])), 12)
	desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc.custom_minimum_size.y = 34
	box.add_child(desc)
	var meta := SmaKit.hbox(10)
	meta.custom_minimum_size.y = 18
	meta.add_child(SmaKit.caption(I18n.t(String(entry["periodKey"]))))
	meta.add_child(SmaKit.caption(I18n.t(String(entry["difficultyKey"]))))
	if entry.has("tickerCount"):
		meta.add_child(SmaKit.caption(I18n.t("history.tickersCount",
			{"count": entry["tickerCount"]})))
	box.add_child(meta)
	var tips: Array = entry.get("tips", [])
	if not tips.is_empty():
		var tip := SmaKit.muted("· " + I18n.t(String(tips[0])), 12)
		tip.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		tip.custom_minimum_size.y = 30
		box.add_child(tip)
	box.add_child(SmaKit.spacer(0, true))
	var has_run := not Game.history.run(String(entry["id"])).is_empty()
	var button := SmaKit.button(I18n.t("history.continue" if has_run else "history.start"),
		_start_scenario.bind(String(entry["id"])), true)
	button.custom_minimum_size.y = 36
	box.add_child(button)
	box.add_child(SmaKit.caption(I18n.t("history.startHint")))
	return card


func _start_scenario(scenario_id: String) -> void:
	if _loading_id != "":
		return
	_loading_id = scenario_id
	_rebuild_scenarios()
	await get_tree().process_frame
	var dataset: Dictionary = Game.history.load_dataset(scenario_id)
	_loading_id = ""
	if dataset.is_empty():
		game.toast(I18n.t("history.loadError"))
		_rebuild_scenarios()
		return
	_dataset = dataset
	_scenario_id = scenario_id
	var run_data: Dictionary = Game.history.ensure_run(scenario_id, dataset)
	_selected_symbol = String(run_data.get("selectedTicker", ""))
	if _selected_symbol == "" and not dataset.get("tickers", []).is_empty():
		_selected_symbol = String(dataset["tickers"][0]["symbol"])
	_playing = false
	_accum = 0.0
	_ui_accum = 0.0
	_list_view.visible = false
	_lab_view.visible = true
	SmaKit.clear_children(_lab_view)
	_build_lab()
	_update_ticker_prices()
	_update_all()


# ---------------------------------------------------------------------------
# Lab layout
# ---------------------------------------------------------------------------

func _build_lab() -> void:
	SmaKit.clear_children(_lab_view)
	var scenario := Game.history.scenario(_scenario_id)
	var top := SmaKit.card(10)
	var top_row := SmaKit.hbox(12)
	top.add_child(top_row)
	top_row.add_child(SmaKit.button(I18n.t("history.backToList"), _back_to_list))
	var title_box := SmaKit.vbox(1)
	title_box.add_child(SmaKit.label(I18n.t(String(scenario.get("titleKey", ""))), 17))
	var meta_row := SmaKit.hbox(10)
	_date_label = SmaKit.caption("—")
	_tick_label = SmaKit.caption("—")
	meta_row.add_child(_date_label)
	meta_row.add_child(_tick_label)
	title_box.add_child(meta_row)
	top_row.add_child(title_box)
	top_row.add_child(SmaKit.hspacer())
	var stats := SmaKit.vbox(1)
	stats.add_child(SmaKit.caption(I18n.t("history.statEquity")))
	_equity_label = SmaKit.label("—", 15)
	stats.add_child(_equity_label)
	top_row.add_child(stats)
	var pnl := SmaKit.vbox(1)
	pnl.add_child(SmaKit.caption(I18n.t("history.statPnl")))
	_return_label = SmaKit.label("—", 15)
	pnl.add_child(_return_label)
	top_row.add_child(pnl)
	_play_button = SmaKit.button(I18n.t("history.play"), _toggle_play)
	top_row.add_child(_play_button)
	var speed_group := ButtonGroup.new()
	for value in [1, 5, 20]:
		var button := SmaKit.toggle("%d×" % value, speed_group)
		button.custom_minimum_size.x = 40
		button.button_pressed = value == 1
		button.pressed.connect(_set_speed.bind(value))
		top_row.add_child(button)
	top_row.add_child(SmaKit.button(I18n.t("history.advanceTick"), _advance_tick))
	top_row.add_child(SmaKit.button(I18n.t("history.nextDay"), _advance_day))
	top_row.add_child(SmaKit.button(I18n.t("history.nextEvent"), _next_event))
	top_row.add_child(SmaKit.button(I18n.t("history.resetShort"), _reset))
	_lab_view.add_child(top)

	var body := SmaKit.hbox(12)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_lab_view.add_child(body)

	var left := SmaKit.card(10)
	left.custom_minimum_size.x = 290
	var left_box := SmaKit.vbox(6)
	left.add_child(left_box)
	left_box.add_child(SmaKit.label(I18n.t("history.universeTitle"), 13))
	_ticker_search = LineEdit.new()
	_ticker_search.placeholder_text = I18n.t("history.filterPlaceholder")
	_ticker_search.text_changed.connect(func(_text): _apply_ticker_filter())
	left_box.add_child(_ticker_search)
	_pack_filter = OptionButton.new()
	_pack_filter.add_item(I18n.t("history.allGroups"))
	_pack_values = [""]
	_pack_filter.item_selected.connect(func(_index): _apply_ticker_filter())
	left_box.add_child(_pack_filter)
	var ticker_scroll := SmaKit.scroll()
	_ticker_list = SmaKit.vbox(1)
	ticker_scroll.add_child(_ticker_list)
	left_box.add_child(ticker_scroll)
	body.add_child(left)

	var center := SmaKit.vbox(12)
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_child(center)
	var chart_card := SmaKit.card(10)
	var chart_box := SmaKit.vbox(6)
	chart_card.add_child(chart_box)
	var chart_head := SmaKit.hbox(6)
	chart_head.add_child(SmaKit.label(I18n.t("history.chartTitle"), 14))
	chart_head.add_child(SmaKit.hspacer())
	var timeframe_group := ButtonGroup.new()
	for timeframe in TIMEFRAMES:
		var button := SmaKit.toggle(I18n.t("history.tf.%s" % timeframe), timeframe_group)
		button.add_theme_font_size_override("font_size", 10)
		button.pressed.connect(_on_timeframe.bind(timeframe))
		if timeframe == _timeframe:
			button.button_pressed = true
		chart_head.add_child(button)
	chart_box.add_child(chart_head)
	_chart = SmaCandleChart.new()
	_chart.custom_minimum_size.y = 300
	chart_box.add_child(_chart)
	_chart_note = SmaKit.caption("")
	chart_box.add_child(_chart_note)
	center.add_child(chart_card)

	var events_card := SmaKit.card(10)
	var events_box := SmaKit.vbox(5)
	events_card.add_child(events_box)
	events_box.add_child(SmaKit.label(I18n.t("history.eventsTitle"), 13))
	var events_scroll := SmaKit.scroll(150)
	_event_list = SmaKit.vbox(3)
	events_scroll.add_child(_event_list)
	events_box.add_child(events_scroll)
	center.add_child(events_card)

	var right := SmaKit.vbox(10)
	right.custom_minimum_size.x = 330
	right.size_flags_horizontal = Control.SIZE_SHRINK_END
	body.add_child(right)

	var quote_card := SmaKit.card(10)
	var quote_box := SmaKit.vbox(4)
	quote_card.add_child(quote_box)
	quote_box.add_child(SmaKit.label(I18n.t("history.selected"), 13))
	for key in ["last", "change", "open", "high", "low", "volume"]:
		var row := SmaKit.hbox(8)
		var label_key := "history.closePrice" if key == "last" else "market.%s" % key
		row.add_child(SmaKit.caption(I18n.t(label_key)))
		row.add_child(SmaKit.hspacer())
		var value := SmaKit.label("—", 12)
		_quote_labels[key] = value
		row.add_child(value)
		quote_box.add_child(row)
	right.add_child(quote_card)

	var ticket_card := SmaKit.card(10)
	var ticket := SmaKit.vbox(6)
	ticket_card.add_child(ticket)
	ticket.add_child(SmaKit.label(I18n.t("history.ticketTitle"), 13))
	ticket.add_child(SmaKit.caption(I18n.t("history.ticketSubtitle")))
	var qty_row := SmaKit.hbox(8)
	qty_row.add_child(SmaKit.caption(I18n.t("trade.qty")))
	qty_row.add_child(SmaKit.hspacer())
	_qty = SpinBox.new()
	_qty.min_value = 1
	_qty.max_value = 1000000
	_qty.step = 1
	_qty.value = 10
	_qty.custom_minimum_size.x = 120
	_qty.value_changed.connect(func(_value): _update_ticket_estimate())
	qty_row.add_child(_qty)
	ticket.add_child(qty_row)
	var estimate_row := SmaKit.hbox(8)
	estimate_row.add_child(SmaKit.caption(I18n.t("trade.estimate")))
	estimate_row.add_child(SmaKit.hspacer())
	_estimate_label = SmaKit.label("—", 12)
	estimate_row.add_child(_estimate_label)
	ticket.add_child(estimate_row)
	var buttons := SmaKit.hbox(8)
	var buy := SmaKit.button(I18n.t("trade.buy"), _trade.bind("buy"), true)
	buy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	buttons.add_child(buy)
	var sell := SmaKit.button(I18n.t("trade.sell"), _trade.bind("sell"))
	sell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	buttons.add_child(sell)
	ticket.add_child(buttons)
	_ticket_feedback = SmaKit.muted("")
	_ticket_feedback.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	ticket.add_child(_ticket_feedback)
	ticket.add_child(SmaKit.caption(I18n.t("history.fillNote")))
	right.add_child(ticket_card)

	var positions_card := SmaKit.card(10)
	var positions_box := SmaKit.vbox(4)
	positions_card.add_child(positions_box)
	positions_box.add_child(SmaKit.label(I18n.t("history.positionsTitle"), 13))
	_position_box = SmaKit.vbox(2)
	positions_box.add_child(_position_box)
	right.add_child(positions_card)

	var summary_card := SmaKit.card(10)
	var summary_box := SmaKit.vbox(4)
	summary_card.add_child(summary_box)
	summary_box.add_child(SmaKit.label(I18n.t("history.summaryTitle"), 13))
	for key in ["equity", "pnl", "benchmark", "cash", "drawdown", "trades", "winRate"]:
		var row := SmaKit.hbox(8)
		var label_keys := {
			"equity": "history.statEquity", "pnl": "history.statPnl",
			"benchmark": "history.statBenchmark", "cash": "history.statCash",
			"drawdown": "history.statDrawdown", "trades": "history.statTrades",
			"winRate": "history.statWinRate",
		}
		row.add_child(SmaKit.caption(I18n.t(String(label_keys.get(key, "")))))
		row.add_child(SmaKit.hspacer())
		var value := SmaKit.label("—", 12)
		_summary_labels[key] = value
		row.add_child(value)
		summary_box.add_child(row)
	right.add_child(summary_card)

	_build_ticker_list()


func _build_ticker_list() -> void:
	SmaKit.clear_children(_ticker_list)
	_ticker_rows.clear()
	_ticker_groups.clear()
	_pack_values = [""]
	SmaKit.clear_children(_pack_filter)
	_pack_filter.add_item(I18n.t("history.allGroups"))
	for ticker in _dataset.get("tickers", []):
		var symbol := String(ticker.get("symbol", ""))
		var group := String(ticker.get("pack", ""))
		if group == "":
			group = String(ticker.get("sector", ""))
		_ticker_groups[symbol] = group
		if not _pack_values.has(group):
			_pack_values.append(group)
			var label := I18n.t("history.pack.%s" % group) if I18n.has_key("history.pack.%s" % group) \
				else SmaKit.sector_label(group)
			_pack_filter.add_item(label)
		var panel := PanelContainer.new()
		var style := StyleBoxFlat.new()
		style.bg_color = SmaUiTheme.PANEL if _ticker_rows.size() % 2 == 0 else SmaUiTheme.PANEL_ALT
		style.set_content_margin_all(5)
		panel.add_theme_stylebox_override("panel", style)
		panel.mouse_filter = Control.MOUSE_FILTER_STOP
		panel.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		panel.gui_input.connect(_on_ticker_input.bind(symbol))
		var row := SmaKit.hbox(6)
		panel.add_child(row)
		row.add_child(SmaKit.cell(symbol, 0.7, HORIZONTAL_ALIGNMENT_LEFT, SmaUiTheme.ACCENT, 11))
		row.add_child(SmaKit.cell(String(ticker.get("name", "")), 1.3, HORIZONTAL_ALIGNMENT_LEFT,
			SmaUiTheme.MUTED, 10))
		var last := SmaKit.cell("—", 0.8, HORIZONTAL_ALIGNMENT_RIGHT, SmaUiTheme.TEXT, 11)
		var change := SmaKit.cell("—", 0.8, HORIZONTAL_ALIGNMENT_RIGHT, SmaUiTheme.MUTED, 10)
		row.add_child(last)
		row.add_child(change)
		_ticker_list.add_child(panel)
		_ticker_rows[symbol] = {"panel": panel, "last": last, "change": change}
	_apply_ticker_filter()


func _apply_ticker_filter() -> void:
	var query := _ticker_search.text.strip_edges().to_lower() if _ticker_search != null else ""
	var group := ""
	var selected := _pack_filter.selected if _pack_filter != null else 0
	if selected > 0 and selected < _pack_values.size():
		group = _pack_values[selected]
	var tickers_by_symbol := {}
	for ticker in _dataset.get("tickers", []):
		tickers_by_symbol[String(ticker.get("symbol", ""))] = ticker
	for symbol in _ticker_rows.keys():
		var ticker: Dictionary = tickers_by_symbol.get(symbol, {})
		var matches := (query == "" or String(symbol).to_lower().contains(query)
			or String(ticker.get("name", "")).to_lower().contains(query))
		if group != "" and String(_ticker_groups.get(symbol, "")) != group:
			matches = false
		_ticker_rows[symbol]["panel"].visible = matches
	_update_ticker_prices()


func _update_ticker_prices() -> void:
	if _dataset.is_empty() or _scenario_id == "":
		return
	var run_data := Game.history.run(_scenario_id)
	var day := int(run_data.get("dayIndex", 0))
	var tick := int(run_data.get("tick", 0))
	for symbol in _ticker_rows.keys():
		var row: Dictionary = _ticker_rows[symbol]
		if not row["panel"].visible:
			continue
		var quote := SmaHistoryService.quote_at_tick(_dataset, String(symbol), day, tick)
		var last := float(quote.get("last", 0.0))
		var change := float(quote.get("changePct", 0.0))
		row["last"].text = SmaFormat.num(last, 2)
		row["change"].text = SmaFormat.pct(change)
		row["change"].add_theme_color_override("font_color", SmaKit.value_color(change))


func _on_ticker_input(event: InputEvent, symbol: String) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_selected_symbol = symbol
		var run_data := Game.history.run(_scenario_id)
		if not run_data.is_empty():
			run_data["selectedTicker"] = symbol
		_update_all()


# ---------------------------------------------------------------------------
# Clock and controls
# ---------------------------------------------------------------------------

func _tick() -> void:
	var result: Dictionary = Game.history.advance_tick(_scenario_id, _dataset)
	if bool(result.get("dayClosed", false)) or bool(result.get("reachedEnd", false)):
		Game.history_commit()
	if bool(result.get("reachedEnd", false)):
		_playing = false
		_play_button.text = I18n.t("history.play")
		game.toast(I18n.t("history.atEnd"))


func _toggle_play() -> void:
	_playing = not _playing
	_play_button.text = I18n.t("history.pause" if _playing else "history.play")


func _set_speed(value: int) -> void:
	_speed = value


func _on_timeframe(timeframe: String) -> void:
	_timeframe = timeframe
	_update_chart()


func _advance_tick() -> void:
	_playing = false
	_play_button.text = I18n.t("history.play")
	_tick()
	Game.history_commit()
	_update_all()


func _advance_day() -> void:
	_playing = false
	_play_button.text = I18n.t("history.play")
	var result: Dictionary = Game.history.advance_day(_scenario_id, _dataset)
	Game.history_commit()
	if bool(result.get("reachedEnd", false)):
		game.toast(I18n.t("history.atEnd"))
	_update_all()


func _next_event() -> void:
	_playing = false
	_play_button.text = I18n.t("history.play")
	var result: Dictionary = Game.history.advance_to_event(_scenario_id, _dataset)
	Game.history_commit()
	if bool(result.get("reachedEnd", false)):
		game.toast(I18n.t("history.noMoreEvents"))
	_update_all()


func _reset() -> void:
	_playing = false
	_play_button.text = I18n.t("history.play")
	var run_data: Dictionary = Game.history.reset_run(_scenario_id)
	_selected_symbol = String(run_data.get("selectedTicker", ""))
	if _selected_symbol == "" and not _dataset.get("tickers", []).is_empty():
		_selected_symbol = String(_dataset["tickers"][0]["symbol"])
	Game.history_commit()
	game.toast(I18n.t("history.resetDone"))
	_update_all()


func _back_to_list() -> void:
	_playing = false
	_scenario_id = ""
	_dataset = {}
	SmaKit.clear_children(_lab_view)
	refresh()


# ---------------------------------------------------------------------------
# Trade and dynamic updates
# ---------------------------------------------------------------------------

func _trade(side: String) -> void:
	if _selected_symbol == "":
		game.toast(I18n.t("history.noSelection"))
		return
	var result: Dictionary = Game.history.trade(_scenario_id, _dataset, {
		"symbol": _selected_symbol, "side": side, "qty": int(_qty.value),
	})
	if not bool(result.get("ok", false)):
		game.toast(I18n.t(String(result.get("error", "history.invalidOrder"))))
		return
	var price := float(result.get("price", 0.0))
	game.toast(I18n.t("history.buyToast" if side == "buy" else "history.sellToast", {
		"qty": int(_qty.value), "symbol": _selected_symbol, "price": SmaFormat.money(price),
	}))
	_ticket_feedback.text = "%s %s @ %s" % [I18n.t("trade.buy" if side == "buy" else "trade.sell"),
		SmaFormat.quantity(float(_qty.value)), SmaFormat.money(price)]
	Game.history_commit()
	_update_all()


func _update_all() -> void:
	if _scenario_id == "" or _dataset.is_empty() or game == null:
		return
	var run_data := Game.history.run(_scenario_id)
	if run_data.is_empty():
		return
	var day := int(run_data.get("dayIndex", 0))
	var tick := int(run_data.get("tick", 0))
	_date_label.text = SmaHistoryService.current_date(_dataset, day)
	_tick_label.text = I18n.t("history.tickOf", {"tick": tick + 1, "total": 8})
	var summary: Dictionary = Game.history.summary(_scenario_id, _dataset)
	_equity_label.text = SmaFormat.money(float(summary["equity"]))
	_return_label.text = SmaFormat.pct(float(summary["returnPct"]))
	_return_label.add_theme_color_override("font_color", SmaKit.value_color(float(summary["returnPct"])))
	_update_quote(day, tick)
	_update_chart()
	_update_positions()
	_update_summary(summary)
	_update_events(day)
	_update_ticker_prices()
	_update_ticket_estimate()


func _update_quote(day: int, tick: int) -> void:
	if _selected_symbol == "":
		for key in _quote_labels.keys():
			_quote_labels[key].text = "—"
		return
	var quote := SmaHistoryService.quote_at_tick(_dataset, _selected_symbol, day, tick)
	var values := {
		"last": SmaFormat.num(float(quote.get("last", 0.0)), 2),
		"change": SmaFormat.pct(float(quote.get("changePct", 0.0))),
		"open": SmaFormat.num(float(quote.get("open", 0.0)), 2),
		"high": SmaFormat.num(float(quote.get("high", 0.0)), 2),
		"low": SmaFormat.num(float(quote.get("low", 0.0)), 2),
		"volume": SmaFormat.compact(float(quote.get("volume", 0))),
	}
	for key in values.keys():
		if _quote_labels.has(key):
			_quote_labels[key].text = String(values[key])
	if _quote_labels.has("change"):
		_quote_labels["change"].add_theme_color_override("font_color",
			SmaKit.value_color(float(quote.get("changePct", 0.0))))


func _update_chart() -> void:
	if _selected_symbol == "" or _dataset.is_empty():
		_chart.set_candles([], _timeframe, I18n.t("history.noSelection"))
		_chart_note.text = ""
		return
	var run_data := Game.history.run(_scenario_id)
	var day := int(run_data.get("dayIndex", 0))
	var tick := int(run_data.get("tick", 0))
	var quote := SmaHistoryService.quote_at_tick(_dataset, _selected_symbol, day, tick)
	var result := SmaHistoryService.history_candles(_dataset, _selected_symbol, day, tick,
		_timeframe, float(quote.get("last", 0.0)))
	var tf_label := I18n.t("history.tf.%s" % _timeframe)
	_chart.set_candles(result.get("candles", []), _timeframe,
		"%s · %s" % [_selected_symbol, tf_label])
	var count := int(result.get("candles", []).size())
	_chart_note.text = I18n.t("history.chartNoteIntraday" if bool(result.get("intraday", false))
		else "history.chartNote", {"count": count, "tf": tf_label})


func _update_positions() -> void:
	SmaKit.clear_children(_position_box)
	var rows: Array = Game.history.position_rows(_scenario_id, _dataset)
	if rows.is_empty():
		_position_box.add_child(SmaKit.muted(I18n.t("history.noPositions")))
		return
	for row in rows:
		_position_box.add_child(SmaKit.data_row([
			String(row["symbol"]), SmaFormat.quantity(float(row["qty"])),
			SmaFormat.num(float(row["avgCost"]), 2), SmaFormat.num(float(row["last"]), 2),
			SmaFormat.signed_money(float(row["unrealized"])),
		], [0.8, 0.7, 0.9, 0.9, 1.1], [SmaUiTheme.ACCENT, SmaUiTheme.TEXT,
			SmaUiTheme.MUTED, SmaUiTheme.TEXT, SmaKit.value_color(float(row["unrealized"]))],
			[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))


func _update_summary(summary: Dictionary) -> void:
	var values := {
		"equity": SmaFormat.money(float(summary["equity"])),
		"pnl": SmaFormat.signed_money(float(summary["equity"]) - float(summary["initialCash"])),
		"benchmark": SmaFormat.pct(float(summary["benchmarkPct"])),
		"cash": SmaFormat.money(float(summary["cash"])),
		"drawdown": SmaFormat.num(float(summary["maxDrawdown"]), 2) + "%",
		"trades": str(int(summary["trades"])),
		"winRate": SmaFormat.num(float(summary["winRate"]), 1) + "%",
	}
	for key in values.keys():
		if _summary_labels.has(key):
			_summary_labels[key].text = String(values[key])
	if _summary_labels.has("pnl"):
		_summary_labels["pnl"].add_theme_color_override("font_color",
			SmaKit.value_color(float(summary["returnPct"])))


func _update_events(day: int) -> void:
	SmaKit.clear_children(_event_list)
	var date := SmaHistoryService.current_date(_dataset, day)
	var events: Array = Game.history.events_up_to(_scenario_id, date)
	if events.is_empty():
		_event_list.add_child(SmaKit.muted(I18n.t("history.eventsEmpty")))
		return
	var start := maxi(0, events.size() - 4)
	for index in range(events.size() - 1, start - 1, -1):
		var event: Dictionary = events[index]
		var card := SmaKit.card(8)
		var box := SmaKit.vbox(2)
		card.add_child(box)
		var tone_color := SmaUiTheme.MUTED
		if String(event.get("tone", "")) == "down":
			tone_color = SmaUiTheme.NEGATIVE
		elif String(event.get("tone", "")) == "up":
			tone_color = SmaUiTheme.POSITIVE
		box.add_child(SmaKit.label("%s · %s" % [String(event.get("date", "")),
			I18n.t(String(event.get("titleKey", "")))], 12, tone_color))
		var text := SmaKit.muted(I18n.t(String(event.get("textKey", ""))), 11)
		text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		box.add_child(text)
		_event_list.add_child(card)


func _update_ticket_estimate() -> void:
	if _estimate_label == null:
		return
	if _selected_symbol == "" or _dataset.is_empty():
		_estimate_label.text = "—"
		return
	var run_data := Game.history.run(_scenario_id)
	if run_data.is_empty():
		return
	var quote := SmaHistoryService.quote_at_tick(_dataset, _selected_symbol,
		int(run_data.get("dayIndex", 0)), int(run_data.get("tick", 0)))
	var value := float(quote.get("last", 0.0)) * float(_qty.value if _qty != null else 0)
	_estimate_label.text = SmaFormat.money(value)
