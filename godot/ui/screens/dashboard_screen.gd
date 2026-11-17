## Dashboard: learning focus, account snapshot, market pulse, first-stage path
## and recent activity. Read-only; every action navigates to another screen.
class_name SmaDashboardScreen
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
	_render_header()
	var columns := SmaKit.hbox(12)
	var learning := _render_learning()
	learning.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	columns.add_child(learning)
	var portfolio := _render_portfolio()
	portfolio.custom_minimum_size.x = 360
	columns.add_child(portfolio)
	_body.add_child(columns)
	var pulse := SmaKit.hbox(12)
	var market := _render_market_pulse()
	market.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pulse.add_child(market)
	var path := _render_path()
	path.custom_minimum_size.x = 380
	pulse.add_child(path)
	_body.add_child(pulse)
	_render_activity()
	var bottom := SmaKit.hbox(12)
	var corporate := _render_corporate()
	corporate.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bottom.add_child(corporate)
	var review := _render_review()
	review.custom_minimum_size.x = 420
	bottom.add_child(review)
	_body.add_child(bottom)


func _render_header() -> void:
	var hour := int(Time.get_datetime_dict_from_system().get("hour", 9))
	var greeting_key := "dashboard.greetingMorning"
	if hour >= 18:
		greeting_key = "dashboard.greetingEvening"
	elif hour >= 12:
		greeting_key = "dashboard.greetingAfternoon"
	var header := SmaKit.hbox(10)
	var title_box := SmaKit.vbox(0)
	title_box.add_child(SmaKit.caption(I18n.t("dashboard.eyebrow")))
	title_box.add_child(SmaKit.label(I18n.t(greeting_key), 22))
	title_box.add_child(SmaKit.muted(SmaCalendar.iso_date(game.get_day()), 12))
	header.add_child(title_box)
	header.add_child(SmaKit.hspacer())
	header.add_child(SmaKit.button(I18n.t("dashboard.openAcademy"),
		_go_academy, true))
	_body.add_child(header)


func _current_unit() -> Dictionary:
	for entry in SmaAcademy.units():
		if bool(entry.get("optional", false)):
			continue
		var unit_id := String(entry["id"])
		if not SmaAcademy.is_unit_unlocked(game.academy, unit_id):
			continue
		if SmaAcademy.is_unit_complete(game.academy, unit_id):
			continue
		return entry
	return {}


func _render_learning() -> PanelContainer:
	var card := SmaKit.card(14)
	var box := SmaKit.vbox(6)
	card.add_child(box)
	box.add_child(SmaKit.caption(I18n.t("dashboard.continueEyebrow")))
	var entry := _current_unit()
	if entry.is_empty():
		box.add_child(SmaKit.label(I18n.t("dashboard.stageCompleteTitle"), 20))
		var text := SmaKit.muted(I18n.t("dashboard.stageCompleteText"), 12)
		text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		box.add_child(text)
		box.add_child(SmaKit.button(I18n.t("dashboard.reviewAcademy"), _go_academy, true))
		return card
	var progress := SmaAcademy.progress_rows(game.academy, entry)
	var unit_id := String(entry["id"])
	box.add_child(SmaKit.label(I18n.t("dashboard.unitPill", {
		"number": entry.get("number", 0)}), 11, SmaUiTheme.ACCENT))
	box.add_child(SmaKit.label(I18n.t(String(entry["titleKey"])), 20))
	var summary := SmaKit.muted(I18n.t(String(entry["summaryKey"])), 12)
	summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(summary)
	var bar := ProgressBar.new()
	bar.max_value = 100
	bar.value = float(progress["pct"])
	bar.show_percentage = false
	bar.custom_minimum_size.y = 8
	box.add_child(bar)
	box.add_child(SmaKit.muted(I18n.t("dashboard.sectionsRead", {
		"read": progress["read"], "total": progress["total"]}), 11))
	var actions := SmaKit.hbox(6)
	actions.add_child(SmaKit.button(I18n.t("dashboard.resumeLesson"),
		_open_unit.bind(unit_id), true))
	actions.add_child(SmaKit.button(I18n.t("dashboard.openAcademy"), _go_academy))
	box.add_child(actions)
	return card


func _render_portfolio() -> PanelContainer:
	var card := SmaKit.card(14)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.caption(I18n.t("dashboard.portfolioEyebrow")))
	box.add_child(SmaKit.label(SmaFormat.money(game.get_equity()), 26))
	var initial := 100000.0
	if game.exchange != null:
		initial = float(game.exchange.state["account"].get("initialCash", initial))
	var ret: float = (game.get_equity() / initial - 1.0) * 100.0 if initial > 0.0 else 0.0
	box.add_child(SmaKit.label("%s %s" % [SmaFormat.pct(ret, 2),
		I18n.t("dashboard.sinceStart")], 12, SmaKit.value_color(ret)))
	var cash := 0.0
	var positions := 0
	if game.exchange != null:
		cash = float(game.exchange.state["account"]["cash"])
		positions = game.exchange.state["account"]["positions"].size()
	box.add_child(SmaKit.muted(I18n.t("dashboard.cashLine", {
		"value": SmaFormat.money(cash)}), 11))
	box.add_child(SmaKit.muted(I18n.t("dashboard.positionsLine", {
		"value": positions}), 11))
	box.add_child(SmaKit.button(I18n.t("nav.portfolio"), _go_portfolio))
	return card


func _render_market_pulse() -> PanelContainer:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("dashboard.marketPulse"), 15))
	box.add_child(SmaKit.muted(I18n.t("dashboard.marketPulseSubtitle"), 11))
	var index_row := SmaKit.hbox(8)
	index_row.add_child(SmaKit.caption(I18n.t("dashboard.indexLabel")))
	index_row.add_child(SmaKit.hspacer())
	index_row.add_child(SmaKit.label(SmaFormat.num(game.market_index(), 2), 16))
	index_row.add_child(SmaKit.label(SmaFormat.pct(game.market_index_change(), 2), 12,
		SmaKit.value_color(game.market_index_change())))
	box.add_child(index_row)
	var movers: Array = []
	if game.exchange != null:
		for ticker in game.exchange.state["companies"].keys():
			var cs: Dictionary = game.exchange.state["companies"][ticker]
			var last := float(cs.get("last", 0.0))
			var previous := float(cs.get("prevClose", last))
			var change := (last / previous - 1.0) * 100.0 if previous > 0.0 else 0.0
			movers.append({"ticker": String(ticker), "last": last, "change": change,
				"name": String(cs.get("company", {}).get("name", ticker))})
	movers.sort_custom(func(a, b): return float(a["change"]) > float(b["change"]))
	box.add_child(SmaKit.caption(I18n.t("dashboard.gainers")))
	for row in movers.slice(0, 2):
		box.add_child(_mover_row(row))
	box.add_child(SmaKit.caption(I18n.t("dashboard.losers")))
	var losers: Array = movers.slice(maxi(0, movers.size() - 2), movers.size())
	losers.reverse()
	for row in losers:
		box.add_child(_mover_row(row))
	box.add_child(SmaKit.button(I18n.t("nav.market"), _go_market))
	return card


func _mover_row(row: Dictionary) -> HBoxContainer:
	var line := SmaKit.hbox(6)
	line.add_child(SmaKit.label(String(row["ticker"]), 12))
	line.add_child(SmaKit.muted(String(row["name"]), 10))
	line.add_child(SmaKit.hspacer())
	line.add_child(SmaKit.label(SmaFormat.money(float(row["last"])), 11))
	line.add_child(SmaKit.label(SmaFormat.pct(float(row["change"]), 2), 11,
		SmaKit.value_color(float(row["change"]))))
	return line


func _render_path() -> PanelContainer:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("dashboard.pathTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("dashboard.pathSubtitle"), 11))
	for unit_id in ["u1", "u2", "u3", "u4"]:
		var entry := SmaAcademy.unit(unit_id)
		var progress := SmaAcademy.progress_rows(game.academy, entry)
		var line := SmaKit.hbox(6)
		line.add_child(SmaKit.caption("%02d" % int(entry.get("number", 0))))
		var title := SmaKit.label(I18n.t(String(entry["titleKey"])), 11,
			SmaUiTheme.TEXT if SmaAcademy.is_unit_complete(game.academy, unit_id) \
				else SmaUiTheme.MUTED)
		title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		line.add_child(title)
		line.add_child(SmaKit.caption("%d / %d" % [
			int(progress["read"]), int(progress["total"])]))
		box.add_child(line)
	box.add_child(SmaKit.button(I18n.t("nav.academy"), _go_academy))
	return card


func _render_activity() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("dashboard.activityTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("dashboard.activitySubtitle"), 11))
	var trades: Array = []
	if game.exchange != null:
		trades = game.exchange.state["account"].get("trades", [])
	if trades.is_empty():
		box.add_child(SmaKit.muted(I18n.t("dashboard.noTradesTitle"), 12))
		_body.add_child(card)
		return
	for index in mini(4, trades.size()):
		var trade: Dictionary = trades[index]
		var line := SmaKit.hbox(8)
		line.add_child(SmaKit.caption(String(trade.get("side", "")).to_upper()))
		line.add_child(SmaKit.label(String(trade.get("ticker", "")), 12))
		line.add_child(SmaKit.muted(I18n.t("dashboard.tradeMeta", {
			"qty": SmaFormat.num(float(trade.get("qty", 0)), 0),
			"price": SmaFormat.money(float(trade.get("price", 0.0)))}), 11))
		box.add_child(line)
	_body.add_child(card)


func _go_academy() -> void:
	var main := get_tree().get_first_node_in_group("main")
	if main != null:
		main.navigate("academy")


func _render_corporate() -> PanelContainer:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("dashboard.corporateTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("dashboard.corporateSubtitle"), 11))
	var offerings: Array = game.rights_offerings()
	for offering in offerings:
		var line := SmaKit.vbox(2)
		var text := SmaKit.muted(I18n.t("dashboard.rightsTerms", {
			"ticker": String(offering["ticker"]),
			"ratio": SmaFormat.num(float(offering["ratio"]) * 100.0, 0),
			"price": SmaFormat.money(float(offering["price"])),
			"deadline": SmaCalendar.iso_date(int(offering["deadlineDay"])),
		}), 11)
		text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		line.add_child(text)
		var actions := SmaKit.hbox(6)
		actions.add_child(SmaKit.button(I18n.t("dashboard.subscribe"),
			_subscribe_rights.bind(String(offering["id"])), true))
		actions.add_child(SmaKit.button(I18n.t("dashboard.decline"),
			_decline_rights.bind(String(offering["id"]))))
		line.add_child(actions)
		box.add_child(line)
	var actions_rows: Array = game.corporate_actions(6)
	if actions_rows.is_empty():
		box.add_child(SmaKit.muted(I18n.t("dashboard.noCorporate"), 11))
	for action in actions_rows:
		var kind := String(action.get("type", ""))
		var line := SmaKit.hbox(6)
		line.add_child(SmaKit.label(I18n.t("corporate.type.%s" % kind), 11,
			SmaUiTheme.ACCENT))
		line.add_child(SmaKit.label(String(action.get("ticker", "")), 11))
		line.add_child(SmaKit.hspacer())
		if action.has("ratio"):
			line.add_child(SmaKit.muted("×" + SmaFormat.num(float(action["ratio"]), 2), 10))
		if action.has("dps"):
			line.add_child(SmaKit.muted(SmaFormat.money(float(action["dps"])), 10))
		line.add_child(SmaKit.caption(SmaCalendar.iso_date(int(action.get("day", 0)))))
		box.add_child(line)
	return card


func _subscribe_rights(offering_id: String) -> void:
	game.subscribe_rights(offering_id)
	refresh()


func _decline_rights(offering_id: String) -> void:
	game.decline_rights(offering_id)
	refresh()


func _render_review() -> PanelContainer:
	var summary: Dictionary = game.review_summary()
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("dashboard.reviewTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("dashboard.reviewSubtitle"), 11))
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 3)
	for spec in [
		["dashboard.winRate", SmaFormat.pct_plain(float(summary.get("winRatePct", 0.0)), 1)],
		["dashboard.profitFactor", SmaFormat.num(float(summary.get("profitFactor", 0.0)), 2)],
		["dashboard.realized", SmaFormat.signed_money(float(summary.get("realizedPnl", 0.0)))],
		["dashboard.dividends", SmaFormat.money(float(summary.get("dividends", 0.0)))],
		["dashboard.concentration", SmaFormat.pct_plain(float(
			summary.get("concentrationPct", 0.0)), 1)],
	]:
		var stat := SmaKit.vbox(0)
		stat.add_child(SmaKit.caption(I18n.t(String(spec[0]))))
		stat.add_child(SmaKit.label(String(spec[1]), 13))
		grid.add_child(stat)
	box.add_child(grid)
	box.add_child(SmaKit.separator())
	var timeline: Array = game.review_timeline(6)
	if timeline.is_empty():
		box.add_child(SmaKit.muted(I18n.t("dashboard.noTimeline"), 11))
	for row in timeline:
		var kind := String(row.get("kind", ""))
		var side := String(row.get("side", ""))
		var line := SmaKit.hbox(6)
		line.add_child(SmaKit.caption(SmaCalendar.iso_date(int(row.get("day", 0)))))
		line.add_child(SmaKit.label(I18n.t("review.kind.%s" % kind), 10,
			SmaUiTheme.MUTED))
		line.add_child(SmaKit.label(String(row.get("ticker", "")), 11))
		line.add_child(SmaKit.hspacer())
		line.add_child(SmaKit.muted(_side_text(kind, side), 10))
		line.add_child(SmaKit.label(SmaFormat.money(float(row.get("amount", 0.0))), 10))
		box.add_child(line)
	return card


func _side_text(kind: String, side: String) -> String:
	if kind == "dividend":
		return ""
	if kind == "futures":
		return I18n.t("futures.open" if side == "open" else "futures.close")
	if kind == "option":
		return I18n.t("trade.%s" % side) if I18n.has_key("trade.%s" % side) else side
	var key := "trade.%s" % side
	return I18n.t(key) if I18n.has_key(key) else side


func _open_unit(unit_id: String) -> void:
	var main := get_tree().get_first_node_in_group("main")
	if main == null:
		return
	main.navigate("academy")
	if main._screens.has("academy"):
		main._screens["academy"]._select_unit(unit_id)


func _go_portfolio() -> void:
	var main := get_tree().get_first_node_in_group("main")
	if main != null:
		main.navigate("portfolio")


func _go_market() -> void:
	var main := get_tree().get_first_node_in_group("main")
	if main != null:
		main.navigate("market")
