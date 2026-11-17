## ETF desk. Funds are basket products priced by the exchange order book and
## marked to basket NAV at every session close. Trading uses the same order
## pipeline, cash and position ledger as single stocks.
class_name SmaEtfScreen
extends SmaScreen

var _body: VBoxContainer
var _selected := "MKT"
var _qty: SpinBox
var _feedback: Label


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
	_qty = null
	_feedback = null
	if game == null or not game.started:
		return
	_render_header()
	_render_summary()
	_render_list()
	_render_detail()
	_render_positions()
	_body.add_child(SmaKit.muted(I18n.t("etf.note"), 10))


func _render_header() -> void:
	var header := SmaKit.vbox(2)
	header.add_child(SmaKit.label(I18n.t("etf.title"), 20))
	var subtitle := SmaKit.muted(I18n.t("etf.subtitle"), 12)
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	header.add_child(subtitle)
	_body.add_child(header)


func _render_summary() -> void:
	var rows: Array = game.etf_rows()
	var total_premium := 0.0
	var holdings_value := 0.0
	var count := rows.size()
	for row in rows:
		total_premium += float(row["premium"])
	for position in game.exchange.position_rows():
		if SmaEtfs.is_etf(String(position["ticker"])):
			holdings_value += float(position["marketValue"])
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_child(_stat("etf.stats.count", SmaFormat.num(float(count), 0), "etf.stats.countSub", SmaUiTheme.TEXT))
	grid.add_child(_stat("etf.stats.premium",
		SmaFormat.pct(total_premium / float(maxi(1, count)), 2), "etf.stats.premiumSub",
		SmaKit.value_color(total_premium)))
	grid.add_child(_stat("etf.stats.holdings", SmaFormat.money(holdings_value), "etf.stats.holdingsSub", SmaUiTheme.TEXT))
	grid.add_child(_stat("etf.stats.cash", SmaFormat.money(float(game.exchange.state["account"]["cash"])),
		"etf.stats.cashSub", SmaUiTheme.TEXT))
	_body.add_child(grid)


func _stat(label_key: String, value: String, sub_key: String, color: Color) -> PanelContainer:
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(2)
	card.add_child(box)
	box.add_child(SmaKit.caption(I18n.t(label_key)))
	box.add_child(SmaKit.label(value, 15, color))
	box.add_child(SmaKit.muted(I18n.t(sub_key), 10))
	return card


func _render_list() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("etf.listTitle"), 15))
	box.add_child(SmaKit.header_row(
		["etf.name", "etf.price", "etf.nav", "etf.premium", "etf.change", "etf.expense", "etf.volume"],
		[2.2, 0.9, 0.9, 0.9, 0.9, 0.8, 1.0],
		[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT,
			HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT,
			HORIZONTAL_ALIGNMENT_RIGHT]))
	for row in game.etf_rows():
		var ticker := String(row["ticker"])
		var panel := PanelContainer.new()
		var style := StyleBoxFlat.new()
		style.bg_color = SmaUiTheme.PANEL_ALT if ticker == _selected else SmaUiTheme.PANEL
		style.set_content_margin_all(7)
		style.border_color = SmaUiTheme.ACCENT if ticker == _selected else Color(0, 0, 0, 0)
		style.set_border_width_all(1)
		style.set_corner_radius_all(6)
		panel.add_theme_stylebox_override("panel", style)
		panel.mouse_filter = Control.MOUSE_FILTER_STOP
		panel.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		panel.gui_input.connect(_on_row_input.bind(ticker))
		var premium := float(row["premium"])
		var change := float(row["changePct"])
		var line := SmaKit.data_row([
			"%s · %s" % [ticker, String(row["name"])],
			SmaFormat.money(float(row["last"])),
			SmaFormat.money(float(row["nav"])),
			SmaFormat.pct(premium, 2),
			SmaFormat.pct(change, 2),
			SmaFormat.num(float(row["expenseRatio"]), 2) + "%",
			SmaFormat.compact(float(row["volume"])),
		], [2.2, 0.9, 0.9, 0.9, 0.9, 0.8, 1.0],
		[SmaUiTheme.TEXT, SmaUiTheme.TEXT, SmaUiTheme.TEXT, SmaKit.value_color(premium),
			SmaKit.value_color(change), SmaUiTheme.MUTED, SmaUiTheme.MUTED],
		[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT,
			HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT,
			HORIZONTAL_ALIGNMENT_RIGHT])
		panel.add_child(line)
		box.add_child(panel)
	_body.add_child(card)


func _on_row_input(event: InputEvent, ticker: String) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_selected = ticker
		refresh()


func _render_detail() -> void:
	var definition := SmaEtfs.definition(_selected)
	if definition.is_empty():
		return
	var quote: Dictionary = game.exchange.quote(_selected)
	var nav_value: float = game.etf_nav(_selected)
	var last := float(quote.get("last", 0.0))
	var premium := SmaEtfs.premium(last, nav_value)
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(7)
	card.add_child(box)
	var head := SmaKit.hbox(10)
	var titles := SmaKit.vbox(1)
	titles.add_child(SmaKit.label("%s · %s" % [_selected, String(definition["name"])], 16))
	titles.add_child(SmaKit.muted(I18n.t("etf.detailSubtitle"), 11))
	head.add_child(titles)
	head.add_child(SmaKit.hspacer())
	head.add_child(SmaKit.label(SmaFormat.pct(premium, 2), 15, SmaKit.value_color(premium)))
	box.add_child(head)

	var metrics := SmaKit.hbox(18)
	metrics.add_child(_metric("etf.price", SmaFormat.money(last)))
	metrics.add_child(_metric("etf.nav", SmaFormat.money(nav_value)))
	metrics.add_child(_metric("etf.bid", SmaFormat.money(float(quote.get("bid", 0.0)))))
	metrics.add_child(_metric("etf.ask", SmaFormat.money(float(quote.get("ask", 0.0)))))
	metrics.add_child(_metric("etf.expense", SmaFormat.num(float(definition["expenseRatio"]), 2) + "%"))
	box.add_child(metrics)
	box.add_child(SmaKit.muted(I18n.t("etf.premiumNote"), 10))

	box.add_child(SmaKit.separator())
	box.add_child(SmaKit.label(I18n.t("etf.holdingsTitle"), 13))
	box.add_child(SmaKit.header_row(
		["etf.holding", "etf.weight", "etf.change", "etf.contribution"],
		[2.4, 1.0, 1.0, 1.0],
		[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT,
			HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))
	for row in game.etf_holdings(_selected):
		var change := float(row["changePct"])
		var contribution := float(row["contribution"])
		box.add_child(SmaKit.data_row([
			"%s · %s" % [String(row["ticker"]), String(row["name"])],
			SmaFormat.num(float(row["weight"]) * 100.0, 1) + "%",
			SmaFormat.pct(change, 2),
			SmaFormat.pct(contribution, 2),
		], [2.4, 1.0, 1.0, 1.0],
		[SmaUiTheme.TEXT, SmaUiTheme.MUTED, SmaKit.value_color(change),
			SmaKit.value_color(contribution)],
		[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT,
			HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))

	box.add_child(SmaKit.separator())
	var trade := SmaKit.hbox(8)
	trade.add_child(SmaKit.label(I18n.t("etf.qty"), 12))
	_qty = SpinBox.new()
	_qty.min_value = 1
	_qty.max_value = 100000
	_qty.step = 1
	_qty.value = 100
	_qty.custom_minimum_size.x = 110
	trade.add_child(_qty)
	trade.add_child(SmaKit.button(I18n.t("etf.buy"), _buy, true))
	trade.add_child(SmaKit.button(I18n.t("etf.sell"), _sell))
	_feedback = SmaKit.muted("", 11)
	trade.add_child(_feedback)
	box.add_child(trade)
	_body.add_child(card)


func _metric(label_key: String, value: String) -> VBoxContainer:
	var box := SmaKit.vbox(0)
	box.add_child(SmaKit.caption(I18n.t(label_key)))
	box.add_child(SmaKit.label(value, 13))
	return box


func _buy() -> void:
	_submit("buy")


func _sell() -> void:
	_submit("sell")


func _submit(side: String) -> void:
	if _qty == null:
		return
	var result: Dictionary = game.submit_order({
		"ticker": _selected, "side": side, "type": "market", "qty": int(_qty.value),
	})
	if bool(result.get("ok", false)):
		_feedback.text = I18n.t("etf.orderSent")
		_feedback.add_theme_color_override("font_color", SmaUiTheme.POSITIVE)
	else:
		_feedback.text = I18n.t("error.%s" % String(result.get("error", "order.invalid")))
		_feedback.add_theme_color_override("font_color", SmaUiTheme.NEGATIVE)
	refresh()


func _render_positions() -> void:
	var rows: Array = []
	for position in game.exchange.position_rows():
		if SmaEtfs.is_etf(String(position["ticker"])):
			rows.append(position)
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("etf.positionTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("etf.positionSubtitle"), 11))
	if rows.is_empty():
		box.add_child(SmaKit.muted(I18n.t("etf.noPositions"), 12))
	else:
		box.add_child(SmaKit.header_row(
			["etf.holding", "etf.positionQty", "etf.positionCost", "etf.positionValue", "etf.positionPnl"],
			[2.0, 0.8, 1.0, 1.0, 1.0],
			[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))
		for row in rows:
			var pnl := float(row["unrealized"])
			box.add_child(SmaKit.data_row([
				"%s · %s" % [String(row["ticker"]), String(row["name"])],
				SmaFormat.num(float(row["qty"]), 0),
				SmaFormat.money(float(row["avgCost"])),
				SmaFormat.money(float(row["marketValue"])),
				SmaFormat.signed_money(pnl),
			], [2.0, 0.8, 1.0, 1.0, 1.0],
			[SmaUiTheme.TEXT, SmaUiTheme.TEXT, SmaUiTheme.MUTED, SmaUiTheme.TEXT,
				SmaKit.value_color(pnl)],
			[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))
	_body.add_child(card)
