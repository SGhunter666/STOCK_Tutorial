## Timeline replay: scrub through past sessions, rebuild the stock book at any
## day and inspect the recorded equity curve, positions and events.
class_name SmaReplayScreen
extends SmaScreen

var _body: VBoxContainer
var _selected_day := -1
var _playing := false
var _accum := 0.0


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
	visibility_changed.connect(func():
		if not is_visible_in_tree():
			_playing = false)


func _process(delta: float) -> void:
	if not _playing or not is_visible_in_tree() or game == null or not game.started:
		return
	_accum += delta
	if _accum < 0.45:
		return
	_accum = 0.0
	var maximum: int = game.replay_max_day()
	if _selected_day >= maximum:
		_playing = false
		return
	_selected_day += 1
	refresh()


func refresh(_reason: String = "") -> void:
	if not built:
		return
	SmaKit.clear_children(_body)
	if game == null or not game.started:
		return
	var maximum: int = game.replay_max_day()
	if _selected_day < 0 or _selected_day > maximum:
		_selected_day = maximum
	var snapshot: Dictionary = game.replay_snapshot(_selected_day)
	_render_header(maximum)
	_render_controls(maximum)
	_render_stats(snapshot)
	_render_chart(snapshot)
	_render_positions(snapshot)
	_render_events(snapshot)
	_body.add_child(SmaKit.muted(I18n.t("replay.note"), 10))


func _render_header(maximum: int) -> void:
	var header := SmaKit.hbox(10)
	var titles := SmaKit.vbox(2)
	titles.add_child(SmaKit.label(I18n.t("replay.title"), 20))
	titles.add_child(SmaKit.muted(I18n.t("replay.subtitle"), 12))
	header.add_child(titles)
	header.add_child(SmaKit.hspacer())
	header.add_child(SmaKit.label(I18n.t("replay.dayBadge", {
		"day": SmaCalendar.iso_date(_selected_day),
		"max": SmaCalendar.iso_date(maximum),
	}), 11, SmaUiTheme.ACCENT))
	_body.add_child(header)


func _render_controls(maximum: int) -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(6)
	card.add_child(box)
	var row := SmaKit.hbox(8)
	var previous := SmaKit.button(I18n.t("replay.prev"), _previous)
	previous.disabled = _selected_day <= 0
	row.add_child(previous)
	row.add_child(SmaKit.button(I18n.t("replay.pause" if _playing else "replay.play"),
		_toggle_play, true))
	var next := SmaKit.button(I18n.t("replay.next"), _next)
	next.disabled = _selected_day >= maximum
	row.add_child(next)
	var latest := SmaKit.button(I18n.t("replay.latest"), _latest)
	latest.disabled = _selected_day >= maximum
	row.add_child(latest)
	row.add_child(SmaKit.hspacer())
	row.add_child(SmaKit.muted(I18n.t("replay.dayLabel"), 11))
	box.add_child(row)
	var slider := HSlider.new()
	slider.min_value = 0
	slider.max_value = maximum
	slider.step = 1
	slider.value = _selected_day
	slider.custom_minimum_size.y = 26
	slider.value_changed.connect(func(value):
		_selected_day = int(value)
		_playing = false)
	slider.drag_ended.connect(func(_changed):
		refresh())
	box.add_child(slider)
	_body.add_child(card)


func _previous() -> void:
	_selected_day = maxi(0, _selected_day - 1)
	_playing = false
	refresh()


func _next() -> void:
	_selected_day = mini(game.replay_max_day(), _selected_day + 1)
	_playing = false
	refresh()


func _latest() -> void:
	_selected_day = game.replay_max_day()
	_playing = false
	refresh()


func _toggle_play() -> void:
	_playing = not _playing
	_accum = 0.0
	if _playing and _selected_day >= game.replay_max_day():
		_selected_day = 0
	refresh()


func _render_stats(snapshot: Dictionary) -> void:
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_child(_stat("replay.equity", SmaFormat.money(float(snapshot["equity"])),
		float(snapshot["equity"])))
	grid.add_child(_stat("replay.dailyPnl", SmaFormat.signed_money(float(
		snapshot["dailyPnl"])), float(snapshot["dailyPnl"])))
	grid.add_child(_stat("replay.stockValue", SmaFormat.money(float(
		snapshot["stockValue"])), 0.0))
	grid.add_child(_stat("replay.positions", SmaFormat.num(float(
		snapshot["positions"].size()), 0), 0.0))
	_body.add_child(grid)


func _stat(label_key: String, value: String, tone: float) -> PanelContainer:
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(2)
	card.add_child(box)
	box.add_child(SmaKit.caption(I18n.t(label_key)))
	box.add_child(SmaKit.label(value, 15, SmaKit.value_color(tone) if tone != 0.0
		else SmaUiTheme.TEXT))
	return card


func _render_chart(snapshot: Dictionary) -> void:
	var curve: Array = snapshot.get("curve", [])
	if curve.size() < 2:
		return
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("replay.chartTitle"), 14))
	var chart := SmaLineChart.new()
	chart.custom_minimum_size.y = 170
	box.add_child(chart)
	var values: Array = []
	for point in curve:
		values.append(float(point["equity"]))
	chart.set_series(values, SmaUiTheme.ACCENT, "money",
		SmaCalendar.iso_date(int(curve[0]["day"])),
		SmaCalendar.iso_date(int(curve[-1]["day"])))
	box.add_child(SmaKit.muted(I18n.t("replay.chartNote"), 10))
	_body.add_child(card)


func _render_positions(snapshot: Dictionary) -> void:
	var positions: Array = snapshot.get("positions", [])
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("replay.positionsTitle"), 14))
	if positions.is_empty():
		box.add_child(SmaKit.muted(I18n.t("replay.noPositions"), 11))
	else:
		box.add_child(SmaKit.header_row(
			["replay.ticker", "replay.qty", "replay.avgCost", "replay.close",
				"replay.value", "replay.pnl"],
			[1.0, 0.7, 1.0, 1.0, 1.0, 1.0],
			[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))
		for row in positions:
			var pnl := float(row["pnl"])
			box.add_child(SmaKit.data_row([
				String(row["ticker"]), SmaFormat.num(float(row["qty"]), 0),
				SmaFormat.money(float(row["avgCost"])),
				SmaFormat.money(float(row["close"])),
				SmaFormat.money(float(row["value"])),
				SmaFormat.signed_money(pnl),
			], [1.0, 0.7, 1.0, 1.0, 1.0, 1.0],
			[SmaUiTheme.TEXT, SmaUiTheme.TEXT, SmaUiTheme.MUTED, SmaUiTheme.TEXT,
				SmaUiTheme.TEXT, SmaKit.value_color(pnl)],
			[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))
	_body.add_child(card)


func _render_events(snapshot: Dictionary) -> void:
	var events: Array = snapshot.get("events", [])
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("replay.eventsTitle"), 14))
	if events.is_empty():
		box.add_child(SmaKit.muted(I18n.t("replay.noEvents"), 11))
	for event in events:
		var kind := String(event.get("kind", ""))
		var line := SmaKit.hbox(8)
		line.add_child(SmaKit.label(I18n.t("replay.kind.%s" % kind), 11,
			SmaUiTheme.ACCENT))
		line.add_child(SmaKit.label(String(event.get("ticker", "")), 11))
		line.add_child(SmaKit.hspacer())
		if event.has("qty"):
			line.add_child(SmaKit.muted(SmaFormat.num(float(event["qty"]), 0), 10))
		if event.has("side"):
			var side := String(event["side"])
			var side_key := "trade.%s" % side
			line.add_child(SmaKit.muted(I18n.t(side_key) if I18n.has_key(side_key)
				else side, 10))
		if event.has("action"):
			line.add_child(SmaKit.muted(I18n.t("corporate.type.%s" % String(
				event["action"])), 10))
		line.add_child(SmaKit.label(SmaFormat.money(float(event.get("amount", 0.0))), 10))
		box.add_child(line)
	_body.add_child(card)
