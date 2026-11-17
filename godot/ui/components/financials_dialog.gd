## Company financial statement summary used by unit 11 and the trade screen.
## Values are the simulated catalog figures, clearly labelled as teaching data.
class_name SmaFinancialsDialog
extends Control

signal closed

var game: Node
var ticker: String


func setup(game_ref: Node, target_ticker: String) -> void:
	game = game_ref
	ticker = target_ticker
	_build()
	if game != null and game.has_method("academy_record_financials"):
		game.academy_record_financials(ticker)


func _build() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	z_index = 58
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
	var company: Dictionary = game.exchange.company(ticker)
	var financials: Dictionary = company.get("financials", {})
	var header := SmaKit.hbox(10)
	header.add_child(SmaKit.label(ticker, 22, SmaUiTheme.ACCENT))
	header.add_child(SmaKit.label(String(company.get("name", ticker)), 15))
	header.add_child(SmaKit.hspacer())
	header.add_child(SmaKit.button(I18n.t("common.close"), _close))
	root.add_child(header)
	root.add_child(SmaKit.muted(I18n.t("financials.subtitle"), 12))
	root.add_child(SmaKit.separator())
	var columns := GridContainer.new()
	columns.columns = 2
	columns.add_theme_constant_override("h_separation", 16)
	columns.add_theme_constant_override("v_separation", 12)
	root.add_child(columns)
	columns.add_child(_section("financials.income", [
		["financials.revenue", _compact(financials.get("revenue", 0.0))],
		["financials.grossProfit", _compact(financials.get("grossProfit", 0.0))],
		["financials.operatingIncome", _compact(financials.get("operatingIncome", 0.0))],
		["financials.netIncome", _compact(financials.get("netIncome", 0.0))],
		["financials.eps", SmaFormat.num(float(financials.get("eps", 0.0)), 2)],
	]))
	columns.add_child(_section("financials.balance", [
		["financials.assets", _compact(financials.get("totalAssets", 0.0))],
		["financials.liabilities", _compact(financials.get("totalLiabilities", 0.0))],
		["financials.equity", _compact(financials.get("equity", 0.0))],
		["financials.cash", _compact(financials.get("cash", 0.0))],
		["financials.debt", _compact(financials.get("debt", 0.0))],
	]))
	columns.add_child(_section("financials.cashflow", [
		["financials.ocf", _compact(financials.get("operatingCashFlow", 0.0))],
		["financials.capex", _compact(financials.get("capex", 0.0))],
		["financials.fcf", _compact(financials.get("freeCashFlow", 0.0))],
	]))
	columns.add_child(_section("financials.ratios", [
		["financials.pe", SmaFormat.num(_number(financials.get("pe", 0.0)), 1)],
		["financials.pb", SmaFormat.num(_number(financials.get("pb", 0.0)), 2)],
		["financials.roe", SmaFormat.pct(_number(financials.get("roe", 0.0)) * 100.0)],
		["financials.roic", SmaFormat.pct(_number(financials.get("roic", 0.0)) * 100.0)],
		["financials.dividend", SmaFormat.money(_number(financials.get("dividendPerShare", 0.0)))],
	]))
	root.add_child(SmaKit.hspacer())
	var note := SmaKit.muted(I18n.t("financials.note"), 11)
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	root.add_child(note)


func _section(title_key: String, rows: Array) -> Control:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(6)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t(title_key), 14, SmaUiTheme.ACCENT))
	for row in rows:
		var line := SmaKit.hbox(8)
		line.add_child(SmaKit.caption(I18n.t(String(row[0]))))
		line.add_child(SmaKit.hspacer())
		line.add_child(SmaKit.label(String(row[1]), 12))
		box.add_child(line)
	return card


func _compact(value: Variant) -> String:
	var number := _number(value)
	if absf(number) >= 1_000_000.0:
		return "$" + SmaFormat.compact(number)
	return SmaFormat.money(number, 0)


func _number(value: Variant) -> float:
	return float(value) if value != null else 0.0


func _close() -> void:
	closed.emit()
	queue_free()
