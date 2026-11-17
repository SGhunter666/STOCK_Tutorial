## Portfolio: account summary, long/short books and the fill ledger. Rebuilds the
## tables on state changes and at a low frequency on ticks to avoid layout churn.
class_name SmaPortfolioScreen
extends SmaScreen

const REFRESH_INTERVAL_MS := 350

var _stat_values: Dictionary = {}
var _long_box: VBoxContainer
var _short_box: VBoxContainer
var _fills_box: VBoxContainer
var _status_label: Label
var _last_rebuild := 0


func _build() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	var root := SmaKit.vbox(12)
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(root)

	var heading := SmaKit.vbox(2)
	heading.add_child(SmaKit.title(I18n.t("portfolio.title"), 22))
	heading.add_child(SmaKit.muted(I18n.t("portfolio.subtitle")))
	root.add_child(heading)

	var stats_card := SmaKit.card(12)
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 18)
	grid.add_theme_constant_override("v_separation", 12)
	stats_card.add_child(grid)
	for key in ["equity", "cash", "buying_power", "maintenance", "realized", "fees", "day_pnl", "margin_status"]:
		var box := SmaKit.vbox(1)
		box.add_child(SmaKit.caption(I18n.t("portfolio.%s" % key)))
		var value := SmaKit.label("—", 17)
		box.add_child(value)
		_stat_values[key] = value
		if key == "margin_status":
			_status_label = value
		grid.add_child(box)
	root.add_child(stats_card)

	var long_section := _table_section("portfolio.positions", ["market.ticker", "market.company",
		"common.qty", "portfolio.avg_cost", "market.last", "portfolio.market_value",
		"portfolio.unrealized"], [0.7, 1.8, 0.8, 0.9, 0.9, 1.1, 1.1], true)
	root.add_child(long_section["card"])
	_long_box = long_section["body"]
	var short_section := _table_section("portfolio.shorts", ["market.ticker", "market.company",
		"common.qty", "portfolio.avg_price", "market.last", "portfolio.market_value",
		"portfolio.unrealized"], [0.7, 1.8, 0.8, 0.9, 0.9, 1.1, 1.1], false)
	root.add_child(short_section["card"])
	_short_box = short_section["body"]
	var fills_section := _table_section("portfolio.trades", ["common.day", "market.ticker", "common.side",
		"common.qty", "common.price", "portfolio.realized"], [0.9, 0.8, 0.9, 0.9, 0.9, 1.2], true)
	root.add_child(fills_section["card"])
	_fills_box = fills_section["body"]


func _table_section(title_key: String, columns: Array, ratios: Array, expand: bool) -> Dictionary:
	var card := SmaKit.card(0)
	var box := SmaKit.vbox(0)
	card.add_child(box)
	var head := SmaKit.hbox(8)
	var title := SmaKit.label(I18n.t(title_key), 13)
	title.custom_minimum_size.x = 160
	head.add_child(title)
	head.add_child(SmaKit.hspacer())
	box.add_child(head)
	var header := SmaKit.header_row(columns, ratios)
	header.custom_minimum_size.y = 26
	box.add_child(header)
	var scroll := SmaKit.scroll(140 if expand else 110)
	var body := SmaKit.vbox(2)
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(body)
	box.add_child(scroll)
	return {"card": card, "body": body}


func refresh(reason: String = "") -> void:
	if game == null or not game.started or game.exchange == null:
		return
	if reason == "" and Time.get_ticks_msec() - _last_rebuild < REFRESH_INTERVAL_MS:
		return
	_last_rebuild = Time.get_ticks_msec()
	_update_stats()
	_update_long()
	_update_short()
	_update_fills()


func on_tick() -> void:
	refresh()


func _update_stats() -> void:
	var exchange: SmaExchange = game.exchange
	var account: Dictionary = exchange.state["account"]
	var snapshot := SmaMargin.margin_snapshot(exchange.state)
	var equity := float(snapshot["equity"])
	var day_start := _day_start_equity()
	var day_pnl := equity - day_start
	_stat_values["equity"].text = SmaFormat.money(equity)
	_stat_values["cash"].text = SmaFormat.money(float(account["cash"]))
	_stat_values["buying_power"].text = SmaFormat.money(float(snapshot["buyingPower"]))
	_stat_values["maintenance"].text = SmaFormat.money(float(snapshot["maintenanceExcess"]))
	_stat_values["realized"].text = SmaFormat.signed_money(float(account["realizedPnl"]))
	_stat_values["realized"].add_theme_color_override("font_color",
		SmaKit.value_color(float(account["realizedPnl"])))
	_stat_values["fees"].text = SmaFormat.money(float(account["fees"]))
	_stat_values["day_pnl"].text = SmaFormat.signed_money(day_pnl)
	_stat_values["day_pnl"].add_theme_color_override("font_color", SmaKit.value_color(day_pnl))
	var status := String(snapshot["status"])
	_status_label.text = I18n.t("portfolio.margin_%s" % status)
	if status == "ok":
		_status_label.add_theme_color_override("font_color", SmaUiTheme.POSITIVE)
	elif status == "call":
		_status_label.add_theme_color_override("font_color", SmaUiTheme.WARNING)
	else:
		_status_label.add_theme_color_override("font_color", SmaUiTheme.NEGATIVE)


func _day_start_equity() -> float:
	var exchange: SmaExchange = game.exchange
	var history: Array = exchange.state["account"]["equityHistory"]
	var day := int(exchange.state["dayIndex"])
	var value := float(exchange.state["account"]["initialCash"])
	for point in history:
		if int(point.get("day", 0)) < day:
			value = float(point.get("equity", value))
	return value


func _update_long() -> void:
	SmaKit.clear_children(_long_box)
	var rows: Array = game.exchange.position_rows()
	if rows.is_empty():
		_long_box.add_child(SmaKit.muted(I18n.t("portfolio.no_positions")))
		return
	for row in rows:
		_long_box.add_child(SmaKit.data_row([
			String(row["ticker"]), String(row["name"]), SmaFormat.quantity(float(row["qty"])),
			SmaFormat.num(float(row["avgCost"]), 2), SmaFormat.num(float(row["last"]), 2),
			SmaFormat.money(float(row["marketValue"])), SmaFormat.signed_money(float(row["unrealized"])),
		], [0.7, 1.8, 0.8, 0.9, 0.9, 1.1, 1.1], [
			SmaUiTheme.ACCENT, SmaUiTheme.TEXT, SmaUiTheme.TEXT, SmaUiTheme.MUTED,
			SmaUiTheme.TEXT, SmaUiTheme.TEXT, SmaKit.value_color(float(row["unrealized"])),
		], [HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT,
			HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT,
			HORIZONTAL_ALIGNMENT_RIGHT]))


func _update_short() -> void:
	SmaKit.clear_children(_short_box)
	var rows: Array = game.exchange.short_rows()
	if rows.is_empty():
		_short_box.add_child(SmaKit.muted(I18n.t("portfolio.no_shorts")))
		return
	for row in rows:
		_short_box.add_child(SmaKit.data_row([
			String(row["ticker"]), String(row["name"]), SmaFormat.quantity(float(row["qty"])),
			SmaFormat.num(float(row["avgPrice"]), 2), SmaFormat.num(float(row["last"]), 2),
			SmaFormat.money(float(row["marketValue"])), SmaFormat.signed_money(float(row["unrealized"])),
		], [0.7, 1.8, 0.8, 0.9, 0.9, 1.1, 1.1], [
			SmaUiTheme.NEGATIVE, SmaUiTheme.TEXT, SmaUiTheme.TEXT, SmaUiTheme.MUTED,
			SmaUiTheme.TEXT, SmaUiTheme.TEXT, SmaKit.value_color(float(row["unrealized"])),
		], [HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT,
			HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT,
			HORIZONTAL_ALIGNMENT_RIGHT]))


func _update_fills() -> void:
	SmaKit.clear_children(_fills_box)
	var fills: Array = game.exchange.state["account"]["trades"]
	if fills.is_empty():
		_fills_box.add_child(SmaKit.muted(I18n.t("portfolio.no_trades")))
		return
	var start := maxi(0, fills.size() - 12)
	for index in range(fills.size() - 1, start - 1, -1):
		var fill: Dictionary = fills[index]
		var side := String(fill.get("action", fill.get("side", "")))
		var labels := {
			"openLong": I18n.t("trade.buy"), "closeLong": I18n.t("trade.sell"),
			"openShort": I18n.t("trade.short"), "closeShort": I18n.t("trade.cover"),
		}
		var side_text: String = String(labels.get(side, side))
		var side_color: Color = SmaUiTheme.POSITIVE if side == "openLong" or side == "closeShort" else SmaUiTheme.NEGATIVE
		_fills_box.add_child(SmaKit.data_row([
			"%s %s" % [String(fill.get("date", "")).substr(5), String(fill.get("time", "")).substr(0, 5)],
			String(fill.get("ticker", "")), side_text,
			SmaFormat.quantity(float(fill.get("qty", 0))),
			SmaFormat.num(float(fill.get("price", 0.0)), 2),
			SmaFormat.signed_money(float(fill.get("realized", 0.0))),
		], [0.9, 0.8, 0.9, 0.9, 0.9, 1.2], [
			SmaUiTheme.MUTED, SmaUiTheme.ACCENT, side_color, SmaUiTheme.TEXT,
			SmaUiTheme.TEXT, SmaKit.value_color(float(fill.get("realized", 0.0))),
		], [HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_LEFT,
			HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))
