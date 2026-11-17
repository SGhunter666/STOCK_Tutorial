## Trading desk: quote header, candle chart, order book, ticket, position and
## working orders. All mutations go through Game actions.
class_name SmaTradeScreen
extends SmaScreen

const TIMEFRAMES := ["1m", "5m", "15m", "1h", "1D"]

var _timeframe := "1m"
var _side := "buy"
var _order_type := "market"
var _side_group := ButtonGroup.new()
var _type_group := ButtonGroup.new()
var _timeframe_group := ButtonGroup.new()
var _timeframe_buttons: Dictionary = {}
var _limit_type_button: Button
var _limit_hint: Label
var _stop_row: HBoxContainer
var _stop_price: SpinBox
var _stop_ticker := ""
var _trail_row: HBoxContainer
var _trail_pct: SpinBox

var _name_label: Label
var _ticker_label: Label
var _meta_label: Label
var _profile_label: Label
var _last_label: Label
var _change_label: Label
var _stat_labels: Dictionary = {}
var _chart: SmaCandleChart
var _book_rows: Array = []
var _book_meta: Label
var _qty: SpinBox
var _limit: SpinBox
var _limit_row: HBoxContainer
var _estimate_label: Label
var _fee_label: Label
var _available_label: Label
var _feedback: Label
var _position_box: VBoxContainer
var _orders_box: VBoxContainer
var _orders_key := ""
var _order_buttons: Dictionary = {}


func _build() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	var root := SmaKit.vbox(12)
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(root)

	var quote_card := SmaKit.card(12)
	var quote_head := SmaKit.hbox(18)
	var identity := SmaKit.vbox(2)
	_ticker_label = SmaKit.label("—", 24, SmaUiTheme.ACCENT)
	_name_label = SmaKit.label("—", 14, SmaUiTheme.MUTED)
	_meta_label = SmaKit.caption("")
	_profile_label = SmaKit.caption("")
	identity.add_child(_ticker_label)
	identity.add_child(_name_label)
	identity.add_child(_meta_label)
	identity.add_child(_profile_label)
	quote_head.add_child(identity)
	quote_head.add_child(SmaKit.hspacer())
	var financials_button := SmaKit.button(I18n.t("financials.open"), _open_financials)
	financials_button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	financials_button.custom_minimum_size.x = 100
	quote_head.add_child(financials_button)
	var last_box := SmaKit.vbox(0)
	_last_label = SmaKit.label("—", 30)
	_change_label = SmaKit.label("—", 14)
	last_box.add_child(_last_label)
	last_box.add_child(_change_label)
	quote_head.add_child(last_box)
	for key in ["high", "low", "bid", "ask", "volume"]:
		var stat := SmaKit.vbox(1)
		var caption_text := I18n.t("market.%s" % key) if key != "high" and key != "low" else I18n.t("market.%s" % key)
		var caption := SmaKit.caption(caption_text)
		var value := SmaKit.label("—", 13)
		stat.add_child(caption)
		stat.add_child(value)
		_stat_labels[key] = value
		quote_head.add_child(stat)
	quote_card.add_child(quote_head)
	root.add_child(quote_card)

	var body := SmaKit.hbox(12)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(body)

	var left := SmaKit.vbox(12)
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_child(left)

	var chart_card := SmaKit.card(10)
	var chart_box := SmaKit.vbox(8)
	chart_card.add_child(chart_box)
	var chart_head := SmaKit.hbox(6)
	chart_head.add_child(SmaKit.label(I18n.t("trade.chart"), 14))
	chart_head.add_child(SmaKit.hspacer())
	for timeframe in TIMEFRAMES:
		var button := SmaKit.toggle(timeframe, _timeframe_group)
		button.custom_minimum_size.x = 44
		button.pressed.connect(_on_timeframe.bind(timeframe))
		_timeframe_buttons[timeframe] = button
		chart_head.add_child(button)
	chart_box.add_child(chart_head)
	_chart = SmaCandleChart.new()
	_chart.custom_minimum_size.y = 290
	chart_box.add_child(_chart)
	left.add_child(chart_card)

	var book_card := SmaKit.card(10)
	var book_box := SmaKit.vbox(4)
	book_card.add_child(book_box)
	var book_top := SmaKit.hbox(10)
	book_top.add_child(SmaKit.label(I18n.t("trade.book"), 13))
	_book_meta = SmaKit.caption("")
	book_top.add_child(_book_meta)
	book_top.add_child(SmaKit.hspacer())
	book_box.add_child(book_top)
	var book_header := SmaKit.hbox(8)
	book_header.add_child(SmaKit.hspacer())
	book_header.add_child(_book_cell(I18n.t("trade.price"), SmaUiTheme.DIM))
	book_header.add_child(_book_cell(I18n.t("trade.volume"), SmaUiTheme.DIM))
	book_box.add_child(book_header)
	var ask_box := SmaKit.vbox(1)
	var bid_box := SmaKit.vbox(1)
	for index in 6:
		var ask_row := SmaKit.hbox(8)
		ask_row.add_child(SmaKit.hspacer())
		var ask_price := _book_cell("—", SmaUiTheme.NEGATIVE)
		var ask_size := _book_cell("—", SmaUiTheme.MUTED)
		ask_row.add_child(ask_price)
		ask_row.add_child(ask_size)
		ask_box.add_child(ask_row)
		var bid_row := SmaKit.hbox(8)
		bid_row.add_child(SmaKit.hspacer())
		var bid_price := _book_cell("—", SmaUiTheme.POSITIVE)
		var bid_size := _book_cell("—", SmaUiTheme.MUTED)
		bid_row.add_child(bid_price)
		bid_row.add_child(bid_size)
		bid_box.add_child(bid_row)
		_book_rows.append({"ask_price": ask_price, "ask_size": ask_size,
			"bid_price": bid_price, "bid_size": bid_size})
	book_box.add_child(ask_box)
	book_box.add_child(SmaKit.separator())
	book_box.add_child(bid_box)
	left.add_child(book_card)

	var right := SmaKit.vbox(12)
	right.custom_minimum_size.x = 360
	right.size_flags_horizontal = Control.SIZE_SHRINK_END
	body.add_child(right)

	var ticket_card := SmaKit.card(12)
	var ticket := SmaKit.vbox(9)
	ticket_card.add_child(ticket)
	ticket.add_child(SmaKit.label(I18n.t("trade.title"), 14))
	var side_row := SmaKit.hbox(4)
	for entry in [["buy", "trade.buy"], ["sell", "trade.sell"], ["short", "trade.short"], ["cover", "trade.cover"]]:
		var button := SmaKit.toggle(I18n.t(String(entry[1])), _side_group)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.pressed.connect(_on_side.bind(String(entry[0])))
		side_row.add_child(button)
	ticket.add_child(side_row)
	var type_row := SmaKit.hbox(4)
	for entry in [["market", "trade.market"], ["limit", "trade.limit"],
			["stop", "trade.stop"], ["trailing", "trade.trailing"]]:
		var button := SmaKit.toggle(I18n.t(String(entry[1])), _type_group)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.pressed.connect(_on_type.bind(String(entry[0])))
		if String(entry[0]) == "limit":
			_limit_type_button = button
		type_row.add_child(button)
	ticket.add_child(type_row)
	_limit_hint = SmaKit.caption("")
	_limit_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	ticket.add_child(_limit_hint)
	var qty_row := SmaKit.hbox(8)
	qty_row.add_child(SmaKit.label(I18n.t("trade.qty"), 12, SmaUiTheme.MUTED))
	qty_row.add_child(SmaKit.hspacer())
	_qty = SpinBox.new()
	_qty.min_value = 1
	_qty.max_value = 1000000
	_qty.step = 1
	_qty.value = 10
	_qty.custom_minimum_size.x = 130
	_qty.value_changed.connect(func(_value): _update_estimate())
	qty_row.add_child(_qty)
	ticket.add_child(qty_row)
	_limit_row = SmaKit.hbox(8)
	_limit_row.add_child(SmaKit.label(I18n.t("trade.limit_price"), 12, SmaUiTheme.MUTED))
	_limit_row.add_child(SmaKit.hspacer())
	_limit = SpinBox.new()
	_limit.min_value = 0.01
	_limit.max_value = 1000000
	_limit.step = 0.01
	_limit.value = 100.0
	_limit.custom_minimum_size.x = 130
	_limit.value_changed.connect(func(_value): _update_estimate())
	_limit_row.add_child(_limit)
	ticket.add_child(_limit_row)
	_stop_row = SmaKit.hbox(8)
	_stop_row.add_child(SmaKit.label(I18n.t("trade.stop_price"), 12, SmaUiTheme.MUTED))
	_stop_row.add_child(SmaKit.hspacer())
	_stop_price = SpinBox.new()
	_stop_price.min_value = 0.01
	_stop_price.max_value = 1000000
	_stop_price.step = 0.01
	_stop_price.value = 95.0
	_stop_price.custom_minimum_size.x = 130
	_stop_price.value_changed.connect(func(_value): _update_estimate())
	_stop_row.add_child(_stop_price)
	ticket.add_child(_stop_row)
	_trail_row = SmaKit.hbox(8)
	_trail_row.add_child(SmaKit.label(I18n.t("trade.trail_pct"), 12, SmaUiTheme.MUTED))
	_trail_row.add_child(SmaKit.hspacer())
	_trail_pct = SpinBox.new()
	_trail_pct.min_value = 0.5
	_trail_pct.max_value = 49.0
	_trail_pct.step = 0.5
	_trail_pct.value = 5.0
	_trail_pct.custom_minimum_size.x = 130
	_trail_pct.value_changed.connect(func(_value): _update_estimate())
	_trail_row.add_child(_trail_pct)
	ticket.add_child(_trail_row)
	ticket.add_child(SmaKit.separator())
	var estimate_row := SmaKit.hbox(8)
	estimate_row.add_child(SmaKit.label(I18n.t("trade.estimate"), 12, SmaUiTheme.MUTED))
	estimate_row.add_child(SmaKit.hspacer())
	_estimate_label = SmaKit.label("—", 13)
	estimate_row.add_child(_estimate_label)
	ticket.add_child(estimate_row)
	var fee_row := SmaKit.hbox(8)
	fee_row.add_child(SmaKit.label(I18n.t("trade.fee"), 12, SmaUiTheme.MUTED))
	fee_row.add_child(SmaKit.hspacer())
	_fee_label = SmaKit.muted("—")
	fee_row.add_child(_fee_label)
	ticket.add_child(fee_row)
	_available_label = SmaKit.caption("")
	ticket.add_child(_available_label)
	var submit := SmaKit.button(I18n.t("trade.submit"), _submit, true)
	submit.custom_minimum_size.y = 38
	ticket.add_child(submit)
	_feedback = SmaKit.muted("")
	_feedback.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	ticket.add_child(_feedback)
	right.add_child(ticket_card)

	var position_card := SmaKit.card(10)
	var position_box := SmaKit.vbox(5)
	position_card.add_child(position_box)
	position_box.add_child(SmaKit.label(I18n.t("trade.position"), 13))
	position_box.add_child(SmaKit.header_row(["common.side", "common.qty",
		"portfolio.avg_cost", "portfolio.unrealized"], [1.0, 0.9, 0.9, 1.2],
		[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT,
			HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))
	_position_box = SmaKit.vbox(3)
	position_box.add_child(_position_box)
	right.add_child(position_card)

	var orders_card := SmaKit.card(10)
	var orders_box := SmaKit.vbox(5)
	orders_card.add_child(orders_box)
	orders_box.add_child(SmaKit.label(I18n.t("trade.open_orders"), 13))
	var order_scroll := SmaKit.scroll(140)
	_orders_box = SmaKit.vbox(3)
	order_scroll.add_child(_orders_box)
	orders_box.add_child(order_scroll)
	right.add_child(orders_card)

	_select_defaults()
	refresh()


func _open_financials() -> void:
	if game == null or not game.started or game.selected_ticker == "":
		return
	var main := get_tree().get_first_node_in_group("main")
	if main == null:
		return
	var dialog := SmaFinancialsDialog.new()
	main.add_child(dialog)
	dialog.closed.connect(func(): refresh("financials"))
	dialog.setup(game, game.selected_ticker)


func _book_cell(text: String, color: Color) -> Label:
	var node := SmaKit.label(text, 11, color)
	node.custom_minimum_size.x = 92
	node.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	node.size_flags_horizontal = Control.SIZE_SHRINK_END
	return node


func _select_defaults() -> void:
	for button in _side_group.get_buttons():
		button.button_pressed = button.text == I18n.t("trade.buy")
	for button in _type_group.get_buttons():
		button.button_pressed = button.text == I18n.t("trade.market")
	for button in _timeframe_group.get_buttons():
		button.button_pressed = button.text == "1m"
	if _limit_row != null:
		_limit_row.visible = false
	if _stop_row != null:
		_stop_row.visible = false
	if _trail_row != null:
		_trail_row.visible = false


func refresh(reason: String = "") -> void:
	if game == null or not game.started or game.exchange == null:
		_set_empty(true)
		return
	_set_empty(false)
	var ticker: String = game.selected_ticker
	var company: Dictionary = game.exchange.company(ticker)
	var quote: Dictionary = game.exchange.quote(ticker)
	var last := float(quote.get("last", 0.0))
	_ticker_label.text = ticker
	_name_label.text = String(company.get("name", ticker))
	_meta_label.text = "%s · %s · %s" % [
		SmaKit.sector_label(String(company.get("sector", ""))),
		SmaKit.liquidity_label(String(company.get("liquidity", ""))),
		SmaKit.style_label(SmaAcademy.style_of(ticker)),
	]
	var financials: Dictionary = company.get("financials", {})
	var dividend_yield := float(financials.get("dividendPerShare", 0.0)) / maxf(0.01, last) * 100.0
	_profile_label.text = "%s %.2f%% · %s %s" % [
		I18n.t("company.dividendYield"), dividend_yield,
		I18n.t("company.marketCap"), SmaFormat.compact(float(company.get("marketCap", 0.0))),
	]
	var change := float(quote.get("changePct", 0.0))
	_last_label.text = SmaFormat.money(last)
	_change_label.text = SmaFormat.pct(change)
	_change_label.add_theme_color_override("font_color", SmaKit.value_color(change))
	_stat_labels["high"].text = SmaFormat.money(float(quote.get("high", 0.0)))
	_stat_labels["low"].text = SmaFormat.money(float(quote.get("low", 0.0)))
	_stat_labels["bid"].text = _price_text(quote.get("bid", null))
	_stat_labels["ask"].text = _price_text(quote.get("ask", null))
	_stat_labels["volume"].text = SmaFormat.compact(float(quote.get("volume", 0)))
	if _limit != null and _order_type == "limit" and _limit.value <= 0.01:
		_limit.value = maxf(0.01, last)
	if _order_type == "stop" and _stop_ticker != ticker:
		_reset_stop_price()
	_update_book(ticker)
	_update_chart(ticker)
	_update_position(ticker)
	_update_orders()
	_update_available()
	_update_estimate()
	_update_limit_gate()


func _update_limit_gate() -> void:
	if _limit_type_button == null or game == null:
		return
	var unlocked: bool = game.academy_is_tool_unlocked("order.limit")
	_limit_type_button.disabled = not unlocked
	_limit_type_button.tooltip_text = "" if unlocked else I18n.t("unlock.limitOrder.title")
	if _limit_hint != null:
		_limit_hint.visible = not unlocked
		_limit_hint.text = I18n.t("academy.lockedByUnit",
			{"unit": I18n.t("curriculum.u4.title")})
	if not unlocked and _order_type == "limit":
		_order_type = "market"
		_limit_row.visible = false


func on_tick() -> void:
	refresh()


func _set_empty(empty: bool) -> void:
	var hint: Control = get_node_or_null("EmptyHint")
	for child in get_children():
		if child.name == "EmptyHint":
			continue
		child.visible = not empty
	if empty and hint == null:
		var label := SmaKit.muted(I18n.t("trade.no_selection"))
		label.name = "EmptyHint"
		label.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
		add_child(label)
	elif hint != null:
		hint.visible = empty


func _price_text(value: Variant) -> String:
	return SmaFormat.num(float(value), 2) if value != null else "—"


func _update_book(ticker: String) -> void:
	var book: Dictionary = game.exchange.get_book(ticker, 6)
	var asks: Array = book.get("asks", [])
	var bids: Array = book.get("bids", [])
	if not asks.is_empty() and not bids.is_empty():
		var best_ask := float(asks[0]["price"])
		var best_bid := float(bids[0]["price"])
		_book_meta.text = "%s %s · %s %s" % [
			I18n.t("trade.spread"), SmaFormat.num(best_ask - best_bid, 2),
			I18n.t("trade.mid"), SmaFormat.num((best_ask + best_bid) * 0.5, 2),
		]
	else:
		_book_meta.text = ""
	for index in _book_rows.size():
		var row: Dictionary = _book_rows[index]
		var ask_index := asks.size() - 1 - index
		if ask_index >= 0:
			row["ask_price"].text = SmaFormat.num(float(asks[ask_index]["price"]), 2)
			row["ask_size"].text = SmaFormat.quantity(float(asks[ask_index]["size"]))
		else:
			row["ask_price"].text = "—"
			row["ask_size"].text = "—"
		if index < bids.size():
			row["bid_price"].text = SmaFormat.num(float(bids[index]["price"]), 2)
			row["bid_size"].text = SmaFormat.quantity(float(bids[index]["size"]))
		else:
			row["bid_price"].text = "—"
			row["bid_size"].text = "—"


func _update_chart(ticker: String) -> void:
	var candles: Array = game.exchange.get_candles(ticker, _timeframe)
	var title := "%s · %s" % [ticker, _timeframe]
	_chart.set_candles(candles, _timeframe, title)


func _update_position(ticker: String) -> void:
	SmaKit.clear_children(_position_box)
	var long_position: Dictionary = game.exchange.state["account"]["positions"].get(ticker, {})
	var short_position: Dictionary = game.exchange.state["account"]["shorts"].get(ticker, {})
	if long_position.is_empty() and short_position.is_empty():
		_position_box.add_child(SmaKit.muted(I18n.t("trade.no_position")))
		return
	var quote: Dictionary = game.exchange.quote(ticker)
	var last := float(quote.get("last", 0.0))
	if not long_position.is_empty():
		var qty := int(long_position["qty"])
		var avg := float(long_position["avgCost"])
		var unrealized := (last - avg) * qty
		_position_box.add_child(SmaKit.data_row([
			I18n.t("trade.buy"), SmaFormat.quantity(qty), SmaFormat.num(avg, 2),
			SmaFormat.signed_money(unrealized),
		], [1.0, 0.9, 0.9, 1.2], [SmaUiTheme.POSITIVE, SmaUiTheme.TEXT, SmaUiTheme.MUTED,
			SmaKit.value_color(unrealized)], [HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT,
			HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))
	if not short_position.is_empty():
		var qty := int(short_position["qty"])
		var avg := float(short_position["avgPrice"])
		var unrealized := (avg - last) * qty
		_position_box.add_child(SmaKit.data_row([
			I18n.t("trade.short"), SmaFormat.quantity(qty), SmaFormat.num(avg, 2),
			SmaFormat.signed_money(unrealized),
		], [1.0, 0.9, 0.9, 1.2], [SmaUiTheme.NEGATIVE, SmaUiTheme.TEXT, SmaUiTheme.MUTED,
			SmaKit.value_color(unrealized)], [HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT,
			HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))


func _update_orders() -> void:
	var orders: Array = game.exchange.open_order_rows("player")
	var key_parts: Array[String] = []
	for order in orders:
		key_parts.append("%s:%s:%s" % [order.get("id", ""), order.get("status", ""),
			order.get("filledQty", 0)])
	var key := "|".join(key_parts)
	if key == _orders_key:
		return
	_orders_key = key
	SmaKit.clear_children(_orders_box)
	_order_buttons.clear()
	if orders.is_empty():
		_orders_box.add_child(SmaKit.muted(I18n.t("trade.no_orders")))
		return
	for order in orders:
		var row := SmaKit.hbox(6)
		var label := "%s %s · %s · %s/%s" % [
			String(order.get("id", "")),
			String(order.get("side", "")).capitalize(),
			String(order.get("type", "")),
			SmaFormat.quantity(float(order.get("filledQty", 0))),
			SmaFormat.quantity(float(order.get("qty", 0))),
		]
		row.add_child(SmaKit.cell(label, 1.0, HORIZONTAL_ALIGNMENT_LEFT, SmaUiTheme.MUTED, 11))
		var cancel := SmaKit.button(I18n.t("trade.cancel"), _cancel.bind(String(order.get("id", ""))))
		cancel.add_theme_font_size_override("font_size", 10)
		row.add_child(cancel)
		_orders_box.add_child(row)


func _update_available() -> void:
	var cash: float = float(game.exchange.available_cash())
	var snapshot := SmaMargin.margin_snapshot(game.exchange.state)
	_available_label.text = "%s %s · %s %s" % [
		I18n.t("trade.available_cash"), SmaFormat.money(cash),
		I18n.t("trade.buying_power"), SmaFormat.money(float(snapshot["buyingPower"])),
	]


func _current_price() -> float:
	var ticker: String = game.selected_ticker
	var quote: Dictionary = game.exchange.quote(ticker)
	if _order_type == "limit":
		return _limit.value
	if _order_type == "stop":
		return _stop_price.value
	var buying := _side == "buy" or _side == "cover"
	var value: Variant = quote.get("ask") if buying else quote.get("bid")
	return float(value) if value != null else float(quote.get("last", 0.0))


func _update_estimate() -> void:
	if _estimate_label == null or game == null or not game.started:
		return
	var value := _current_price() * _qty.value
	var fee := SmaFormat.round_to(value * SmaExchange.FEE_BPS / 10000.0, 2)
	_estimate_label.text = SmaFormat.money(value)
	_fee_label.text = SmaFormat.money(fee)


func _on_side(side: String) -> void:
	_side = side
	_feedback.text = ""
	if _order_type == "stop":
		_reset_stop_price()
	_update_estimate()


func _on_type(order_type: String) -> void:
	_order_type = order_type
	_limit_row.visible = order_type == "limit"
	_stop_row.visible = order_type == "stop"
	_trail_row.visible = order_type == "trailing"
	if order_type == "limit":
		var quote: Dictionary = game.exchange.quote(game.selected_ticker)
		var reference := float(quote.get("last", _limit.value))
		_limit.value = maxf(0.01, SmaFormat.round_to(reference, 2))
	elif order_type == "stop":
		_reset_stop_price()
	_update_estimate()


func _reset_stop_price() -> void:
	if _stop_price == null or game == null or not game.started:
		return
	var quote: Dictionary = game.exchange.quote(game.selected_ticker)
	var reference := float(quote.get("last", _stop_price.value))
	var buying := _side == "buy" or _side == "cover"
	_stop_ticker = game.selected_ticker
	_stop_price.value = maxf(0.01,
		SmaFormat.round_to(reference * (1.05 if buying else 0.95), 2))


func _on_timeframe(timeframe: String) -> void:
	_timeframe = timeframe
	_update_chart(game.selected_ticker)


func _submit() -> void:
	if game == null or not game.started:
		return
	var params := {
		"ticker": game.selected_ticker,
		"side": _side,
		"type": _order_type,
		"qty": int(_qty.value),
	}
	if _order_type == "limit":
		params["limitPrice"] = _limit.value
	elif _order_type == "stop":
		params["stopPrice"] = _stop_price.value
	elif _order_type == "trailing":
		params["trailPct"] = _trail_pct.value / 100.0
	var result: Dictionary = game.submit_order(params)
	if bool(result.get("ok", false)):
		var order: Dictionary = result.get("order", {})
		var filled := int(order.get("filledQty", 0))
		_feedback.text = I18n.t("trade.order_filled") if filled > 0 else I18n.t("trade.order_submitted")
		_feedback.add_theme_color_override("font_color", SmaUiTheme.POSITIVE)
		_orders_key = ""
	else:
		var error_key := String(result.get("error", "order.invalid"))
		_feedback.text = I18n.t("error.%s" % error_key)
		_feedback.add_theme_color_override("font_color", SmaUiTheme.NEGATIVE)
	refresh()


func _cancel(order_id: String) -> void:
	game.cancel_order(order_id)
	_orders_key = ""
	refresh()
