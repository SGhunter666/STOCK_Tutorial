## Options desk: deterministic chains, buy and sell tickets, collateral, model
## Greeks, strategy presets and open long/short positions. Buying unlocks after
## u21 s1, selling after u25 s1.
class_name SmaOptionsScreen
extends SmaScreen

const EXPIRIES := [30, 60, 90]

var _ticker := ""
var _expiry_days := 30
var _selected_type := "call"
var _selected_strike := 0.0
var _qty := 1
var _mode := "buy"
var _strategy_qty := 1
var _chain: Dictionary = {}
var _body: VBoxContainer
var _ticket_refs: Dictionary = {}
var _positions_body: VBoxContainer
var _feedback: Label
var _submit_button: Button
var _qty_spin: SpinBox
var _ticker_option: OptionButton
var _total_label: Label
var _collateral_label: Label
var _collateral_row: Control
var _fee_note: Label


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
	_total_label = null
	_collateral_label = null
	_collateral_row = null
	_fee_note = null
	if game == null or not game.started:
		return
	if not game.academy_is_tool_unlocked("options.trade"):
		_render_locked()
		return
	if _mode == "sell" and not game.academy_is_tool_unlocked("options.sell"):
		_mode = "buy"
	_ensure_ticker()
	_chain = game.option_chain(_ticker)
	if _chain.is_empty():
		_body.add_child(SmaKit.muted(I18n.t("options.noContract")))
		return
	_ensure_selection()
	_render_header()
	var columns := SmaKit.hbox(12)
	var chain_card := _render_chain()
	chain_card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	columns.add_child(chain_card)
	var ticket := _render_ticket()
	ticket.custom_minimum_size.x = 340
	columns.add_child(ticket)
	_body.add_child(columns)
	_render_strategies()
	_render_positions()


func on_tick() -> void:
	if game == null or not game.started or _chain.is_empty():
		return
	_update_ticket()
	_refresh_positions()


func _render_locked() -> void:
	var card := SmaKit.card(20)
	var box := SmaKit.vbox(10)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("options.lockedTitle"), 20))
	var text := SmaKit.muted(I18n.t("options.lockedText"), 13)
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(text)
	box.add_child(SmaKit.button(I18n.t("options.lockedAction"), _go_to_academy, true))
	_body.add_child(card)


func _go_to_academy() -> void:
	_go_to_unit("u21")


func _go_to_u25() -> void:
	_go_to_unit("u25")


func _go_to_unit(unit_id: String) -> void:
	var main := get_tree().get_first_node_in_group("main")
	if main == null:
		return
	main.navigate("academy")
	if main._screens.has("academy"):
		main._screens["academy"]._select_unit(unit_id)


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
	title_box.add_child(SmaKit.label(I18n.t("options.title"), 20))
	title_box.add_child(SmaKit.muted(I18n.t("options.subtitle"), 12))
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
	for days in EXPIRIES:
		var button := SmaKit.toggle(I18n.t("options.expiryOption", {"days": days}), group)
		button.button_pressed = int(days) == _expiry_days
		button.pressed.connect(_on_expiry_changed.bind(int(days)))
		header.add_child(button)
	_body.add_child(header)
	var style_row := SmaKit.hbox(8)
	style_row.add_child(SmaKit.caption(I18n.t("exchange.optionStyle")))
	var style_option := OptionButton.new()
	style_option.add_item(I18n.t("exchange.optionEuropean"))
	style_option.set_item_metadata(0, "european")
	style_option.add_item(I18n.t("exchange.optionAmerican"))
	style_option.set_item_metadata(1, "american")
	style_option.select(1 if game.option_style() == "american" else 0)
	style_option.disabled = not game.option_rows().is_empty()
	style_option.item_selected.connect(_on_style_changed)
	style_row.add_child(style_option)
	style_row.add_child(SmaKit.hspacer())
	_body.add_child(style_row)
	var style_note := SmaKit.muted(I18n.t(
		"exchange.optionStyleNote.%s" % game.option_style()), 10)
	style_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_body.add_child(style_note)


func _on_style_changed(index: int) -> void:
	var style := "american" if index == 1 else "european"
	var result: Dictionary = game.set_option_style(style)
	if not bool(result.get("ok", false)):
		game.toast(I18n.t(String(result.get("error", "exchange.error.option.style"))))
		refresh()
		return
	game.toast(I18n.t("exchange.optionStyleAmericanOn" if style == "american"
		else "exchange.optionStyleEuropeanOn"))
	refresh()


func _on_ticker_changed(index: int) -> void:
	if _ticker_option == null or index < 0:
		return
	_ticker = String(_ticker_option.get_item_metadata(index))
	_selected_strike = 0.0
	refresh()


func _on_expiry_changed(days: int) -> void:
	_expiry_days = days
	refresh()


func _ensure_selection() -> void:
	var strikes: Array = _chain.get("strikes", [])
	if strikes.is_empty():
		return
	for strike in strikes:
		if absf(float(strike) - _selected_strike) < 0.000001:
			return
	var spot := float(_chain.get("spot", 0.0))
	var nearest := float(strikes[0])
	for strike in strikes:
		if absf(float(strike) - spot) < absf(nearest - spot):
			nearest = float(strike)
	_selected_strike = nearest


func _expiry_day() -> int:
	for expiry in _chain.get("expiries", []):
		if int(expiry.get("days", 0)) == _expiry_days:
			return int(expiry.get("expiryDay", 0))
	return int(_chain.get("expiries", [{}])[0].get("expiryDay", 0))


func _selected_contract() -> Dictionary:
	if _chain.is_empty():
		return {}
	return SmaOptions.find_contract(_chain, _selected_type, _selected_strike, _expiry_day())


func _render_chain() -> PanelContainer:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(8)
	card.add_child(box)
	var title_row := SmaKit.hbox(8)
	title_row.add_child(SmaKit.label(I18n.t("options.chainTitle"), 15))
	title_row.add_child(SmaKit.hspacer())
	title_row.add_child(SmaKit.muted(I18n.t("options.chainSubtitle", {
		"ticker": _ticker, "days": _expiry_days}), 12))
	box.add_child(title_row)
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 4)
	grid.add_child(SmaKit.caption(I18n.t("options.strike")))
	grid.add_child(SmaKit.caption(I18n.t("options.call")))
	grid.add_child(SmaKit.caption(I18n.t("options.put")))
	for row in SmaOptions.chain_rows(_chain, _expiry_day()):
		grid.add_child(SmaKit.label(SmaFormat.money(float(row["strike"])), 12))
		grid.add_child(_contract_button(row["call"], "call", float(row["strike"])))
		grid.add_child(_contract_button(row["put"], "put", float(row["strike"])))
	box.add_child(grid)
	box.add_child(SmaKit.muted(I18n.t("options.chainNote"), 11))
	return card


func _contract_button(contract: Dictionary, option_type: String, strike: float) -> Control:
	if contract.is_empty():
		return SmaKit.muted("—", 11)
	var selected := _selected_type == option_type \
		and absf(_selected_strike - strike) < 0.000001
	var text := "%s  Δ %s" % [SmaFormat.money(float(contract["premium"])),
		SmaFormat.num(float(contract["delta"]), 2)]
	if selected:
		text = "● " + text
	var button := SmaKit.button(text, _select_contract.bind(option_type, strike), selected)
	button.add_theme_font_size_override("font_size", 11)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return button


func _select_contract(option_type: String, strike: float) -> void:
	_selected_type = option_type
	_selected_strike = strike
	refresh()


func _render_ticket() -> PanelContainer:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(7)
	card.add_child(box)
	var is_sell := _mode == "sell"
	box.add_child(SmaKit.label(I18n.t(
		"options.ticketTitleSell" if is_sell else "options.ticketTitleBuy"), 15))
	box.add_child(SmaKit.muted(I18n.t(
		"options.ticketSubtitleSell" if is_sell else "options.ticketSubtitle"), 11))
	var sell_unlocked: bool = game.academy_is_tool_unlocked("options.sell")
	var mode_row := SmaKit.hbox(6)
	var group := ButtonGroup.new()
	var buy_toggle := SmaKit.toggle(I18n.t("options.buyMode"), group)
	buy_toggle.button_pressed = not is_sell
	buy_toggle.pressed.connect(_set_mode.bind("buy"))
	mode_row.add_child(buy_toggle)
	var sell_toggle := SmaKit.toggle(I18n.t("options.sellMode"), group)
	sell_toggle.button_pressed = is_sell
	sell_toggle.disabled = not sell_unlocked
	sell_toggle.pressed.connect(_set_mode.bind("sell"))
	mode_row.add_child(sell_toggle)
	mode_row.add_child(SmaKit.hspacer())
	box.add_child(mode_row)
	if not sell_unlocked:
		var hint := SmaKit.muted(I18n.t("options.sellLockedHint"), 10)
		hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		box.add_child(hint)
	var contract := _selected_contract()
	if contract.is_empty():
		box.add_child(SmaKit.muted(I18n.t("options.noContract"), 12))
		return card
	var contract_row := SmaKit.hbox(6)
	var type_key := "options.call" if String(contract.get("type", "call")) == "call" \
		else "options.put"
	contract_row.add_child(SmaKit.label("%s · %s · %s" % [I18n.t(type_key), _ticker,
		SmaFormat.money(float(contract["strike"]))], 13))
	contract_row.add_child(SmaKit.hspacer())
	contract_row.add_child(SmaKit.label(I18n.t("options.expiryIn", {
		"days": int(contract.get("days", _expiry_days))}), 11, SmaUiTheme.MUTED))
	box.add_child(contract_row)
	var qty_row := SmaKit.hbox(6)
	qty_row.add_child(SmaKit.caption(I18n.t("options.contracts")))
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
	var cash_row := SmaKit.hbox(6)
	cash_row.add_child(SmaKit.caption(I18n.t(
		"options.collateralAvailable" if is_sell else "options.cashAvailable",
		{"value": SmaFormat.money(
			game.available_option_cash() if is_sell else _available_cash())})))
	box.add_child(cash_row)
	for spec in [["premium", "options.premium"], ["gross", "trade.estimate"],
			["fee", "trade.fee"]]:
		_ticket_refs[String(spec[0])] = _value_row(box, String(spec[1]))
	var total_row := _value_row_with_label(box, "options.totalCost")
	_ticket_refs["cost"] = total_row["value"]
	_total_label = total_row["label"]
	_ticket_refs["breakeven"] = _value_row(box, "options.breakeven")
	var collateral_row := _value_row_with_label(box, "options.collateral")
	_ticket_refs["collateral"] = collateral_row["value"]
	_collateral_label = collateral_row["label"]
	_collateral_row = collateral_row["row"]
	var greek_grid := GridContainer.new()
	greek_grid.columns = 2
	greek_grid.add_theme_constant_override("h_separation", 10)
	greek_grid.add_theme_constant_override("v_separation", 2)
	for spec in [["delta", "Δ", "options.delta"], ["gamma", "Γ", "options.gamma"],
			["theta", "Θ", "options.theta"], ["vega", "Vega", ""]]:
		var key := String(spec[0])
		var label_text := String(spec[1])
		if String(spec[2]) != "":
			label_text = "%s %s" % [spec[1], I18n.t(String(spec[2]))]
		greek_grid.add_child(SmaKit.caption(label_text))
		_ticket_refs[key] = SmaKit.label("—", 12)
		greek_grid.add_child(_ticket_refs[key])
	box.add_child(greek_grid)
	_feedback = SmaKit.muted("", 11)
	_feedback.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(_feedback)
	_submit_button = SmaKit.button(I18n.t(
		"options.sellButton" if is_sell else "options.buyButton"), _submit, true)
	box.add_child(_submit_button)
	_fee_note = SmaKit.muted("", 10)
	_fee_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(_fee_note)
	_update_ticket()
	return card


func _value_row(box: VBoxContainer, label_key: String) -> Label:
	return _value_row_with_label(box, label_key)["value"]


func _value_row_with_label(box: VBoxContainer, label_key: String) -> Dictionary:
	var row := SmaKit.hbox(6)
	var label := SmaKit.caption(I18n.t(label_key))
	row.add_child(label)
	row.add_child(SmaKit.hspacer())
	var value := SmaKit.label("—", 12)
	row.add_child(value)
	box.add_child(row)
	return {"row": row, "label": label, "value": value}


func _set_mode(mode: String) -> void:
	if mode == "sell" and not game.academy_is_tool_unlocked("options.sell"):
		return
	if _mode == mode:
		return
	_mode = mode
	refresh()


func _on_qty_changed(value: float) -> void:
	_qty = maxi(1, int(value))
	if _qty_spin != null:
		_qty_spin.value = _qty
	_update_ticket()


func _current_mark(contract: Dictionary) -> Dictionary:
	var spot := float(_chain.get("spot", 0.0))
	if game.exchange != null:
		spot = float(game.exchange.quote(_ticker).get("last", spot))
	var years := maxf(0.0,
		float(int(contract.get("expiryDay", 0)) - game.get_day()) / float(SmaOptions.TRADING_DAYS))
	return SmaOptions.black_scholes({
		"type": String(contract.get("type", "call")),
		"spot": spot,
		"strike": float(contract.get("strike", 0.0)),
		"years": years,
		"vol": float(contract.get("vol", 0.3)),
	})


func _fee_for(contract: Dictionary, qty: int) -> float:
	return game.option_fee(contract, qty) if game != null else 0.0


func _available_cash() -> float:
	if game == null or game.exchange == null:
		return 0.0
	return float(game.exchange.available_cash())


func _find_position(key: String) -> Dictionary:
	if game == null or game.exchange == null:
		return {}
	for position in game.exchange.state["account"].get("options", []):
		if String(position.get("key", "")) == key:
			return position
	return {}


func _update_ticket() -> void:
	if _ticket_refs.is_empty() or _qty_spin == null:
		return
	var contract := _selected_contract()
	if contract.is_empty():
		return
	var is_sell := _mode == "sell"
	var qty := int(_qty_spin.value)
	var mark := _current_mark(contract)
	var premium := float(mark.get("price", 0.0))
	var gross := premium * SmaOptions.CONTRACT_SIZE * qty
	var fee := _fee_for(contract, qty)
	var total := gross - fee if is_sell else gross + fee
	var payoff := SmaOptions.payoff_at_expiry({
		"type": contract["type"], "spot": float(contract["spot"]),
		"strike": float(contract["strike"]), "premium": premium, "qty": 1,
	})
	_ticket_refs["premium"].text = "%s × 100" % SmaFormat.money(premium)
	_ticket_refs["gross"].text = SmaFormat.money(gross)
	_ticket_refs["fee"].text = SmaFormat.money(fee)
	_ticket_refs["cost"].text = SmaFormat.money(total)
	_ticket_refs["breakeven"].text = SmaFormat.money(float(payoff["breakeven"]))
	_total_label.text = I18n.t("options.netCredit" if is_sell else "options.totalCost")
	_ticket_refs["delta"].text = SmaFormat.num(float(mark["delta"]), 3)
	_ticket_refs["gamma"].text = SmaFormat.num(float(mark["gamma"]), 4)
	_ticket_refs["theta"].text = SmaFormat.money(float(mark["theta"]))
	_ticket_refs["vega"].text = SmaFormat.num(float(mark["vega"]), 2)
	_collateral_row.visible = is_sell
	if is_sell:
		_collateral_label.text = I18n.t("options.collateral")
		if String(contract["type"]) == "put":
			_ticket_refs["collateral"].text = SmaFormat.money(
				float(contract["strike"]) * SmaOptions.CONTRACT_SIZE * qty)
		else:
			_ticket_refs["collateral"].text = I18n.t("options.coveredShares", {
				"value": SmaFormat.num(float(game.available_covered_shares(_ticker)), 0)})
	_fee_note.text = I18n.t("options.feeNoteSell" if is_sell else "options.feeNote",
		{"fee": SmaFormat.money(fee)})
	var error := _ticket_error(contract, qty, gross, fee)
	if _submit_button != null:
		_submit_button.disabled = error != ""
	if _feedback != null:
		_feedback.text = I18n.t(error) if error != "" else ""
		_feedback.add_theme_color_override("font_color", SmaUiTheme.NEGATIVE)


func _ticket_error(contract: Dictionary, qty: int, gross: float, fee: float) -> String:
	var epsilon := 0.000000001
	var existing := _find_position(SmaOptions.option_key(contract))
	var held := int(existing.get("qty", 0)) if not existing.is_empty() else 0
	if _mode == "sell":
		if held > 0:
			return "error.optionIsLong"
		if String(contract.get("type", "")) == "put":
			var needed := float(contract["strike"]) * SmaOptions.CONTRACT_SIZE * qty
			if needed > game.available_option_cash() + epsilon:
				return "error.insufficientOptionCollateral"
		else:
			var covered: int = game.available_covered_shares(_ticker)
			var naked := maxi(0, qty
				- int(floor(float(covered) / float(SmaOptions.CONTRACT_SIZE))))
			var spot := float(contract.get("spot", 0.0))
			if game.exchange != null:
				spot = float(game.exchange.quote(_ticker).get("last", spot))
			if float(naked) * spot * SmaOptions.CONTRACT_SIZE * 0.2 \
					> game.available_option_cash() + epsilon:
				return "error.insufficientOptionCollateral"
		return ""
	if held < 0:
		return "error.optionIsShort"
	if gross + fee > _available_cash() + epsilon:
		return "error.insufficientCash"
	return ""


func _submit() -> void:
	var contract := _selected_contract()
	if contract.is_empty() or _qty_spin == null:
		return
	var result: Dictionary
	if _mode == "sell":
		result = game.sell_option(_ticker, String(contract["type"]),
			float(contract["strike"]), int(contract["expiryDay"]), int(_qty_spin.value))
	else:
		result = game.buy_option(_ticker, String(contract["type"]),
			float(contract["strike"]), int(contract["expiryDay"]), int(_qty_spin.value))
	if not bool(result.get("ok", false)):
		if _feedback != null:
			_feedback.text = I18n.t(String(result.get("error", "error.priceInvalid")))
		return
	game.toast(I18n.t("toast.option_sold" if _mode == "sell" else "toast.option_bought"))
	refresh()


func _render_strategies() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(8)
	card.add_child(box)
	var title_row := SmaKit.hbox(8)
	title_row.add_child(SmaKit.label(I18n.t("strategies.title"), 15))
	title_row.add_child(SmaKit.hspacer())
	box.add_child(title_row)
	box.add_child(SmaKit.muted(I18n.t("strategies.subtitle"), 11))
	if not game.academy_is_tool_unlocked("options.sell"):
		var locked := SmaKit.muted(I18n.t("strategies.locked"), 12)
		locked.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		box.add_child(locked)
		box.add_child(SmaKit.button(I18n.t("strategies.lockedAction"), _go_to_u25))
		_body.add_child(card)
		return
	var qty_row := SmaKit.hbox(6)
	qty_row.add_child(SmaKit.caption(I18n.t("strategies.qty")))
	qty_row.add_child(SmaKit.hspacer())
	var qty_spin := SpinBox.new()
	qty_spin.min_value = 1
	qty_spin.max_value = 100
	qty_spin.step = 1
	qty_spin.value = _strategy_qty
	qty_spin.custom_minimum_size.x = 90
	qty_spin.value_changed.connect(_on_strategy_qty_changed)
	qty_row.add_child(qty_spin)
	box.add_child(qty_row)
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	for definition in SmaOptionStrategies.DEFS:
		grid.add_child(_strategy_cell(definition))
	box.add_child(grid)
	box.add_child(SmaKit.muted(I18n.t("strategies.note"), 10))
	_body.add_child(card)


func _strategy_cell(definition: Dictionary) -> PanelContainer:
	var cell := SmaKit.card(8)
	var inner := SmaKit.vbox(3)
	cell.add_child(inner)
	inner.add_child(SmaKit.label(I18n.t(String(definition["nameKey"])), 12,
		SmaUiTheme.ACCENT))
	var description := SmaKit.muted(I18n.t(String(definition["descKey"])), 10)
	description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	inner.add_child(description)
	var risk := SmaKit.muted(I18n.t(String(definition["riskKey"])), 10)
	risk.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	inner.add_child(risk)
	var strategy_id := String(definition["id"])
	var strategy: Dictionary = SmaOptionStrategies.build(
		strategy_id, _chain, _expiry_days, _strategy_qty)
	if strategy.is_empty():
		inner.add_child(SmaKit.muted(I18n.t("demo.strategyPayoff.unavailable"), 10))
	else:
		inner.add_child(SmaKit.label(I18n.t("strategies.maxLoss", {
			"value": SmaFormat.money(float(strategy["maxLoss"]))}), 10,
			SmaUiTheme.NEGATIVE))
	var button := SmaKit.button(I18n.t("strategies.open"),
		_open_strategy.bind(strategy_id), true)
	button.disabled = strategy.is_empty()
	inner.add_child(button)
	return cell


func _on_strategy_qty_changed(value: float) -> void:
	_strategy_qty = maxi(1, int(value))
	refresh()


func _open_strategy(strategy_id: String) -> void:
	var result: Dictionary = game.open_option_strategy(
		strategy_id, _ticker, _expiry_days, _strategy_qty)
	if not bool(result.get("ok", false)):
		game.toast(I18n.t(String(result.get("error", "error.contractNotFound"))))
		return
	game.toast(I18n.t("toast.strategy_opened"))
	refresh()


func _render_positions() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(7)
	card.add_child(box)
	var rows: Array = game.option_rows()
	box.add_child(SmaKit.label(I18n.t("options.positionsTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("options.positionsSubtitle", {
		"count": rows.size()}), 11))
	_positions_body = SmaKit.vbox(4)
	box.add_child(_positions_body)
	_body.add_child(card)
	_refresh_positions()


func _refresh_positions() -> void:
	if _positions_body == null:
		return
	SmaKit.clear_children(_positions_body)
	var rows: Array = game.option_rows()
	if rows.is_empty():
		_positions_body.add_child(SmaKit.muted(I18n.t("options.noPositions"), 12))
		return
	var header := SmaKit.hbox(8)
	for spec in [["contract", "options.contract", 2.4], ["qty", "options.contracts", 0.7],
			["premium", "options.avgPremium", 1.0], ["value", "options.currentValue", 1.0],
			["pnl", "options.pnl", 1.2], ["days", "options.daysLeft", 0.7]]:
		var cell := SmaKit.cell(I18n.t(String(spec[1])), float(spec[2]),
			HORIZONTAL_ALIGNMENT_RIGHT if String(spec[0]) != "contract" else HORIZONTAL_ALIGNMENT_LEFT,
			SmaUiTheme.MUTED, 10)
		header.add_child(cell)
	_positions_body.add_child(header)
	for row in rows:
		var line := SmaKit.hbox(8)
		var side_key := "options.longPosition" if String(row["side"]) == "long" \
			else "options.shortPosition"
		line.add_child(SmaKit.cell("%s %s %s · %s" % [row["ticker"],
			I18n.t("options.call" if String(row["type"]) == "call" else "options.put"),
			SmaFormat.money(float(row["strike"])), I18n.t(side_key)], 2.4,
			HORIZONTAL_ALIGNMENT_LEFT, SmaUiTheme.TEXT, 11))
		line.add_child(SmaKit.cell(SmaFormat.num(float(row.get("absQty", 0)), 0), 0.7,
			HORIZONTAL_ALIGNMENT_RIGHT, SmaUiTheme.TEXT, 11))
		line.add_child(SmaKit.cell(SmaFormat.money(float(row["premium"])), 1.0,
			HORIZONTAL_ALIGNMENT_RIGHT, SmaUiTheme.MUTED, 11))
		line.add_child(SmaKit.cell(SmaFormat.money(float(row["value"])), 1.0,
			HORIZONTAL_ALIGNMENT_RIGHT, SmaUiTheme.TEXT, 11))
		line.add_child(SmaKit.cell("%s · %s" % [SmaFormat.signed_money(float(row["pnl"])),
			SmaFormat.pct(float(row["pnlPct"]), 1)], 1.2, HORIZONTAL_ALIGNMENT_RIGHT,
			SmaKit.value_color(float(row["pnl"])), 11))
		line.add_child(SmaKit.cell(I18n.t("options.daysLeftValue", {
			"days": int(row["daysLeft"])}), 0.7, HORIZONTAL_ALIGNMENT_RIGHT,
			SmaUiTheme.MUTED, 11))
		var close := SmaKit.button(I18n.t("options.close"),
			_close_position.bind(String(row["key"]), absi(int(row["qty"]))))
		close.add_theme_font_size_override("font_size", 10)
		close.custom_minimum_size.x = 54
		line.add_child(close)
		if int(row["qty"]) > 0 and int(row["daysLeft"]) == 0 \
				and float(row.get("intrinsic", 0.0)) > 0.0:
			var exercise := SmaKit.button(I18n.t("exchange.optionExercise"),
				_exercise_position.bind(String(row["key"]), absi(int(row["qty"]))))
			exercise.add_theme_font_size_override("font_size", 10)
			exercise.custom_minimum_size.x = 54
			line.add_child(exercise)
		_positions_body.add_child(line)


func _close_position(key: String, qty: int) -> void:
	var result: Dictionary = game.close_option(key, qty)
	if not bool(result.get("ok", false)):
		game.toast(I18n.t(String(result.get("error", "error.noOptionPosition"))))
		return
	game.toast(I18n.t("toast.option_closed"))
	refresh()


func _exercise_position(key: String, qty: int) -> void:
	var result: Dictionary = game.exercise_option(key, qty)
	if not bool(result.get("ok", false)):
		game.toast(I18n.t(String(result.get("error",
			"exchange.error.option.noPosition"))))
		return
	game.toast(I18n.t("exchange.optionExercised", {
		"qty": int(result.get("quantity", qty)),
		"shares": int(result.get("shares", 0))}))
	refresh()
