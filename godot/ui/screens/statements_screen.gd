## Read-only company statement view. Reports come from the deterministic
## quarterly model in SmaFundamentals; the page never invents live filings.
class_name SmaStatementsScreen
extends SmaScreen

var _body: VBoxContainer
var _ticker := "APLA"
var _quarter_index := 0


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
	var tickers: Array = SmaCompanyCatalog.load_companies().keys()
	tickers.sort()
	if not tickers.has(_ticker):
		_ticker = String(tickers[0])
	var history: Array = game.statement_history(_ticker, 8)
	if history.is_empty():
		_body.add_child(SmaKit.muted(I18n.t("exchange.noReport"), 12))
		return
	_quarter_index = clampi(_quarter_index, 0, history.size() - 1)
	var report: Dictionary = history[_quarter_index]
	_render_header(tickers, history, report)
	_render_summary(report)
	_render_sections(report)


func _render_header(tickers: Array, history: Array, report: Dictionary) -> void:
	var header := SmaKit.hbox(10)
	var titles := SmaKit.vbox(2)
	titles.add_child(SmaKit.label(I18n.t("statements.title"), 20))
	titles.add_child(SmaKit.muted(I18n.t("statements.subtitle"), 12))
	header.add_child(titles)
	header.add_child(SmaKit.hspacer())
	var ticker_select := OptionButton.new()
	for index in tickers.size():
		ticker_select.add_item(String(tickers[index]))
		if String(tickers[index]) == _ticker:
			ticker_select.selected = index
	ticker_select.custom_minimum_size.x = 110
	ticker_select.item_selected.connect(func(index):
		_ticker = String(tickers[index])
		_quarter_index = 0
		refresh())
	header.add_child(ticker_select)
	var quarter_select := OptionButton.new()
	for index in history.size():
		quarter_select.add_item(String(history[index]["periodLabel"]))
	quarter_select.selected = _quarter_index
	quarter_select.custom_minimum_size.x = 140
	quarter_select.item_selected.connect(func(index):
		_quarter_index = index
		refresh())
	header.add_child(quarter_select)
	_body.add_child(header)


func _render_summary(report: Dictionary) -> void:
	var company := SmaCompanyCatalog.get_company(_ticker)
	var income: Dictionary = report["income"]
	var ratios: Dictionary = report["ratios"]
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	box.add_child(SmaKit.label("%s · %s" % [_ticker, String(company.get("name", ""))], 16))
	var note := SmaKit.muted("%s · %s · %s" % [
		SmaKit.sector_label(String(company.get("sector", ""))),
		String(report["periodLabel"]),
		I18n.t("statements.note")], 10)
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(note)
	var grid := SmaKit.hbox(20)
	grid.add_child(_metric("exchange.reportPeriod", String(report["periodLabel"])))
	grid.add_child(_metric("exchange.reportedOnLabel", String(report["reportDate"])))
	grid.add_child(_metric("exchange.reportEps", SmaFormat.money(float(income["eps"]))))
	grid.add_child(_metric("exchange.reportNetMargin",
		SmaFormat.pct_plain(float(ratios["netMargin"]) * 100.0, 1)))
	grid.add_child(_metric("exchange.statement.sharesOutstanding",
		SmaFormat.compact(float(income["sharesOutstanding"]))))
	if float(report["splitFactor"]) > 1.0:
		grid.add_child(_metric("exchange.statementSplitFactor",
			"×" + SmaFormat.num(float(report["splitFactor"]), 0)))
	box.add_child(grid)
	_body.add_child(card)


func _metric(label_key: String, value: String) -> VBoxContainer:
	var box := SmaKit.vbox(0)
	box.add_child(SmaKit.caption(I18n.t(label_key)))
	box.add_child(SmaKit.label(value, 12))
	return box


func _render_sections(report: Dictionary) -> void:
	var income: Dictionary = report["income"]
	var balance: Dictionary = report["balance"]
	var cash_flow: Dictionary = report["cashFlow"]
	var ratios: Dictionary = report["ratios"]
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	grid.add_child(_section("exchange.incomeStatement", [
		["exchange.statement.revenue", SmaFormat.money(float(income["revenue"]))],
		["exchange.statement.cogs", SmaFormat.money(float(income["cogs"]))],
		["exchange.statement.grossProfit", SmaFormat.money(float(income["grossProfit"]))],
		["exchange.statement.operatingExpenses", SmaFormat.money(float(income["operatingExpenses"]))],
		["exchange.statement.operatingIncome", SmaFormat.money(float(income["operatingIncome"]))],
		["exchange.statement.interestExpense", SmaFormat.money(float(income["interestExpense"]))],
		["exchange.statement.pretaxIncome", SmaFormat.money(float(income["pretaxIncome"]))],
		["exchange.statement.taxExpense", SmaFormat.money(float(income["taxExpense"]))],
		["exchange.statement.netIncome", SmaFormat.money(float(income["netIncome"]))],
		["exchange.statement.eps", SmaFormat.money(float(income["eps"]))],
		["exchange.statement.dividendsPaid", SmaFormat.money(float(income["dividendsPaid"]))],
	]))
	grid.add_child(_section("exchange.balanceSheet", [
		["exchange.statement.cash", SmaFormat.money(float(balance["cash"]))],
		["exchange.statement.receivables", SmaFormat.money(float(balance["receivables"]))],
		["exchange.statement.inventory", SmaFormat.money(float(balance["inventory"]))],
		["exchange.statement.ppe", SmaFormat.money(float(balance["ppe"]))],
		["exchange.statement.totalAssets", SmaFormat.money(float(balance["totalAssets"]))],
		["exchange.statement.debt", SmaFormat.money(float(balance["debt"]))],
		["exchange.statement.otherLiabilities", SmaFormat.money(float(balance["otherLiabilities"]))],
		["exchange.statement.totalLiabilities", SmaFormat.money(float(balance["totalLiabilities"]))],
		["exchange.statement.equity", SmaFormat.money(float(balance["equity"]))],
	]))
	grid.add_child(_section("exchange.cashFlowStatement", [
		["exchange.statement.operatingCashFlow", SmaFormat.money(float(cash_flow["operatingCashFlow"]))],
		["exchange.statement.capex", SmaFormat.money(float(cash_flow["capex"]))],
		["exchange.statement.investingCashFlow", SmaFormat.money(float(cash_flow["investingCashFlow"]))],
		["exchange.statement.financingCashFlow", SmaFormat.money(float(cash_flow["financingCashFlow"]))],
		["exchange.statement.debtIssuance", SmaFormat.money(float(cash_flow["debtIssuance"]))],
		["exchange.statement.dividendsPaid", SmaFormat.money(float(cash_flow["dividendsPaid"]))],
		["exchange.statement.netChange", SmaFormat.money(float(cash_flow["netChange"]))],
		["exchange.statement.freeCashFlow", SmaFormat.money(float(cash_flow["freeCashFlow"]))],
	]))
	grid.add_child(_section("exchange.statementRatios", [
		["exchange.statement.grossMargin", SmaFormat.pct_plain(float(ratios["grossMargin"]) * 100.0, 1)],
		["exchange.statement.operatingMargin", SmaFormat.pct_plain(float(ratios["operatingMargin"]) * 100.0, 1)],
		["exchange.statement.netMargin", SmaFormat.pct_plain(float(ratios["netMargin"]) * 100.0, 1)],
		["exchange.statement.roe", SmaFormat.pct_plain(float(ratios["roe"]) * 100.0, 1)],
		["exchange.statement.debtToEquity", SmaFormat.num(float(ratios["debtToEquity"]), 2)],
		["exchange.statement.bookValuePerShare", SmaFormat.money(float(ratios["bookValuePerShare"]))],
		["exchange.statement.annualDividendPerShare", SmaFormat.money(float(ratios["annualDividendPerShare"]))],
		["exchange.statement.quarterlyDividendPerShare", SmaFormat.money(float(ratios["quarterlyDividendPerShare"]))],
	]))
	_body.add_child(grid)
	var source := SmaKit.muted(I18n.t("exchange.statementsNote"), 10)
	source.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_body.add_child(source)


func _section(title_key: String, rows: Array) -> PanelContainer:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(3)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t(title_key), 14))
	for row in rows:
		var line := SmaKit.hbox(8)
		line.add_child(SmaKit.muted(I18n.t(String(row[0])), 11))
		line.add_child(SmaKit.hspacer())
		line.add_child(SmaKit.label(String(row[1]), 11))
		box.add_child(line)
	return card
