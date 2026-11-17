## Multi-asset desk: bonds, FX, commodities and crypto on the shared cash
## account. Unlocks after Unit 13. All prices are deterministic functions of the
## simulated day and seed, so saves reproduce the same market.
class_name SmaMultiAssetScreen
extends SmaScreen

var _body: VBoxContainer
var _bond_select: OptionButton
var _fx_select: OptionButton
var _commodity_select: OptionButton
var _crypto_select: OptionButton
var _bond_id := "gov2"
var _fx_id := "EURUSD"
var _commodity_id := "gold"
var _crypto_id := "BTC"


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
	_bond_select = null
	_fx_select = null
	_commodity_select = null
	_crypto_select = null
	if game == null or not game.started:
		return
	if not SmaAcademy.is_unit_complete(game.academy, "u13"):
		_render_locked()
		return
	_render_header()
	_render_summary()
	_render_bonds()
	_render_fx()
	_render_commodities()
	_render_crypto()
	_body.add_child(SmaKit.muted(I18n.t("multiasset.note"), 10))


func _render_locked() -> void:
	var card := SmaKit.card(20)
	var box := SmaKit.vbox(10)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("multiasset.lockedTitle"), 20))
	var text := SmaKit.muted(I18n.t("multiasset.lockedText"), 13)
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(text)
	box.add_child(SmaKit.muted(I18n.t("multiasset.lockedHint"), 12))
	box.add_child(SmaKit.button(I18n.t("multiasset.goAcademy"), _go_to_u13, true))
	_body.add_child(card)


func _go_to_u13() -> void:
	var main := get_tree().get_first_node_in_group("main")
	if main == null:
		return
	main.navigate("academy")
	if main._screens.has("academy"):
		main._screens["academy"]._select_unit("u13")


func _render_header() -> void:
	var header := SmaKit.hbox(10)
	var title_box := SmaKit.vbox(0)
	title_box.add_child(SmaKit.label(I18n.t("multiasset.title"), 20))
	var subtitle := SmaKit.muted(I18n.t("multiasset.subtitle"), 12)
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	subtitle.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_box.add_child(subtitle)
	header.add_child(title_box)
	header.add_child(SmaKit.hspacer())
	var macro: Dictionary = game.macro_snapshot()
	header.add_child(SmaKit.label(I18n.t(SmaMacro.regime_key(
		String(macro.get("regime", "neutral")))), 12, SmaUiTheme.ACCENT))
	_body.add_child(header)


func _render_summary() -> void:
	var bonds: Array = game.bond_rows()
	var fx: Array = game.fx_rows()
	var commodities: Array = game.commodity_rows()
	var crypto: Array = game.crypto_rows()
	var grid := GridContainer.new()
	grid.columns = 5
	grid.add_theme_constant_override("h_separation", 8)
	for spec in [
		["multiasset.bondValue", _sum_rows(bonds, "value"), _sum_rows(bonds, "pnl")],
		["multiasset.fxValue", _sum_rows(fx, "value"), _sum_rows(fx, "pnl")],
		["multiasset.commodityValue", _sum_rows(commodities, "value"),
			_sum_rows(commodities, "pnl")],
		["multiasset.cryptoValue", _sum_rows(crypto, "value"),
			_sum_rows(crypto, "pnl")],
	]:
		grid.add_child(_stat_card(String(spec[0]), float(spec[1]), float(spec[2])))
	var cash := 0.0
	if game.exchange != null:
		cash = float(game.exchange.state["account"]["cash"])
	grid.add_child(_stat_card("multiasset.cash", cash, 0.0, false))
	_body.add_child(grid)


func _sum_rows(rows: Array, key: String) -> float:
	var total := 0.0
	for row in rows:
		total += float(row.get(key, 0.0))
	return SmaFormat.round_to(total, 2)


func _stat_card(label_key: String, value: float, pnl: float,
		show_pnl: bool = true) -> PanelContainer:
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(2)
	card.add_child(box)
	box.add_child(SmaKit.caption(I18n.t(label_key)))
	box.add_child(SmaKit.label(SmaFormat.money(value), 15))
	if show_pnl:
		box.add_child(SmaKit.label(SmaFormat.signed_money(pnl), 10,
			SmaKit.value_color(pnl)))
	else:
		box.add_child(SmaKit.muted(I18n.t("multiasset.cashSub"), 10))
	return card


func _section_head(box: VBoxContainer, title_key: String, subtitle_key: String) -> void:
	box.add_child(SmaKit.label(I18n.t(title_key), 15))
	var subtitle := SmaKit.muted(I18n.t(subtitle_key), 11)
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(subtitle)


func _render_bonds() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(7)
	card.add_child(box)
	_section_head(box, "multiasset.bondTitle", "multiasset.bondSubtitle")
	var quotes: Array = game.bond_quotes()
	var header := _table_header([["multiasset.bond", 2.2], ["multiasset.duration", 0.7],
		["multiasset.coupon", 0.8], ["multiasset.yield", 0.9],
		["multiasset.price", 1.0]])
	box.add_child(header)
	for row in quotes:
		var line := _table_row([I18n.t(String(row.get("nameKey", ""))),
			"%dY" % int(row.get("years", 0)),
			SmaFormat.num(float(row.get("coupon", 0.0)), 2) + "%",
			SmaFormat.num(float(row.get("yieldPct", 0.0)), 2) + "%",
			SmaFormat.money(float(row.get("price", 0.0)))],
			[2.2, 0.7, 0.8, 0.9, 1.0], [0, 1, 2, 3, 4])
		box.add_child(line)
	var buy_row := SmaKit.hbox(6)
	var select := OptionButton.new()
	select.custom_minimum_size.x = 240
	for index in quotes.size():
		var row: Dictionary = quotes[index]
		select.add_item("%s · %s" % [I18n.t(String(row["nameKey"])),
			SmaFormat.money(float(row["price"]))])
		select.set_item_metadata(index, String(row["id"]))
		if String(row["id"]) == _bond_id:
			select.select(index)
	select.item_selected.connect(_on_bond_selected)
	_bond_select = select
	buy_row.add_child(select)
	var qty := SpinBox.new()
	qty.min_value = 1
	qty.max_value = 10000
	qty.step = 1
	qty.value = 1
	qty.custom_minimum_size.x = 90
	buy_row.add_child(qty)
	buy_row.add_child(SmaKit.button(I18n.t("multiasset.buyBond"),
		_buy_bond.bind(qty), true))
	box.add_child(buy_row)
	box.add_child(SmaKit.muted(I18n.t("multiasset.bondNote", {
		"face": SmaFormat.money(SmaBonds.FACE)}), 10))
	var rows: Array = game.bond_rows()
	box.add_child(SmaKit.caption(I18n.t("multiasset.bondPositionsTitle")))
	if rows.is_empty():
		box.add_child(SmaKit.muted(I18n.t("multiasset.noBondPositions"), 11))
		_body.add_child(card)
		return
	box.add_child(_table_header([["multiasset.bond", 2.0], ["multiasset.qty", 0.6],
		["multiasset.avgCost", 0.9], ["multiasset.price", 0.9],
		["multiasset.value", 1.0], ["multiasset.pnl", 1.0], ["", 0.5]]))
	for row in rows:
		var name_key := "bond.%s.name" % String(row.get("id", ""))
		var line := _table_row([
			I18n.t(name_key), SmaFormat.num(float(row.get("qty", 0)), 0),
			SmaFormat.money(float(row.get("costBasis", 0.0)) / maxf(1.0, float(row.get("qty", 0)))),
			SmaFormat.money(float(row.get("currentPrice", 0.0))),
			SmaFormat.money(float(row.get("value", 0.0))),
			SmaFormat.signed_money(float(row.get("pnl", 0.0)))], [2.0, 0.6, 0.9, 0.9, 1.0, 1.0],
			[0, 1, 2, 3, 4, 5], [SmaUiTheme.TEXT, SmaUiTheme.TEXT, SmaUiTheme.MUTED,
				SmaUiTheme.MUTED, SmaUiTheme.TEXT, SmaKit.value_color(float(row.get("pnl", 0.0)))])
		var sell := SmaKit.button(I18n.t("multiasset.sellAll"),
			_sell_bond.bind(String(row.get("id", "")), int(row.get("qty", 0))))
		sell.add_theme_font_size_override("font_size", 10)
		sell.custom_minimum_size.x = 64
		line.add_child(sell)
		box.add_child(line)
	_body.add_child(card)


func _on_bond_selected(index: int) -> void:
	if _bond_select != null:
		_bond_id = String(_bond_select.get_item_metadata(index))


func _buy_bond(qty: SpinBox) -> void:
	var result: Dictionary = game.buy_bond(_bond_id, int(qty.value))
	if not bool(result.get("ok", false)):
		game.toast(I18n.t(String(result.get("error", "bond.errorUnknown"))))
		return
	game.toast(I18n.t("toast.bond_bought"))
	refresh()


func _sell_bond(bond_id: String, qty: int) -> void:
	var result: Dictionary = game.sell_bond(bond_id, qty)
	if not bool(result.get("ok", false)):
		game.toast(I18n.t(String(result.get("error", "bond.errorUnknown"))))
		return
	game.toast(I18n.t("toast.asset_sold"))
	refresh()


func _render_fx() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(7)
	card.add_child(box)
	_section_head(box, "multiasset.fxTitle", "multiasset.fxSubtitle")
	var quotes: Array = game.fx_quotes()
	box.add_child(_table_header([["multiasset.pair", 2.0], ["multiasset.rate", 1.0],
		["multiasset.change", 1.0]]))
	for row in quotes:
		var pair_id := String(row.get("id", ""))
		box.add_child(_table_row([pair_id, SmaFormat.num(float(row.get("rate", 0.0)), 4),
			SmaFormat.pct(float(row.get("changePct", 0.0)), 2)], [2.0, 1.0, 1.0],
			[0, 1, 2], [SmaUiTheme.TEXT, SmaUiTheme.TEXT,
				SmaKit.value_color(float(row.get("changePct", 0.0)))]))
	var buy_row := SmaKit.hbox(6)
	var select := OptionButton.new()
	select.custom_minimum_size.x = 240
	for index in quotes.size():
		var row: Dictionary = quotes[index]
		select.add_item("%s · %s" % [String(row["id"]), I18n.t(String(row["nameKey"]))])
		select.set_item_metadata(index, String(row["id"]))
		if String(row["id"]) == _fx_id:
			select.select(index)
	select.item_selected.connect(_on_fx_selected)
	_fx_select = select
	buy_row.add_child(select)
	var units := SpinBox.new()
	units.min_value = 1
	units.max_value = 100000000
	units.step = 100
	units.value = 1000
	units.custom_minimum_size.x = 110
	buy_row.add_child(units)
	buy_row.add_child(SmaKit.button(I18n.t("multiasset.buyFx"),
		_buy_fx.bind(units), true))
	box.add_child(buy_row)
	box.add_child(SmaKit.muted(I18n.t("multiasset.fxNote"), 10))
	var rows: Array = game.fx_rows()
	box.add_child(SmaKit.caption(I18n.t("multiasset.fxPositionsTitle")))
	if rows.is_empty():
		box.add_child(SmaKit.muted(I18n.t("multiasset.noFxPositions"), 11))
		_body.add_child(card)
		return
	box.add_child(_table_header([["multiasset.pair", 1.6], ["multiasset.units", 0.8],
		["multiasset.avgCost", 1.0], ["multiasset.rate", 1.0],
		["multiasset.value", 1.0], ["multiasset.pnl", 1.0], ["", 0.5]]))
	for row in rows:
		var line := _table_row([
			String(row.get("id", "")), SmaFormat.num(float(row.get("units", 0)), 0),
			SmaFormat.num(float(row.get("costBasis", 0.0)) / maxf(1.0, float(row.get("units", 0))), 4),
			SmaFormat.num(float(row.get("currentRate", 0.0)), 4),
			SmaFormat.money(float(row.get("value", 0.0))),
			SmaFormat.signed_money(float(row.get("pnl", 0.0)))],
			[1.6, 0.8, 1.0, 1.0, 1.0, 1.0], [0, 1, 2, 3, 4, 5],
			[SmaUiTheme.TEXT, SmaUiTheme.TEXT, SmaUiTheme.MUTED, SmaUiTheme.MUTED,
				SmaUiTheme.TEXT, SmaKit.value_color(float(row.get("pnl", 0.0)))])
		var sell := SmaKit.button(I18n.t("multiasset.sellAll"),
			_sell_fx.bind(String(row.get("id", "")), int(row.get("units", 0))))
		sell.add_theme_font_size_override("font_size", 10)
		sell.custom_minimum_size.x = 64
		line.add_child(sell)
		box.add_child(line)
	_body.add_child(card)


func _on_fx_selected(index: int) -> void:
	if _fx_select != null:
		_fx_id = String(_fx_select.get_item_metadata(index))


func _buy_fx(units: SpinBox) -> void:
	var result: Dictionary = game.buy_fx(_fx_id, int(units.value))
	if not bool(result.get("ok", false)):
		game.toast(I18n.t(String(result.get("error", "fx.errorUnknown"))))
		return
	game.toast(I18n.t("toast.fx_bought"))
	refresh()


func _sell_fx(pair_id: String, units: int) -> void:
	var result: Dictionary = game.sell_fx(pair_id, units)
	if not bool(result.get("ok", false)):
		game.toast(I18n.t(String(result.get("error", "fx.errorUnknown"))))
		return
	game.toast(I18n.t("toast.asset_sold"))
	refresh()


func _render_commodities() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(7)
	card.add_child(box)
	_section_head(box, "multiasset.commodityTitle", "multiasset.commoditySubtitle")
	var quotes: Array = game.commodity_quotes()
	box.add_child(_table_header([["multiasset.commodity", 2.0], ["multiasset.price", 1.0],
		["multiasset.change", 1.0]]))
	for row in quotes:
		box.add_child(_table_row([I18n.t(String(row.get("nameKey", ""))),
			SmaFormat.money(float(row.get("price", 0.0))),
			SmaFormat.pct(float(row.get("changePct", 0.0)), 2)],
			[2.0, 1.0, 1.0], [0, 1, 2], [SmaUiTheme.TEXT, SmaUiTheme.TEXT,
				SmaKit.value_color(float(row.get("changePct", 0.0)))]))
	var buy_row := SmaKit.hbox(6)
	var select := OptionButton.new()
	select.custom_minimum_size.x = 240
	for index in quotes.size():
		var row: Dictionary = quotes[index]
		select.add_item("%s · %s" % [I18n.t(String(row["nameKey"])),
			SmaFormat.money(float(row["price"]))])
		select.set_item_metadata(index, String(row["id"]))
		if String(row["id"]) == _commodity_id:
			select.select(index)
	select.item_selected.connect(_on_commodity_selected)
	_commodity_select = select
	buy_row.add_child(select)
	var qty := SpinBox.new()
	qty.min_value = 1
	qty.max_value = 100000
	qty.step = 1
	qty.value = 1
	qty.custom_minimum_size.x = 90
	buy_row.add_child(qty)
	buy_row.add_child(SmaKit.button(I18n.t("multiasset.buyCommodity"),
		_buy_commodity.bind(qty), true))
	box.add_child(buy_row)
	box.add_child(SmaKit.muted(I18n.t("multiasset.commodityNote"), 10))
	var rows: Array = game.commodity_rows()
	box.add_child(SmaKit.caption(I18n.t("multiasset.commodityPositionsTitle")))
	if rows.is_empty():
		box.add_child(SmaKit.muted(I18n.t("multiasset.noCommodityPositions"), 11))
		_body.add_child(card)
		return
	box.add_child(_table_header([["multiasset.commodity", 2.0], ["multiasset.qty", 0.6],
		["multiasset.avgCost", 0.9], ["multiasset.price", 0.9],
		["multiasset.value", 1.0], ["multiasset.pnl", 1.0], ["", 0.5]]))
	for row in rows:
		var name_key := "commodity.%s.name" % String(row.get("id", ""))
		var line := _table_row([
			I18n.t(name_key), SmaFormat.num(float(row.get("qty", 0)), 0),
			SmaFormat.money(float(row.get("costBasis", 0.0)) / maxf(1.0, float(row.get("qty", 0)))),
			SmaFormat.money(float(row.get("currentPrice", 0.0))),
			SmaFormat.money(float(row.get("value", 0.0))),
			SmaFormat.signed_money(float(row.get("pnl", 0.0)))],
			[2.0, 0.6, 0.9, 0.9, 1.0, 1.0], [0, 1, 2, 3, 4, 5],
			[SmaUiTheme.TEXT, SmaUiTheme.TEXT, SmaUiTheme.MUTED, SmaUiTheme.MUTED,
				SmaUiTheme.TEXT, SmaKit.value_color(float(row.get("pnl", 0.0)))])
		var sell := SmaKit.button(I18n.t("multiasset.sellAll"),
			_sell_commodity.bind(String(row.get("id", "")), int(row.get("qty", 0))))
		sell.add_theme_font_size_override("font_size", 10)
		sell.custom_minimum_size.x = 64
		line.add_child(sell)
		box.add_child(line)
	_body.add_child(card)


func _on_commodity_selected(index: int) -> void:
	if _commodity_select != null:
		_commodity_id = String(_commodity_select.get_item_metadata(index))


func _buy_commodity(qty: SpinBox) -> void:
	var result: Dictionary = game.buy_commodity(_commodity_id, int(qty.value))
	if not bool(result.get("ok", false)):
		game.toast(I18n.t(String(result.get("error", "commodity.errorUnknown"))))
		return
	game.toast(I18n.t("toast.commodity_bought"))
	refresh()


func _sell_commodity(commodity_id: String, qty: int) -> void:
	var result: Dictionary = game.sell_commodity(commodity_id, qty)
	if not bool(result.get("ok", false)):
		game.toast(I18n.t(String(result.get("error", "commodity.errorUnknown"))))
		return
	game.toast(I18n.t("toast.asset_sold"))
	refresh()


func _render_crypto() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(7)
	card.add_child(box)
	_section_head(box, "multiasset.cryptoTitle", "multiasset.cryptoSubtitle")
	var quotes: Array = game.crypto_quotes()
	box.add_child(_table_header([["multiasset.crypto", 2.0], ["multiasset.price", 1.0],
		["multiasset.change", 1.0]]))
	for row in quotes:
		box.add_child(_table_row([String(row.get("id", "")),
			SmaFormat.money(float(row.get("price", 0.0))),
			SmaFormat.pct(float(row.get("changePct", 0.0)), 2)],
			[2.0, 1.0, 1.0], [0, 1, 2], [SmaUiTheme.TEXT, SmaUiTheme.TEXT,
				SmaKit.value_color(float(row.get("changePct", 0.0)))]))
	var buy_row := SmaKit.hbox(6)
	var select := OptionButton.new()
	select.custom_minimum_size.x = 240
	for index in quotes.size():
		var row: Dictionary = quotes[index]
		select.add_item("%s · %s" % [String(row["id"]),
			SmaFormat.money(float(row["price"]))])
		select.set_item_metadata(index, String(row["id"]))
		if String(row["id"]) == _crypto_id:
			select.select(index)
	select.item_selected.connect(_on_crypto_selected)
	_crypto_select = select
	buy_row.add_child(select)
	var units := SpinBox.new()
	units.min_value = 0.001
	units.max_value = 1000000
	units.step = 0.001
	units.value = 0.01
	units.custom_minimum_size.x = 110
	buy_row.add_child(units)
	buy_row.add_child(SmaKit.button(I18n.t("multiasset.buyCrypto"),
		_buy_crypto.bind(units), true))
	box.add_child(buy_row)
	box.add_child(SmaKit.muted(I18n.t("multiasset.cryptoNote"), 10))
	var rows: Array = game.crypto_rows()
	box.add_child(SmaKit.caption(I18n.t("multiasset.cryptoPositionsTitle")))
	if rows.is_empty():
		box.add_child(SmaKit.muted(I18n.t("multiasset.noCryptoPositions"), 11))
		_body.add_child(card)
		return
	box.add_child(_table_header([["multiasset.crypto", 1.4], ["multiasset.units", 1.0],
		["multiasset.avgCost", 1.0], ["multiasset.price", 1.0],
		["multiasset.value", 1.0], ["multiasset.pnl", 1.0], ["", 0.5]]))
	for row in rows:
		var units_held := float(row.get("units", 0.0))
		var line := _table_row([
			String(row.get("id", "")), SmaFormat.quantity(units_held),
			SmaFormat.money(float(row.get("costBasis", 0.0)) / maxf(0.000001, units_held)),
			SmaFormat.money(float(row.get("currentPrice", 0.0))),
			SmaFormat.money(float(row.get("value", 0.0))),
			SmaFormat.signed_money(float(row.get("pnl", 0.0)))],
			[1.4, 1.0, 1.0, 1.0, 1.0, 1.0], [0, 1, 2, 3, 4, 5],
			[SmaUiTheme.TEXT, SmaUiTheme.TEXT, SmaUiTheme.MUTED, SmaUiTheme.MUTED,
				SmaUiTheme.TEXT, SmaKit.value_color(float(row.get("pnl", 0.0)))])
		var sell := SmaKit.button(I18n.t("multiasset.sellAll"),
			_sell_crypto.bind(String(row.get("id", "")), units_held))
		sell.add_theme_font_size_override("font_size", 10)
		sell.custom_minimum_size.x = 64
		line.add_child(sell)
		box.add_child(line)
	_body.add_child(card)


func _on_crypto_selected(index: int) -> void:
	if _crypto_select != null:
		_crypto_id = String(_crypto_select.get_item_metadata(index))


func _buy_crypto(units: SpinBox) -> void:
	var result: Dictionary = game.buy_crypto(_crypto_id, float(units.value))
	if not bool(result.get("ok", false)):
		game.toast(I18n.t(String(result.get("error", "crypto.errorUnknown"))))
		return
	game.toast(I18n.t("toast.crypto_bought"))
	refresh()


func _sell_crypto(crypto_id: String, units: float) -> void:
	var result: Dictionary = game.sell_crypto(crypto_id, units)
	if not bool(result.get("ok", false)):
		game.toast(I18n.t(String(result.get("error", "crypto.errorUnknown"))))
		return
	game.toast(I18n.t("toast.asset_sold"))
	refresh()


func _table_header(specs: Array) -> HBoxContainer:
	var row := SmaKit.hbox(8)
	for spec in specs:
		row.add_child(SmaKit.cell(I18n.t(String(spec[0])), float(spec[1]),
			HORIZONTAL_ALIGNMENT_LEFT if specs.find(spec) == 0 else HORIZONTAL_ALIGNMENT_RIGHT,
			SmaUiTheme.MUTED, 10))
	return row


func _table_row(values: Array, ratios: Array, aligns: Array,
		colors: Array = []) -> HBoxContainer:
	var row := SmaKit.hbox(8)
	for index in values.size():
		var align: HorizontalAlignment = HORIZONTAL_ALIGNMENT_LEFT
		if index < aligns.size():
			align = HORIZONTAL_ALIGNMENT_LEFT if int(aligns[index]) == 0 \
				else HORIZONTAL_ALIGNMENT_RIGHT
		var color := SmaUiTheme.TEXT
		if index < colors.size():
			color = colors[index]
		row.add_child(SmaKit.cell(String(values[index]), float(ratios[index]),
			align, color, 11))
	return row
