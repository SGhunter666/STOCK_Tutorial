## Macro dashboard: deterministic cycle, economic calendar and global market
## linkages. Unlocks after Unit 13.
class_name SmaMacroScreen
extends SmaScreen

var _body: VBoxContainer


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
	if not SmaAcademy.is_unit_complete(game.academy, "u13"):
		_render_locked()
		return
	var world: Dictionary = game.macro_snapshot()
	_render_header(world)
	_render_stats(world)
	_render_regime(world)
	_render_calendar()
	_render_global()
	_body.add_child(SmaKit.muted(I18n.t("macroPage.note"), 10))


func _render_locked() -> void:
	var card := SmaKit.card(20)
	var box := SmaKit.vbox(10)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("macroPage.lockedTitle"), 20))
	var text := SmaKit.muted(I18n.t("macroPage.lockedText"), 13)
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(text)
	box.add_child(SmaKit.muted(I18n.t("macroPage.lockedHint"), 12))
	box.add_child(SmaKit.button(I18n.t("macroPage.goAcademy"), _go_to_u13, true))
	_body.add_child(card)


func _go_to_u13() -> void:
	var main := get_tree().get_first_node_in_group("main")
	if main == null:
		return
	main.navigate("academy")
	if main._screens.has("academy"):
		main._screens["academy"]._select_unit("u13")


func _render_header(world: Dictionary) -> void:
	var header := SmaKit.hbox(10)
	var title_box := SmaKit.vbox(0)
	title_box.add_child(SmaKit.label(I18n.t("macroPage.title"), 20))
	var subtitle := SmaKit.muted(I18n.t("macroPage.subtitle"), 12)
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	subtitle.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_box.add_child(subtitle)
	header.add_child(title_box)
	header.add_child(SmaKit.hspacer())
	header.add_child(SmaKit.label(I18n.t(SmaMacro.regime_key(
		String(world.get("regime", "neutral")))), 13, SmaUiTheme.ACCENT))
	_body.add_child(header)


func _stat(label_key: String, value: String, sub: String, tone: float = 0.0) -> PanelContainer:
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(2)
	card.add_child(box)
	box.add_child(SmaKit.caption(I18n.t(label_key)))
	box.add_child(SmaKit.label(value, 15,
		SmaKit.value_color(tone) if not is_zero_approx(tone) else SmaUiTheme.TEXT))
	var sub_label := SmaKit.muted(sub, 10)
	sub_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(sub_label)
	return card


func _render_stats(world: Dictionary) -> void:
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	var growth := float(world.get("growth", 0.0))
	var inflation := float(world.get("inflation", 0.0))
	var unemployment := float(world.get("unemployment", 0.0))
	var curve := float(world.get("curve", 0.0))
	var credit := float(world.get("creditSpread", 0.0))
	grid.add_child(_stat("macroPage.policyRate",
		SmaFormat.num(float(world.get("policyRate", 0.0)), 1) + "%",
		I18n.t("macroPage.realRateSub", {
			"value": SmaFormat.num(float(world.get("realRate", 0.0)), 1) + "%"})))
	grid.add_child(_stat("macroPage.inflation",
		SmaFormat.num(inflation, 1) + "%",
		I18n.t(SmaMacro.regime_key(String(world.get("regime", "neutral")))),
		-1.0 if inflation > 3.0 else 0.0))
	grid.add_child(_stat("macroPage.growth",
		SmaFormat.num(growth, 1) + "%",
		I18n.t("macroPage.confidenceSub", {
			"value": SmaFormat.num(float(world.get("confidence", 0.0)), 1)}),
		1.0 if growth >= 2.1 else -1.0))
	grid.add_child(_stat("macroPage.unemployment",
		SmaFormat.num(unemployment, 1) + "%",
		I18n.t("macroPage.riskAppetiteSub", {"value": int(world.get("riskAppetite", 0))}),
		-1.0 if unemployment > 5.2 else 1.0))
	grid.add_child(_stat("macroPage.yieldCurve",
		SmaFormat.num(curve, 2) + "%",
		I18n.t("macroPage.yieldSub", {
			"two": SmaFormat.num(float(world.get("yield2", 0.0)), 2),
			"ten": SmaFormat.num(float(world.get("yield10", 0.0)), 2)}),
		-1.0 if curve < 0.0 else 0.0))
	grid.add_child(_stat("macroPage.creditSpread",
		SmaFormat.num(credit, 2) + "%", I18n.t("macroPage.creditSub"),
		-1.0 if credit > 2.0 else 0.0))
	_body.add_child(grid)


func _render_regime(world: Dictionary) -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("macroPage.regimeTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t(SmaMacro.regime_key(
		String(world.get("regime", "neutral")))), 12))
	for spec in [
		["macroPage.realRate", SmaFormat.num(float(world.get("realRate", 0.0)), 1) + "%"],
		["macroPage.confidence", SmaFormat.num(float(world.get("confidence", 0.0)), 1)],
		["macroPage.policyBias", I18n.t("macroPage.easy"
			if float(world.get("realRate", 0.0)) < 0.0
			else ("macroPage.tight" if float(world.get("inflation", 0.0)) > 3.0
				else "macroPage.neutralBias"))],
		["macroPage.riskAppetiteLabel", "%d / 100" % int(world.get("riskAppetite", 0))],
	]:
		var row := SmaKit.hbox(6)
		row.add_child(SmaKit.caption(I18n.t(String(spec[0]))))
		row.add_child(SmaKit.hspacer())
		row.add_child(SmaKit.label(String(spec[1]), 12))
		box.add_child(row)
	box.add_child(SmaKit.muted(I18n.t("macroPage.regimeNote"), 10))
	_body.add_child(card)


func _render_calendar() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(6)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("macroPage.calendarTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("macroPage.calendarSubtitle"), 11))
	var events: Array = game.macro_calendar()
	if events.is_empty():
		box.add_child(SmaKit.muted(I18n.t("macroPage.calendarEmpty"), 11))
		_body.add_child(card)
		return
	var header := SmaKit.hbox(8)
	for spec in [["macroPage.date", 1.0], ["macroPage.eventLabel", 1.2],
			["macroPage.forecast", 0.8], ["macroPage.actual", 0.8],
			["macroPage.surprise", 0.9], ["macroPage.impact", 0.9],
			["macroPage.status", 0.8]]:
		header.add_child(SmaKit.cell(I18n.t(String(spec[0])), float(spec[1]),
			HORIZONTAL_ALIGNMENT_LEFT if String(spec[0]) == "macroPage.date" \
				else HORIZONTAL_ALIGNMENT_RIGHT, SmaUiTheme.MUTED, 10))
	box.add_child(header)
	for event in events:
		var type := String(event.get("type", ""))
		var payrolls := type == "payrolls"
		var digits := 0 if payrolls else 1
		var released := bool(event.get("released", false))
		var line := SmaKit.hbox(8)
		line.add_child(SmaKit.cell(SmaCalendar.iso_date(int(event.get("day", 0))), 1.0,
			HORIZONTAL_ALIGNMENT_LEFT, SmaUiTheme.MUTED, 11))
		line.add_child(SmaKit.cell(I18n.t("macroPage.event.%s" % type), 1.2,
			HORIZONTAL_ALIGNMENT_LEFT, SmaUiTheme.TEXT, 11))
		line.add_child(SmaKit.cell(SmaFormat.num(float(event.get("forecast", 0.0)), digits),
			0.8, HORIZONTAL_ALIGNMENT_RIGHT, SmaUiTheme.TEXT, 11))
		line.add_child(SmaKit.cell(SmaFormat.num(float(event.get("actual", 0.0)), digits) \
			if released else "—", 0.8, HORIZONTAL_ALIGNMENT_RIGHT, SmaUiTheme.TEXT, 11))
		line.add_child(SmaKit.cell(SmaFormat.pct(float(event.get("surprise", 0.0)), 1) \
			if released else "—", 0.9, HORIZONTAL_ALIGNMENT_RIGHT,
			SmaKit.value_color(float(event.get("surprise", 0.0))), 11))
		line.add_child(SmaKit.cell(SmaFormat.pct(float(event.get("impactPct", 0.0)), 2) \
			if released else "—", 0.9, HORIZONTAL_ALIGNMENT_RIGHT,
			SmaKit.value_color(float(event.get("impactPct", 0.0))), 11))
		line.add_child(SmaKit.cell(I18n.t("macroPage.released" if released \
			else "macroPage.upcoming"), 0.8, HORIZONTAL_ALIGNMENT_RIGHT,
			SmaUiTheme.POSITIVE if released else SmaUiTheme.MUTED, 10))
		box.add_child(line)
	box.add_child(SmaKit.muted(I18n.t("macroPage.calendarNote"), 10))
	_body.add_child(card)


func _render_global() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(6)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("macroPage.globalTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("macroPage.globalSubtitle"), 11))
	var header := SmaKit.hbox(8)
	for spec in [["macroPage.regionLabel", 1.4], ["macroPage.level", 1.1],
			["macroPage.change", 1.0], ["macroPage.coupling", 1.0]]:
		header.add_child(SmaKit.cell(I18n.t(String(spec[0])), float(spec[1]),
			HORIZONTAL_ALIGNMENT_LEFT if String(spec[0]) == "macroPage.regionLabel" \
				else HORIZONTAL_ALIGNMENT_RIGHT, SmaUiTheme.MUTED, 10))
	box.add_child(header)
	for row in game.global_markets():
		var line := SmaKit.hbox(8)
		line.add_child(SmaKit.cell(I18n.t(String(row.get("nameKey", ""))), 1.4,
			HORIZONTAL_ALIGNMENT_LEFT, SmaUiTheme.TEXT, 11))
		line.add_child(SmaKit.cell(SmaFormat.num(float(row.get("level", 0.0)), 2), 1.1,
			HORIZONTAL_ALIGNMENT_RIGHT, SmaUiTheme.TEXT, 11))
		line.add_child(SmaKit.cell(SmaFormat.pct(float(row.get("changePct", 0.0)), 2), 1.0,
			HORIZONTAL_ALIGNMENT_RIGHT, SmaKit.value_color(float(row.get("changePct", 0.0))), 11))
		line.add_child(SmaKit.cell(SmaFormat.num(float(row.get("coupling", 0.0)) * 100.0, 0) + "%",
			1.0, HORIZONTAL_ALIGNMENT_RIGHT, SmaUiTheme.MUTED, 11))
		box.add_child(line)
	box.add_child(SmaKit.muted(I18n.t("macroPage.globalNote"), 10))
	_body.add_child(card)
