## Futures desk: single-stock futures with margin, daily variation and cash
## settlement. Trading unlocks after u29 s1.
class_name SmaFuturesScreen
extends SmaScreen

var _ticker := ""
var _expiry_days := 30
var _side := "long"
var _qty := 1
var _chain: Dictionary = {}
var _body: VBoxContainer
var _ticket_refs: Dictionary = {}
var _positions_body: VBoxContainer
var _feedback: Label
var _submit_button: Button
var _qty_spin: SpinBox
var _ticker_option: OptionButton


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
	_ticket_refs.clear()
	_positions_body = null
	_feedback = null
	_submit_button = null
	_qty_spin = null
	if game == null or not game.started:
		return
	if not game.academy_is_tool_unlocked("trade.futures"):
		_render_locked()
		return
	_ensure_ticker()
	_chain = game.futures_chain(_ticker)
	if _chain.is_empty():
		_body.add_child(SmaKit.muted(I18n.t("futures.noContract")))
		return
	_render_header()
	_render_chain()
	var columns := SmaKit.hbox(12)
	var ticket := _render_ticket()
	ticket.custom_minimum_size.x = 340
	columns.add_child(ticket)
	var positions := _render_positions()
	positions.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	columns.add_child(positions)
	_body.add_child(columns)
	_render_notes()


func on_tick() -> void:
	if game == null or not game.started or _chain.is_empty():
		return
	_update_ticket()
	_refresh_positions()


func _render_locked() -> void:
	var card := SmaKit.card(20)
	var box := SmaKit.vbox(10)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("futures.lockedTitle"), 20))
	var text := SmaKit.muted(I18n.t("futures.lockedText"), 13)
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(text)
	box.add_child(SmaKit.button(I18n.t("futures.lockedAction"), _go_to_u29, true))
	_body.add_child(card)


func _go_to_u29() -> void:
	var main := get_tree().get_first_node_in_group("main")
	if main == null:
		return
	main.navigate("academy")
	if main._screens.has("academy"):
		main._screens["academy"]._select_unit("u29")


func _ensure_ticker() -> void:
	var companies := SmaCompanyCatalog.load_companies()
	if companies.has(_ticker):
		return
	var preferred := String(game.selected_ticker) if game.selected_ticker != null else ""
	if companies.has(preferred):
		_ticker = preferred
		return
	var tickers := companies.keys()
	tickers.sort()
	_ticker = String(tickers[0]) if not tickers.is_empty() else ""


func _render_header() -> void:
	var header := SmaKit.hbox(10)
	var title_box := SmaKit.vbox(0)
	title_box.add_child(SmaKit.label(I18n.t("futures.title"), 20))
	title_box.add_child(SmaKit.muted(I18n.t("futures.subtitle"), 12))
	header.add_child(title_box)
	header.add_child(SmaKit.hspacer())
	var companies := SmaCompanyCatalog.load_companies()
	var tickers := companies.keys()
	tickers.sort()
	var option := OptionButton.new()
	option.custom_minimum_size.x = 220
	var selected_index := 0
	for index in tickers.size():
		var ticker := String(tickers[index])
		option.add_item("%s · %s" % [ticker, String(companies[ticker].get("name", ticker))])
		option.set_item_metadata(index, ticker)
		if ticker == _ticker:
			selected_index = index
	option.select(selected_index)
	option.item_selected.connect(_on_ticker_changed)
	_ticker_option = option
	header.add_child(option)
	var group := ButtonGroup.new()
	for days in SmaFutures.EXPIRY_DAYS:
		var button := SmaKit.toggle(I18n.t("options.expiryOption", {"days": days}), group)
		button.button_pressed = int(days) == _expiry_days
		button.pressed.connect(_on_expiry_changed.bind(int(days)))
		header.add_child(button)
	_body.add_child(header)


func _on_ticker_changed(index: int) -> void:
	if _ticker_option == null or index < 0:
		return
	_ticker = String(_ticker_option.get_item_metadata(index))
	refresh()


func _on_expiry_changed(days: int) -> void:
	_expiry_days = days
	refresh()


func _render_chain() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(6)
	card.add_child(box)
	var title_row := SmaKit.hbox(8)
	title_row.add_child(SmaKit.label(I18n.t("futures.chainTitle"), 15))
	title_row.add_child(SmaKit.hspacer())
	title_row.add_child(SmaKit.muted(I18n.t("futures.chainSubtitle", {
		"ticker": _ticker}), 12))
	box.add_child(title_row)
	var header := SmaKit.hbox(8)
	for spec in [["futures.expiry", 1.0], ["futures.price", 1.0],
			["futures.basis", 1.0], ["futures.marginPer", 1.0]]:
		header.add_child(SmaKit.cell(I18n.t(String(spec[0])), float(spec[1]),
			HORIZONTAL_ALIGNMENT_LEFT if String(spec[0]) == "futures.expiry" \
				else HORIZONTAL_ALIGNMENT_RIGHT, SmaUiTheme.MUTED, 10))
	box.add_child(header)
	for entry in _chain.get("expiries", []):
		var selected := int(entry.get("days", 0)) == _expiry_days
		var color := SmaUiTheme.ACCENT if selected else SmaUiTheme.TEXT
		var line := SmaKit.hbox(8)
		line.add_child(SmaKit.cell(I18n.t("options.expiryOption", {
			"days": int(entry.get("days", 0))}), 1.0, HORIZONTAL_ALIGNMENT_LEFT, color, 12))
		line.add_child(SmaKit.cell(SmaFormat.money(float(entry.get("price", 0.0))), 1.0,
			HORIZONTAL_ALIGNMENT_RIGHT, color, 12))
		line.add_child(SmaKit.cell(SmaFormat.signed_money(float(entry.get("basis", 0.0))),
			1.0, HORIZONTAL_ALIGNMENT_RIGHT, SmaUiTheme.MUTED, 12))
		line.add_child(SmaKit.cell(SmaFormat.money(float(entry.get("margin", 0.0))), 1.0,
			HORIZONTAL_ALIGNMENT_RIGHT, SmaUiTheme.MUTED, 12))
		box.add_child(line)
	box.add_child(SmaKit.muted(I18n.t("futures.chainNote", {
		"size": SmaFutures.MULTIPLIER}), 10))
	_body.add_child(card)


func _contract() -> Dictionary:
	return SmaFutures.find_contract(_chain, _expiry_days)


func _render_ticket() -> PanelContainer:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(7)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("futures.ticketTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("futures.ticketSubtitle"), 11))
	var side_row := SmaKit.hbox(6)
	var group := ButtonGroup.new()
	var long_toggle := SmaKit.toggle(I18n.t("futures.long"), group)
	long_toggle.button_pressed = _side == "long"
	long_toggle.pressed.connect(_set_side.bind("long"))
	side_row.add_child(long_toggle)
	var short_toggle := SmaKit.toggle(I18n.t("futures.short"), group)
	short_toggle.button_pressed = _side == "short"
	short_toggle.pressed.connect(_set_side.bind("short"))
	side_row.add_child(short_toggle)
	side_row.add_child(SmaKit.hspacer())
	box.add_child(side_row)
	var qty_row := SmaKit.hbox(6)
	qty_row.add_child(SmaKit.caption(I18n.t("futures.contracts")))
	qty_row.add_child(SmaKit.hspacer())
	_qty_spin = SpinBox.new()
	_qty_spin.min_value = 1
	_qty_spin.max_value = 10000
	_qty_spin.step = 1
	_qty_spin.value = _qty
	_qty_spin.custom_minimum_size.x = 110
	_qty_spin.value_changed.connect(_on_qty_changed)
	qty_row.add_child(_qty_spin)
	box.add_child(qty_row)
	_ticket_refs["room"] = SmaKit.muted("", 10)
	box.add_child(_ticket_refs["room"])
	for spec in [["price", "futures.price"], ["notional", "futures.notional"],
			["margin", "futures.marginRequired"]]:
		_ticket_refs[String(spec[0])] = _value_row(box, String(spec[1]))
	_feedback = SmaKit.muted("", 11)
	_feedback.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(_feedback)
	_submit_button = SmaKit.button(I18n.t("futures.openButton"), _submit, true)
	box.add_child(_submit_button)
	var fee_note := SmaKit.muted(I18n.t("futures.feeNote", {
		"fee": SmaFormat.money(_fee_for_contract(1))}), 10)
	fee_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(fee_note)
	_update_ticket()
	return card


func _value_row(box: VBoxContainer, label_key: String) -> Label:
	var row := SmaKit.hbox(6)
	row.add_child(SmaKit.caption(I18n.t(label_key)))
	row.add_child(SmaKit.hspacer())
	var value := SmaKit.label("—", 12)
	row.add_child(value)
	box.add_child(row)
	return value


func _set_side(side: String) -> void:
	if _side == side:
		return
	_side = side
	refresh()


func _on_qty_changed(value: float) -> void:
	_qty = maxi(1, int(value))
	if _qty_spin != null:
		_qty_spin.value = _qty
	_update_ticket()


func _fee_for_contract(qty: int) -> float:
	var contract := _contract()
	if contract.is_empty():
		return 0.0
	return game.futures_fee(contract, qty)


func _update_ticket() -> void:
	if _ticket_refs.is_empty() or _qty_spin == null:
		return
	var contract := _contract()
	if contract.is_empty():
		return
	var qty := int(_qty_spin.value)
	var price := float(contract.get("price", 0.0))
	var notional := price * SmaFutures.MULTIPLIER * qty
	var margin := float(contract.get("margin", 0.0)) * qty
	var room: float = game.available_futures_cash()
	_ticket_refs["room"].text = I18n.t("futures.cashAvailable", {
		"value": SmaFormat.money(room)})
	_ticket_refs["price"].text = SmaFormat.money(price)
	_ticket_refs["notional"].text = SmaFormat.money(notional)
	_ticket_refs["margin"].text = SmaFormat.money(margin)
	var error := ""
	if margin > room + 0.000000001:
		error = "error.insufficientFuturesMargin"
	if _submit_button != null:
		_submit_button.disabled = error != ""
	if _feedback != null:
		_feedback.text = I18n.t(error) if error != "" else ""
		_feedback.add_theme_color_override("font_color", SmaUiTheme.NEGATIVE)


func _submit() -> void:
	var result: Dictionary = game.open_future(_ticker, _expiry_days, _side,
		int(_qty_spin.value))
	if not bool(result.get("ok", false)):
		if _feedback != null:
			_feedback.text = I18n.t(String(result.get("error", "error.priceInvalid")))
		return
	game.toast(I18n.t("toast.future_opened"))
	refresh()


func _render_positions() -> PanelContainer:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(7)
	card.add_child(box)
	var rows: Array = game.futures_rows()
	box.add_child(SmaKit.label(I18n.t("futures.positionsTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("futures.positionsSubtitle", {
		"count": rows.size()}), 11))
	_positions_body = SmaKit.vbox(4)
	box.add_child(_positions_body)
	_refresh_positions()
	return card


func _refresh_positions() -> void:
	if _positions_body == null:
		return
	SmaKit.clear_children(_positions_body)
	var rows: Array = game.futures_rows()
	if rows.is_empty():
		_positions_body.add_child(SmaKit.muted(I18n.t("futures.noPositions"), 12))
		return
	var header := SmaKit.hbox(8)
	for spec in [["contract", "futures.contract", 2.0], ["qty", "futures.contracts", 0.6],
			["entry", "futures.entry", 0.9], ["current", "futures.current", 0.9],
			["pnl", "futures.pnl", 1.0], ["margin", "futures.margin", 0.9]]:
		var cell := SmaKit.cell(I18n.t(String(spec[1])), float(spec[2]),
			HORIZONTAL_ALIGNMENT_RIGHT if String(spec[0]) != "contract" else HORIZONTAL_ALIGNMENT_LEFT,
			SmaUiTheme.MUTED, 10)
		header.add_child(cell)
	_positions_body.add_child(header)
	for row in rows:
		var line := SmaKit.hbox(8)
		var side_key := "futures.long" if String(row["side"]) == "long" else "futures.short"
		line.add_child(SmaKit.cell("%s · %s" % [row["ticker"], I18n.t(side_key)], 2.0,
			HORIZONTAL_ALIGNMENT_LEFT, SmaUiTheme.TEXT, 11))
		line.add_child(SmaKit.cell(SmaFormat.num(float(row["qty"]), 0), 0.6,
			HORIZONTAL_ALIGNMENT_RIGHT, SmaUiTheme.TEXT, 11))
		line.add_child(SmaKit.cell(SmaFormat.money(float(row["entryPrice"])), 0.9,
			HORIZONTAL_ALIGNMENT_RIGHT, SmaUiTheme.MUTED, 11))
		line.add_child(SmaKit.cell(SmaFormat.money(float(row["currentPrice"])), 0.9,
			HORIZONTAL_ALIGNMENT_RIGHT, SmaUiTheme.TEXT, 11))
		line.add_child(SmaKit.cell(SmaFormat.signed_money(float(row["unrealized"])), 1.0,
			HORIZONTAL_ALIGNMENT_RIGHT, SmaKit.value_color(float(row["unrealized"])), 11))
		line.add_child(SmaKit.cell(SmaFormat.money(float(row["margin"])), 0.9,
			HORIZONTAL_ALIGNMENT_RIGHT, SmaUiTheme.MUTED, 11))
		var close := SmaKit.button(I18n.t("futures.close"),
			_close_position.bind(String(row["key"]), int(row["qty"])))
		close.add_theme_font_size_override("font_size", 10)
		close.custom_minimum_size.x = 54
		line.add_child(close)
		_positions_body.add_child(line)


func _close_position(key: String, qty: int) -> void:
	var result: Dictionary = game.close_future(key, qty)
	if not bool(result.get("ok", false)):
		game.toast(I18n.t(String(result.get("error", "error.noFuturesPosition"))))
		return
	game.toast(I18n.t("toast.future_closed"))
	refresh()


func _render_notes() -> void:
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("futures.educationTitle"), 12, SmaUiTheme.ACCENT))
	var text := SmaKit.muted(I18n.t("futures.educationText", {
		"margin": SmaFormat.money(game.futures_margin())}), 11)
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(text)
	var boundary := SmaKit.muted(I18n.t("futures.boundaryText"), 11)
	boundary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(boundary)
	_body.add_child(card)
