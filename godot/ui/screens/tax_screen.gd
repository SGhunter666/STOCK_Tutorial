## Tax Lab: a read-only educational UK estimate for the simulated share ledger.
## The page never changes cash, positions or the save file.
class_name SmaTaxScreen
extends SmaScreen

var _body: VBoxContainer
var _account_select: OptionButton
var _band_select: OptionButton
var _income_input: SpinBox
var _fx_input: SpinBox
var _isa_input: SpinBox
var _uk_check: CheckBox
var _config: Dictionary = SmaTax.default_config()


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
	_account_select = null
	_band_select = null
	_income_input = null
	_fx_input = null
	_isa_input = null
	_uk_check = null
	if game == null or not game.started:
		return
	_render_header()
	_render_form()
	_render_results()


func _render_header() -> void:
	var header := SmaKit.hbox(10)
	var titles := SmaKit.vbox(2)
	titles.add_child(SmaKit.label(I18n.t("tax.title"), 20))
	var subtitle := SmaKit.muted(I18n.t("tax.subtitle"), 12)
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	titles.add_child(subtitle)
	header.add_child(titles)
	header.add_child(SmaKit.hspacer())
	header.add_child(SmaKit.label(I18n.t("tax.estimateBadge"), 11, SmaUiTheme.WARNING))
	_body.add_child(header)


func _render_form() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(8)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("tax.formTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("tax.formSubtitle"), 11))
	var row := SmaKit.hbox(14)
	row.add_child(_field_select("tax.accountType", ["gia", "isa"],
		["tax.gia", "tax.isaOption"], "account"))
	row.add_child(_field_select("tax.incomeBand", ["basic", "higher", "additional"],
		["tax.bandBasic", "tax.bandHigher", "tax.bandAdditional"], "band"))
	row.add_child(_field_spin("tax.taxableIncome", 0, 1000000, 1000, "income"))
	row.add_child(_field_spin("tax.fxRate", 0.01, 5.0, 0.0001, "fx", 4))
	row.add_child(_field_spin("tax.isaContributions", 0, 100000, 1000, "isa"))
	_uk_check = CheckBox.new()
	_uk_check.text = I18n.t("tax.ukShares")
	_uk_check.button_pressed = bool(_config.get("ukShares", true))
	row.add_child(_uk_check)
	box.add_child(row)
	box.add_child(SmaKit.button(I18n.t("tax.recalculate"), _recalculate, true))
	_body.add_child(card)


func _field_select(label_key: String, values: Array, label_keys: Array, kind: String) -> VBoxContainer:
	var box := SmaKit.vbox(2)
	box.add_child(SmaKit.caption(I18n.t(label_key)))
	var select := OptionButton.new()
	for option_key in label_keys:
		select.add_item(I18n.t(String(option_key)))
	var current := String(_config.get("accountType", "gia") if kind == "account"
		else _config.get("incomeBand", "basic"))
	select.selected = maxi(0, values.find(current))
	select.custom_minimum_size.x = 150
	box.add_child(select)
	if kind == "account":
		_account_select = select
	else:
		_band_select = select
	return box


func _field_spin(label_key: String, minimum: float, maximum: float, step: float,
		kind: String, digits: int = 0) -> VBoxContainer:
	var box := SmaKit.vbox(2)
	box.add_child(SmaKit.caption(I18n.t(label_key)))
	var input := SpinBox.new()
	input.min_value = minimum
	input.max_value = maximum
	input.step = step
	input.custom_minimum_size.x = 130
	match kind:
		"income":
			input.value = float(_config.get("taxableIncome", 0.0))
			_income_input = input
		"fx":
			input.value = float(_config.get("fxRate", 0.79))
			input.step = 0.0001
			_fx_input = input
		"isa":
			input.value = float(_config.get("isaContributions", 0.0))
			_isa_input = input
	box.add_child(input)
	return box


func _read_config() -> Dictionary:
	var config := _config.duplicate(true)
	if _account_select != null:
		config["accountType"] = "gia" if _account_select.selected == 0 else "isa"
	if _band_select != null:
		config["incomeBand"] = ["basic", "higher", "additional"][_band_select.selected]
	if _income_input != null:
		config["taxableIncome"] = _income_input.value
	if _fx_input != null:
		config["fxRate"] = _fx_input.value
	if _isa_input != null:
		config["isaContributions"] = _isa_input.value
	if _uk_check != null:
		config["ukShares"] = _uk_check.button_pressed
	_config = config
	return config


func _recalculate() -> void:
	_read_config()
	refresh()


func _render_results() -> void:
	var result: Dictionary = game.tax_estimate(_read_config())
	if not bool(result.get("ok", false)):
		var error_card := SmaKit.card(12)
		var error_box := SmaKit.vbox(4)
		error_card.add_child(error_box)
		error_box.add_child(SmaKit.label(I18n.t("tax.errorTitle"), 15))
		error_box.add_child(SmaKit.muted(I18n.t(error_key(result)), 12))
		error_box.add_child(SmaKit.muted(I18n.t("tax.errorHint"), 11))
		_body.add_child(error_card)
		return
	if game.exchange.state["account"].get("trades", []).is_empty() \
			and game.exchange.state["account"].get("dividends", []).is_empty():
		_body.add_child(SmaKit.muted(I18n.t("tax.empty"), 12))
	_render_summary(result)
	_render_cgt(result)
	_render_disposals(result)
	_render_dividends(result)
	_render_isa(result)
	_render_warnings(result)
	_render_about()


func error_key(result: Dictionary) -> String:
	return String(result.get("error", "tax.errorTitle"))


func _render_summary(result: Dictionary) -> void:
	var summary: Dictionary = result["summary"]
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_child(_stat("tax.cgt", _gbp(float(summary["cgt"])), "tax.cgtSub", SmaUiTheme.TEXT))
	grid.add_child(_stat("tax.dividendTax", _gbp(float(summary["dividendTax"])),
		"tax.dividendTaxSub", SmaUiTheme.TEXT))
	grid.add_child(_stat("tax.sdrt", _gbp(float(summary["sdrt"])), "tax.sdrtSub", SmaUiTheme.TEXT))
	grid.add_child(_stat("tax.totalTax", _gbp(float(summary["totalTax"])),
		"tax.totalTaxSub", SmaUiTheme.ACCENT))
	_body.add_child(grid)


func _stat(label_key: String, value: String, sub_key: String, color: Color) -> PanelContainer:
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(2)
	card.add_child(box)
	box.add_child(SmaKit.caption(I18n.t(label_key)))
	box.add_child(SmaKit.label(value, 16, color))
	box.add_child(SmaKit.muted(I18n.t(sub_key), 10))
	return card


func _gbp(value: float) -> String:
	var sign_text := "-" if value < 0.0 else ""
	return "%s£%s" % [sign_text, SmaFormat.num(absf(value), 2)]


func _signed_gbp(value: float) -> String:
	var sign_text := "+" if value > 0.0 else ("-" if value < 0.0 else "")
	return "%s£%s" % [sign_text, SmaFormat.num(absf(value), 2)]


func _render_cgt(result: Dictionary) -> void:
	var cgt: Dictionary = result["cgt"]
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("tax.cgtTitle"), 15))
	if bool(cgt["exempt"]):
		box.add_child(SmaKit.label(I18n.t("tax.isaExempt"), 11, SmaUiTheme.POSITIVE))
	for pair in [
		["tax.grossProceeds", _gbp(float(cgt["grossProceeds"]))],
		["tax.allowableCosts", _gbp(float(cgt["allowableCosts"]))],
		["tax.gains", _gbp(float(cgt["gains"]))],
		["tax.losses", _gbp(float(cgt["losses"]))],
		["tax.netGain", _gbp(float(cgt["netGain"]))],
		["tax.aea", _gbp(float(cgt["annualExemptAmountUsed"]))],
		["tax.taxableGain", _gbp(float(cgt["taxableGain"]))],
		["tax.basicSlice", "%s · %s" % [_gbp(float(cgt["basicPart"])), _gbp(float(cgt["basicTax"]))]],
		["tax.higherSlice", "%s · %s" % [_gbp(float(cgt["higherPart"])), _gbp(float(cgt["higherTax"]))]],
		["tax.cgtDue", _gbp(float(cgt["tax"]))],
	]:
		box.add_child(_kv(String(pair[0]), String(pair[1])))
	_body.add_child(card)


func _kv(label_key: String, value: String) -> HBoxContainer:
	var row := SmaKit.hbox(8)
	row.add_child(SmaKit.muted(I18n.t(label_key), 12))
	row.add_child(SmaKit.hspacer())
	row.add_child(SmaKit.label(value, 12))
	return row


func _render_disposals(result: Dictionary) -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	var disposals: Array = result["disposals"]
	box.add_child(SmaKit.label(I18n.t("tax.disposalsTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("tax.disposalsSubtitle", {"count": disposals.size()}), 11))
	if disposals.is_empty():
		box.add_child(SmaKit.muted(I18n.t("tax.noDisposals"), 12))
	else:
		box.add_child(SmaKit.header_row(
			["tax.date", "tax.ticker", "tax.quantity", "tax.proceeds", "tax.costBasis", "tax.gain"],
			[1.0, 0.8, 0.8, 1.0, 1.0, 1.0],
			[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT]))
		var rows := disposals.slice(maxi(0, disposals.size() - 12))
		for row in rows:
			var gain := float(row["gain"])
			var matches: Dictionary = row["matches"]
			var match_text := I18n.t("tax.matchDetail", {
				"sameDay": int(matches["sameDay"]["qty"]),
				"thirtyDay": int(matches["thirtyDay"]["qty"]),
				"pool": int(matches["pool"]["qty"]),
			})
			var line := SmaKit.data_row([
				SmaCalendar.iso_date(int(row["day"])), String(row["ticker"]),
				SmaFormat.num(float(row["qty"]), 0), _gbp(float(row["proceeds"])),
				_gbp(float(row["costBasis"])), _signed_gbp(gain),
			], [1.0, 0.8, 0.8, 1.0, 1.0, 1.0],
			[SmaUiTheme.TEXT, SmaUiTheme.TEXT, SmaUiTheme.TEXT, SmaUiTheme.TEXT,
				SmaUiTheme.TEXT, SmaKit.value_color(gain)],
			[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT])
			box.add_child(line)
			var detail := SmaKit.muted("  " + match_text, 10)
			box.add_child(detail)
	_body.add_child(card)


func _render_dividends(result: Dictionary) -> void:
	var dividends: Dictionary = result["dividends"]
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("tax.dividendsTitle"), 15))
	if bool(dividends["exempt"]):
		box.add_child(SmaKit.label(I18n.t("tax.isaExempt"), 11, SmaUiTheme.POSITIVE))
	for pair in [
		["tax.dividendGross", _gbp(float(dividends["gross"]))],
		["tax.dividendAllowance", _gbp(float(dividends["allowanceUsed"]))],
		["tax.dividendTaxable", _gbp(float(dividends["taxable"]))],
		["tax.dividendBasic", "%s · %s" % [_gbp(float(dividends["basicPart"])), _gbp(float(dividends["basicTax"]))]],
		["tax.dividendHigher", "%s · %s" % [_gbp(float(dividends["higherPart"])), _gbp(float(dividends["higherTax"]))]],
		["tax.dividendAdditional", "%s · %s" % [_gbp(float(dividends["additionalPart"])), _gbp(float(dividends["additionalTax"]))]],
		["tax.dividendTaxDue", _gbp(float(dividends["tax"]))],
	]:
		box.add_child(_kv(String(pair[0]), String(pair[1])))
	var rows: Array = dividends.get("rows", [])
	if rows.is_empty():
		box.add_child(SmaKit.muted(I18n.t("tax.noDividends"), 11))
	else:
		for row in rows.slice(maxi(0, rows.size() - 8)):
			box.add_child(SmaKit.data_row([
				SmaCalendar.iso_date(int(row["day"])), String(row["ticker"]),
				_gbp(float(row["amount"])),
			], [1.0, 0.8, 1.0]))
	_body.add_child(card)


func _render_isa(result: Dictionary) -> void:
	var isa: Dictionary = result["isa"]
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("tax.isaTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("tax.isaNote"), 11))
	for pair in [
		["tax.isaAllowance", _gbp(float(isa["allowance"]))],
		["tax.isaUsed", _gbp(float(isa["contributions"]))],
		["tax.isaRemaining", _gbp(float(isa["remaining"]))],
		["tax.isaExcess", _gbp(float(isa["excess"]))],
	]:
		box.add_child(_kv(String(pair[0]), String(pair[1])))
	_body.add_child(card)


func _render_warnings(result: Dictionary) -> void:
	var warnings: Array = result["warnings"]
	if warnings.is_empty():
		return
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(3)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("tax.warningTitle"), 14))
	for warning in warnings:
		box.add_child(SmaKit.muted("• " + I18n.t("tax.warning.%s" % String(warning["code"]),
			warning.get("params", {})), 11))
	_body.add_child(card)


func _render_about() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("tax.aboutTitle"), 14))
	box.add_child(SmaKit.muted(I18n.t("tax.disclaimer"), 11))
	for limitation in SmaTax.LIMITATIONS:
		box.add_child(SmaKit.muted("• " + I18n.t("tax.limitation.%s" % limitation), 11))
	var links := SmaKit.hbox(12)
	for source_id in SmaTax.SOURCE_IDS:
		links.add_child(SmaKit.label(I18n.t("tax.source.%s" % source_id), 11, SmaUiTheme.ACCENT))
	box.add_child(links)
	_body.add_child(card)
