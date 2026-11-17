## Challenge mode: goal-based runs with explicit deadlines and risk rules. All
## checks read the live exchange account; the screen only renders and delegates.
class_name SmaChallengesScreen
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
	_render_active()
	_render_grid()
	_body.add_child(SmaKit.muted(I18n.t("challenges.note"), 10))


func _render_header() -> void:
	var header := SmaKit.hbox(10)
	var titles := SmaKit.vbox(2)
	titles.add_child(SmaKit.label(I18n.t("challenges.title"), 20))
	var subtitle := SmaKit.muted(I18n.t("challenges.subtitle"), 12)
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	titles.add_child(subtitle)
	header.add_child(titles)
	header.add_child(SmaKit.hspacer())
	header.add_child(SmaKit.label(I18n.t("challenges.badge", {
		"done": SmaChallenges.completed_count(game.challenges),
		"total": SmaChallenges.DEFS.size(),
	}), 12, SmaUiTheme.ACCENT))
	_body.add_child(header)


func _render_active() -> void:
	var data: Dictionary = game.challenge_progress()
	if data.is_empty():
		var card := SmaKit.card(14)
		var box := SmaKit.vbox(4)
		card.add_child(box)
		box.add_child(SmaKit.label(I18n.t("challenges.noActiveTitle"), 15))
		box.add_child(SmaKit.muted(I18n.t("challenges.noActiveText"), 12))
		_body.add_child(card)
		return
	var definition: Dictionary = data["definition"]
	var values: Dictionary = data["values"]
	var card := SmaKit.card(14)
	var box := SmaKit.vbox(8)
	card.add_child(box)
	var head := SmaKit.hbox(10)
	head.add_child(SmaKit.label(I18n.t(String(definition["titleKey"])), 16))
	head.add_child(SmaKit.hspacer())
	head.add_child(SmaKit.label(I18n.t("challenges.daysLeft", {
		"days": int(data["remaining"]),
	}), 12, SmaUiTheme.WARNING))
	box.add_child(head)

	var stats := SmaKit.hbox(22)
	stats.add_child(_metric("challenges.metric.return",
		SmaFormat.pct(float(values["return"]), 2), float(values["return"])))
	stats.add_child(_metric("challenges.metric.drawdownMax",
		SmaFormat.pct_plain(float(values["drawdownMax"]), 2), -float(values["drawdownMax"])))
	stats.add_child(_metric("challenges.metric.trades",
		SmaFormat.num(float(values["trades"]), 0), 0.0))
	stats.add_child(_metric("challenges.equityLabel",
		SmaFormat.money(float(values["equity"])), 0.0))
	box.add_child(stats)

	for check in data["checks"]:
		var kind := String(check["kind"])
		var done := bool(check["done"])
		var line := SmaKit.hbox(8)
		line.add_child(SmaKit.label("✓" if done else "○", 12,
			SmaUiTheme.POSITIVE if done else SmaUiTheme.DIM))
		var text := I18n.t("challenges.metric.%s" % kind)
		if float(check.get("target", 0.0)) > 0.0:
			var target_text := _format_value(kind, float(check["target"]))
			var current_text := _format_value(kind, float(check["current"]))
			text += " · " + I18n.t("challenges.progressValue", {
				"current": current_text, "target": target_text,
			})
		line.add_child(SmaKit.label(text, 12, SmaUiTheme.TEXT if done else SmaUiTheme.MUTED))
		box.add_child(line)

	var bar := ProgressBar.new()
	bar.max_value = 100.0
	bar.value = float(data["doneCount"]) / float(maxi(1, int(data["totalChecks"]))) * 100.0
	bar.show_percentage = false
	bar.custom_minimum_size.y = 6
	box.add_child(bar)

	var actions := SmaKit.hbox(8)
	actions.add_child(SmaKit.button(I18n.t("challenges.abandon"), _abandon))
	actions.add_child(SmaKit.button(I18n.t("challenges.openPortfolio"), _go_portfolio))
	box.add_child(actions)
	_body.add_child(card)


func _metric(label_key: String, value: String, tone: float) -> VBoxContainer:
	var box := SmaKit.vbox(0)
	box.add_child(SmaKit.caption(I18n.t(label_key)))
	box.add_child(SmaKit.label(value, 14, SmaKit.value_color(tone) if tone != 0.0 else SmaUiTheme.TEXT))
	return box


func _format_value(kind: String, value: float) -> String:
	if kind == "return":
		return SmaFormat.pct(value, 1)
	if kind == "drawdownMax":
		return SmaFormat.pct_plain(value, 1)
	if kind == "trades" or kind == "optionTrades" or kind == "futuresTrades":
		return SmaFormat.num(value, 0)
	return I18n.t("challenges.yes") if value > 0.0 else I18n.t("challenges.no")


func _render_grid() -> void:
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	for definition in SmaChallenges.DEFS:
		grid.add_child(_challenge_card(definition))
	_body.add_child(grid)


func _challenge_card(definition: Dictionary) -> PanelContainer:
	var challenge_id := String(definition["id"])
	var completed: bool = game.challenges["completed"].has(challenge_id)
	var failed: bool = game.challenges["failed"].has(challenge_id)
	var active_id := String(game.challenges["active"].get("id", ""))
	var active := active_id == challenge_id
	var unlocked := SmaChallenges.is_unlocked(game.academy, definition)
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(6)
	card.add_child(box)

	var head := SmaKit.hbox(8)
	var titles := SmaKit.vbox(1)
	titles.add_child(SmaKit.label(I18n.t(String(definition["titleKey"])), 14))
	var description := SmaKit.muted(I18n.t(String(definition["descKey"])), 11)
	description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	titles.add_child(description)
	head.add_child(titles)
	head.add_child(SmaKit.hspacer())
	head.add_child(SmaKit.label("+%d XP" % int(definition["xp"]), 11, SmaUiTheme.ACCENT))
	box.add_child(head)

	for check in definition["checks"]:
		var kind := String(check["kind"])
		var label := I18n.t("challenges.metric.%s" % kind)
		if check.has("target"):
			label += " · " + I18n.t("challenges.progressValue", {
				"current": _format_value(kind, 0.0),
				"target": _format_value(kind, float(check["target"])),
			})
		box.add_child(SmaKit.muted("• " + label, 11))

	var footer := SmaKit.hbox(8)
	if completed:
		footer.add_child(SmaKit.label(I18n.t("challenges.completed"), 11, SmaUiTheme.POSITIVE))
	elif active:
		footer.add_child(SmaKit.label(I18n.t("challenges.inProgress"), 11, SmaUiTheme.WARNING))
	elif failed:
		footer.add_child(SmaKit.label(I18n.t("challenges.failed"), 11, SmaUiTheme.NEGATIVE))
	else:
		footer.add_child(SmaKit.muted(I18n.t("challenges.days", {
			"days": int(definition["days"]),
		}), 11))
	footer.add_child(SmaKit.hspacer())
	if not unlocked:
		footer.add_child(SmaKit.muted(I18n.t("challenges.lockedByUnit", {
			"unit": SmaAcademy.unit(String(definition["unlockUnit"])).get("titleKey", ""),
		}), 10))
		footer.add_child(SmaKit.button(I18n.t("challenges.goUnlock"), _go_academy))
	elif not active:
		footer.add_child(SmaKit.button(
			I18n.t("challenges.retry") if completed or failed else I18n.t("challenges.start"),
			_start.bind(challenge_id), true))
	box.add_child(footer)
	return card


func _start(challenge_id: String) -> void:
	game.start_challenge(challenge_id)
	refresh()


func _abandon() -> void:
	game.abandon_challenge()
	refresh()


func _go_portfolio() -> void:
	var main := get_tree().get_first_node_in_group("main")
	if main != null and main.has_method("navigate"):
		main.navigate("portfolio")


func _go_academy() -> void:
	var main := get_tree().get_first_node_in_group("main")
	if main != null and main.has_method("navigate"):
		main.navigate("academy")
