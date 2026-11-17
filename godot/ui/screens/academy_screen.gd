## Academy: ported stage lessons, practice verification, quizzes, unlocks and the
## glossary. Content comes from data/academy/curriculum.json; this screen never
## marks progress unless SmaAcademy verifies it.
class_name SmaAcademyScreen
extends SmaScreen

const TOOL_KEY_MAP := {
	"order.limit": "limitOrder",
	"trade.short": "short",
	"trade.margin": "margin",
	"order.stop": "stop",
	"market.depth": "depth",
	"trade.futures": "futures",
	"options.trade": "options",
	"options.sell": "optionsSell",
}

var _selected_unit := "u1"
var _selected_section := "s1"
var _unit_list: VBoxContainer
var _content: VBoxContainer
var _header_stats: Label
var _overall_label: Label
var _retry_unit := ""


func _build() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	var root := SmaKit.vbox(12)
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(root)

	var header := SmaKit.hbox(16)
	var title_box := SmaKit.vbox(2)
	title_box.add_child(SmaKit.caption(I18n.t("academy.courseEyebrow")))
	title_box.add_child(SmaKit.title(I18n.t("academy.title"), 22))
	title_box.add_child(SmaKit.muted(I18n.t("academy.subtitle"), 12))
	header.add_child(title_box)
	header.add_child(SmaKit.hspacer())
	var level_box := SmaKit.vbox(1)
	level_box.add_child(SmaKit.caption(I18n.t("academy.levelLabel")))
	_header_stats = SmaKit.label("—", 15)
	level_box.add_child(_header_stats)
	header.add_child(level_box)
	var overall_box := SmaKit.vbox(1)
	overall_box.add_child(SmaKit.caption(I18n.t("academy.courseProgress")))
	_overall_label = SmaKit.label("—", 15)
	overall_box.add_child(_overall_label)
	header.add_child(overall_box)
	header.add_child(SmaKit.button(I18n.t("academy.glossaryButton"), func(): _open_glossary("")))
	root.add_child(header)

	var body := SmaKit.hbox(12)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(body)
	var left := SmaKit.card(10)
	left.custom_minimum_size.x = 300
	var left_scroll := SmaKit.scroll()
	_unit_list = SmaKit.vbox(6)
	left_scroll.add_child(_unit_list)
	left.add_child(left_scroll)
	body.add_child(left)

	var right := SmaKit.card(14)
	var right_scroll := SmaKit.scroll()
	_content = SmaKit.vbox(12)
	right_scroll.add_child(_content)
	right.add_child(right_scroll)
	body.add_child(right)


func refresh(_reason: String = "") -> void:
	if game == null or not game.started:
		return
	_refresh_header()
	_refresh_unit_list()
	_render_unit()


func on_tick() -> void:
	pass


func _refresh_header() -> void:
	var level := SmaAcademy.level_info(game.academy)
	var overall := SmaAcademy.overall_progress(game.academy)
	_header_stats.text = "Lv.%d · %d XP" % [int(level["level"]), int(level["xp"])]
	_overall_label.text = I18n.t("academy.overallMeta", {"done": overall["completed"],
		"total": overall["total"]})


func _refresh_unit_list() -> void:
	SmaKit.clear_children(_unit_list)
	_unit_list.add_child(SmaKit.caption(I18n.t("academy.stages")))
	for stage in SmaAcademy.catalog().get("stages", []):
		if not bool(stage.get("ported", false)):
			continue
		_unit_list.add_child(SmaKit.caption(I18n.t(String(stage["titleKey"]))))
		for unit_id in stage.get("unitIds", []):
			var entry := SmaAcademy.unit(String(unit_id))
			if not entry.is_empty():
				_unit_list.add_child(_unit_row(entry))
	var branches: Array = SmaAcademy.branch_units()
	if not branches.is_empty():
		_unit_list.add_child(SmaKit.separator())
		_unit_list.add_child(SmaKit.caption(I18n.t("branches.title")))
		var branch_note := SmaKit.caption(I18n.t("branches.subtitle"))
		branch_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_unit_list.add_child(branch_note)
		for entry in branches:
			_unit_list.add_child(_unit_row(entry))
	var has_roadmap := false
	for stage in SmaAcademy.catalog().get("stages", []):
		if not bool(stage.get("ported", false)):
			has_roadmap = true
			break
	if not has_roadmap:
		return
	_unit_list.add_child(SmaKit.separator())
	_unit_list.add_child(SmaKit.caption(I18n.t("academy.roadmap")))
	var roadmap_note := SmaKit.caption(I18n.t("academy.roadmapSubtitle"))
	roadmap_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_unit_list.add_child(roadmap_note)
	for stage in SmaAcademy.catalog().get("stages", []):
		if bool(stage.get("ported", false)):
			continue
		var row := SmaKit.vbox(1)
		row.add_child(SmaKit.label(I18n.t(String(stage["titleKey"])), 11, SmaUiTheme.DIM))
		row.add_child(SmaKit.caption("%s · %s" % [
			I18n.t("academy.unitCount", {"count": stage.get("unitIds", []).size()}),
			I18n.t("academy.notBuilt")]))
		_unit_list.add_child(row)


func _unit_row(entry: Dictionary) -> Control:
	var unit_id := String(entry["id"])
	var progress := SmaAcademy.progress_rows(game.academy, entry)
	var unlocked := SmaAcademy.is_unit_unlocked(game.academy, unit_id)
	var panel := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = SmaUiTheme.PANEL_ALT if unit_id == _selected_unit else SmaUiTheme.PANEL
	style.border_color = SmaUiTheme.ACCENT if unit_id == _selected_unit else SmaUiTheme.BORDER
	style.set_border_width_all(1)
	style.set_corner_radius_all(8)
	style.set_content_margin_all(8)
	panel.add_theme_stylebox_override("panel", style)
	panel.mouse_filter = Control.MOUSE_FILTER_STOP if unlocked else Control.MOUSE_FILTER_IGNORE
	panel.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if unlocked else Control.CURSOR_ARROW
	if unlocked:
		panel.gui_input.connect(_on_unit_input.bind(unit_id))
	var box := SmaKit.vbox(4)
	panel.add_child(box)
	var head := SmaKit.hbox(6)
	var code := "%02d" % int(entry.get("number", 0))
	if bool(entry.get("optional", false)):
		code = "B%s" % unit_id.trim_prefix("b")
	head.add_child(SmaKit.caption(code))
	var title := SmaKit.label(I18n.t(String(entry["titleKey"])), 12,
		SmaUiTheme.TEXT if unlocked else SmaUiTheme.DIM)
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	var status := ""
	if bool(progress["completed"]):
		status = I18n.t("academy.completed")
	elif not unlocked:
		status = I18n.t("lesson.lockedTitle")
	head.add_child(SmaKit.caption(status))
	box.add_child(head)
	box.add_child(_progress_bar(float(progress["pct"])))
	box.add_child(SmaKit.caption(I18n.t("lesson.progressMeta", {"read": progress["read"],
		"total": progress["total"]})))
	return panel


func _on_unit_input(event: InputEvent, unit_id: String) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_select_unit(unit_id)


func _select_unit(unit_id: String) -> void:
	_selected_unit = unit_id
	var entry := SmaAcademy.unit(unit_id)
	_selected_section = ""
	for section in entry.get("sections", []):
		var section_id := String(section["id"])
		if not SmaAcademy.is_section_read(game.academy, unit_id, section_id):
			_selected_section = section_id
			break
	if _selected_section == "" and not entry.get("sections", []).is_empty():
		_selected_section = String(entry["sections"][0]["id"])
	_refresh_unit_list()
	_render_unit()


func _render_unit() -> void:
	SmaKit.clear_children(_content)
	var entry := SmaAcademy.unit(_selected_unit)
	if entry.is_empty():
		return
	var progress := SmaAcademy.progress_rows(game.academy, entry)
	var unlocked := SmaAcademy.is_unit_unlocked(game.academy, _selected_unit)
	var head := SmaKit.card(12)
	var head_box := SmaKit.vbox(4)
	head.add_child(head_box)
	var meta_text := I18n.t("lesson.unitNumber", {"number": entry.get("number", 0)})
	if bool(entry.get("optional", false)):
		meta_text = "B%s" % String(entry["id"]).trim_prefix("b")
	head_box.add_child(SmaKit.caption("%s · %s" % [
		meta_text, I18n.t("academy.minutes", {"minutes": entry.get("minutes", 0)})]))
	head_box.add_child(SmaKit.title(I18n.t(String(entry["titleKey"])), 24))
	head_box.add_child(SmaKit.muted(I18n.t(String(entry["summaryKey"])), 13))
	head_box.add_child(_progress_bar(float(progress["pct"])))
	_content.add_child(head)
	if bool(entry.get("optional", false)):
		_render_branch_banner(entry)

	if not unlocked:
		var lock := SmaKit.card(12)
		var lock_box := SmaKit.vbox(4)
		lock.add_child(lock_box)
		lock_box.add_child(SmaKit.label(I18n.t("lesson.lockedTitle"), 16, SmaUiTheme.WARNING))
		var prereq_names: Array[String] = []
		for prereq in entry.get("prerequisites", []):
			prereq_names.append(I18n.t("curriculum.%s.title" % prereq))
		var prereq_text := ""
		for index in prereq_names.size():
			if index > 0:
				prereq_text += " / "
			prereq_text += prereq_names[index]
		lock_box.add_child(SmaKit.muted(I18n.t("lesson.lockedPrereq", {"unit": prereq_text})))
		_content.add_child(lock)
		return

	var tabs := GridContainer.new()
	tabs.columns = 2
	tabs.add_theme_constant_override("h_separation", 6)
	tabs.add_theme_constant_override("v_separation", 4)
	_content.add_child(SmaKit.caption(I18n.t("lesson.outline")))
	for index in entry.get("sections", []).size():
		var section: Dictionary = entry["sections"][index]
		var section_id := String(section["id"])
		var read := SmaAcademy.is_section_read(game.academy, _selected_unit, section_id)
		var full_title := I18n.t(String(section["titleKey"]))
		var text := "%d. %s%s" % [index + 1, full_title, " ✓" if read else ""]
		var button := SmaKit.button(text, _select_section.bind(section_id))
		button.add_theme_font_size_override("font_size", 11)
		button.clip_text = true
		button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		button.tooltip_text = full_title
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if section_id == _selected_section:
			button.add_theme_color_override("font_color", SmaUiTheme.ACCENT)
		tabs.add_child(button)
	_content.add_child(tabs)

	_render_lesson(entry)
	_render_practice(entry, progress)
	_render_quiz(entry, progress)
	_render_unlocks(entry)
	_render_achievements()


func _select_section(section_id: String) -> void:
	_selected_section = section_id
	_render_unit()


func _render_branch_banner(entry: Dictionary) -> void:
	var branch := SmaAcademy.branch_for_unit(String(entry["id"]))
	if branch.is_empty():
		return
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(3)
	card.add_child(box)
	var row := SmaKit.hbox(8)
	row.add_child(SmaKit.label(I18n.t(String(branch["nameKey"])), 13, SmaUiTheme.ACCENT))
	row.add_child(SmaKit.hspacer())
	row.add_child(SmaKit.caption(I18n.t("branches.career")))
	row.add_child(SmaKit.label(I18n.t(String(branch["careerKey"])), 12))
	box.add_child(row)
	var outcome := SmaKit.muted("%s · %s" % [
		I18n.t("branches.outcomeLabel"), I18n.t(String(branch["outcomeKey"]))], 11)
	outcome.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(outcome)
	_content.add_child(card)


func _render_lesson(entry: Dictionary) -> void:
	var sections: Array = entry.get("sections", [])
	var index := -1
	for i in sections.size():
		if String(sections[i]["id"]) == _selected_section:
			index = i
			break
	if index < 0:
		return
	var section: Dictionary = sections[index]
	var card := SmaKit.card(14)
	var box := SmaKit.vbox(10)
	card.add_child(box)
	box.add_child(SmaKit.caption(I18n.t("lesson.sectionEyebrow",
		{"index": index + 1, "total": sections.size()})))
	box.add_child(SmaKit.title(I18n.t(String(section["titleKey"])), 18))
	for block in section.get("blocks", []):
		_render_block(box, block)
	var read := SmaAcademy.is_section_read(game.academy, _selected_unit, _selected_section)
	if read:
		box.add_child(SmaKit.label(I18n.t("lesson.read"), 12, SmaUiTheme.POSITIVE))
	else:
		var button := SmaKit.button(I18n.t("lesson.completeSection"),
			_mark_section_read, true)
		button.custom_minimum_size.x = 180
		box.add_child(button)
		box.add_child(SmaKit.caption(I18n.t("lesson.xpPerSection", {"xp": 5})))
	_content.add_child(card)


func _mark_section_read() -> void:
	game.academy_mark_section_read(_selected_unit, _selected_section)


func _render_block(box: VBoxContainer, block: Dictionary) -> void:
	var block_type := String(block.get("type", ""))
	match block_type:
		"p":
			var text := SmaKit.label(I18n.t(String(block["key"])), 14)
			text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			box.add_child(text)
		"list":
			box.add_child(SmaKit.label(I18n.t(String(block["titleKey"])), 13, SmaUiTheme.ACCENT))
			var items: Array = block.get("items", [])
			for index in items.size():
				var prefix := "• "
				if String(block.get("variant", "")) == "check":
					prefix = "✓ "
				elif String(block.get("variant", "")) == "number":
					prefix = "%d. " % (index + 1)
				var item := SmaKit.label(prefix + I18n.t(String(items[index])), 13, SmaUiTheme.MUTED)
				item.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
				box.add_child(item)
		"callout":
			var variant := String(block.get("variant", "key"))
			var color := SmaUiTheme.ACCENT
			if variant == "warning":
				color = SmaUiTheme.WARNING
			elif variant == "myth" or variant == "danger":
				color = SmaUiTheme.NEGATIVE
			elif variant == "pro" or variant == "info":
				color = SmaUiTheme.INFO
			var panel := SmaKit.card(10)
			var style := StyleBoxFlat.new()
			style.bg_color = Color(color.r, color.g, color.b, 0.08)
			style.border_color = color
			style.set_border_width_all(1)
			style.set_corner_radius_all(8)
			style.set_content_margin_all(10)
			panel.add_theme_stylebox_override("panel", style)
			var inner := SmaKit.vbox(4)
			panel.add_child(inner)
			inner.add_child(SmaKit.label(I18n.t(String(block["titleKey"])), 12, color))
			var text2 := SmaKit.label(I18n.t(String(block["key"])), 13)
			text2.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			inner.add_child(text2)
			box.add_child(panel)
		"formula":
			var formula := SmaKit.card(10)
			var inner2 := SmaKit.vbox(4)
			formula.add_child(inner2)
			var formula_text := SmaKit.label(I18n.t(String(block["key"])), 15, SmaUiTheme.ACCENT)
			formula_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			inner2.add_child(formula_text)
			if String(block.get("noteKey", "")) != "":
				var note := SmaKit.muted(I18n.t(String(block["noteKey"])))
				note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
				inner2.add_child(note)
			box.add_child(formula)
		"example":
			var example := SmaKit.card(10)
			var inner3 := SmaKit.vbox(4)
			example.add_child(inner3)
			inner3.add_child(SmaKit.caption(I18n.t(String(block["titleKey"]))))
			for line_key in block.get("lines", []):
				var line := SmaKit.label(I18n.t(String(line_key)), 13, SmaUiTheme.MUTED)
				line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
				inner3.add_child(line)
			box.add_child(example)
		"term":
			var term_id := String(block["termId"])
			var row := SmaKit.hbox(8)
			row.add_child(SmaKit.caption(I18n.t("lesson.keyTerms")))
			row.add_child(SmaKit.button(I18n.t("glossary.terms.%s.name" % term_id),
				_open_glossary.bind(term_id)))
			var definition := SmaKit.muted(I18n.t("glossary.terms.%s.def" % term_id), 12)
			definition.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			definition.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			row.add_child(definition)
			box.add_child(row)
		"demo":
			var demo_id := String(block.get("id", ""))
			var demo_card := SmaKit.card(10)
			var inner4 := SmaKit.vbox(4)
			demo_card.add_child(inner4)
			inner4.add_child(SmaKit.label(I18n.t("demo.%s.title" % demo_id), 13,
				SmaUiTheme.ACCENT))
			var demo_desc := SmaKit.muted(I18n.t("demo.%s.desc" % demo_id), 12)
			demo_desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			inner4.add_child(demo_desc)
			if demo_id == "financials":
				inner4.add_child(SmaKit.button(I18n.t("financials.open"),
					_go_to_financials, true))
			elif SmaDemoDialog.supports(demo_id):
				inner4.add_child(SmaKit.button(I18n.t("demo.open"),
					_open_demo.bind(demo_id), true))
			else:
				inner4.add_child(SmaKit.muted(I18n.t("academy.demoUnavailable"), 11))
			box.add_child(demo_card)
		"table":
			var grid := GridContainer.new()
			grid.columns = int(block.get("headKeys", []).size())
			grid.add_theme_constant_override("h_separation", 16)
			grid.add_theme_constant_override("v_separation", 6)
			for head_key in block.get("headKeys", []):
				grid.add_child(SmaKit.label(I18n.t(String(head_key)), 11, SmaUiTheme.DIM))
			for row_values in block.get("rows", []):
				for value_key in row_values:
					var cell := SmaKit.label(I18n.t(String(value_key)), 12)
					cell.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
					grid.add_child(cell)
			box.add_child(grid)


func _render_practice(entry: Dictionary, progress: Dictionary) -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(6)
	card.add_child(box)
	var task: Dictionary = entry.get("practice", {})
	var result := SmaAcademy.evaluate_practice(game.academy, entry, game.academy_snapshot())
	box.add_child(SmaKit.label(I18n.t("practice.title"), 15))
	box.add_child(SmaKit.muted(I18n.t(String(task.get("titleKey", ""))), 13))
	box.add_child(SmaKit.muted(I18n.t(String(task.get("requirementKey", ""))), 12))
	box.add_child(SmaKit.caption(I18n.t("academy.practiceProgress",
		{"current": result.get("current", 0), "target": result.get("target", 1)})))
	if bool(progress["practiceDone"]):
		box.add_child(SmaKit.label(I18n.t("practice.done"), 12, SmaUiTheme.POSITIVE))
	else:
		var row := SmaKit.hbox(8)
		var action: Button
		var check := String(task.get("check", ""))
		var action_key := String(task.get("actionKey", "academy.practiceAction"))
		if check == "demo":
			action = SmaKit.button(I18n.t(action_key),
				_open_demo.bind(String(task.get("demoId", ""))), true)
		elif check == "advanced-inspect":
			action = SmaKit.button(I18n.t(action_key), _go_to_financials, true)
		else:
			action = SmaKit.button(I18n.t(action_key), _practice_action.bind(
				String(task.get("actionHref", "#/market"))), true)
		action.custom_minimum_size.x = 140
		row.add_child(action)
		var hint := SmaKit.muted(I18n.t(String(task.get("hintKey", ""))), 11)
		hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(hint)
		box.add_child(row)
	_content.add_child(card)


func _open_demo(demo_id: String) -> void:
	if not SmaDemoDialog.supports(demo_id):
		game.toast(I18n.t("academy.demoUnavailable"))
		return
	var main := get_tree().get_first_node_in_group("main")
	if main == null:
		return
	var dialog := SmaDemoDialog.new()
	main.add_child(dialog)
	dialog.closed.connect(func(): refresh("demo"))
	dialog.setup(game, demo_id)


func _go_to_financials() -> void:
	game.toast(I18n.t("financials.openHint"))
	_practice_action("trade")


func _practice_action(href: String) -> void:
	var main := get_tree().get_first_node_in_group("main")
	if main == null:
		return
	var target := "market"
	if href.contains("portfolio"):
		target = "portfolio"
	elif href.contains("options"):
		target = "options"
	elif href.contains("futures"):
		target = "futures"
	elif href.contains("trade"):
		target = "trade"
	main.navigate(target)


func _render_quiz(entry: Dictionary, progress: Dictionary) -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(6)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("quiz.cardTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("quiz.cardSubtitle", {"pass": 80}), 12))
	if progress["quizBest"] == null:
		box.add_child(SmaKit.caption(I18n.t("quiz.notAttempted")))
	else:
		box.add_child(SmaKit.label(I18n.t("quiz.bestScore", {"score": progress["quizBest"]}), 13,
			SmaUiTheme.POSITIVE if bool(progress["quizPassed"]) else SmaUiTheme.WARNING))
	var button := SmaKit.button(I18n.t("academy.quizStart"), _open_quiz_for_unit, true)
	button.custom_minimum_size.x = 160
	box.add_child(button)
	_content.add_child(card)


func _open_quiz_for_unit() -> void:
	_open_quiz(_selected_unit)


func _open_quiz(unit_id: String) -> void:
	var progress := SmaAcademy.ensure_unit(game.academy, unit_id)
	var attempt := int(progress.get("quizAttempts", 0)) + 1
	var session := SmaAcademy.build_quiz(unit_id, attempt)
	if session.is_empty():
		game.toast(I18n.t("quiz.unavailableText"))
		return
	var dialog := SmaQuizDialog.new()
	var main := get_tree().get_first_node_in_group("main")
	if main == null:
		return
	main.add_child(dialog)
	dialog.retry_requested.connect(func(target: String): _retry_unit = target)
	dialog.closed.connect(_on_quiz_closed)
	dialog.setup(game, unit_id, session)


func _on_quiz_closed() -> void:
	if _retry_unit != "":
		var target := _retry_unit
		_retry_unit = ""
		call_deferred("_open_quiz", target)
	else:
		refresh("quiz")


func _render_unlocks(entry: Dictionary) -> void:
	var unlocks: Array = entry.get("unlocks", [])
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(6)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("lesson.unlocks"), 15))
	if unlocks.is_empty():
		box.add_child(SmaKit.muted(I18n.t("lesson.unlockNote")))
	else:
		for tool_id in unlocks:
			var tool_key := String(TOOL_KEY_MAP.get(String(tool_id), ""))
			if tool_key == "":
				continue
			var row := SmaKit.hbox(8)
			row.add_child(SmaKit.label(I18n.t("unlock.%s.title" % tool_key), 13))
			row.add_child(SmaKit.hspacer())
			var unlocked := SmaAcademy.is_tool_unlocked(game.academy, String(tool_id))
			row.add_child(SmaKit.label(I18n.t("unlock.unlockedLabel") if unlocked
				else I18n.t("academy.unlockHint"), 11,
				SmaUiTheme.POSITIVE if unlocked else SmaUiTheme.WARNING))
			box.add_child(row)
			var desc := SmaKit.muted(I18n.t("unlock.%s.desc" % tool_key), 11)
			desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			box.add_child(desc)
	_content.add_child(card)


func _render_achievements() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(8)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("academy.achievementsTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("academy.achievementsSubtitle"), 11))
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 14)
	grid.add_theme_constant_override("v_separation", 6)
	for achievement_id in ["observer", "firstTrade", "firstPractice", "academyInitiate",
			"quizAce", "limitMaster", "bilingual", "glossaryExplorer", "stageOneGraduate"]:
		var unlocked: bool = game.academy["achievements"].has(achievement_id)
		var cell := SmaKit.vbox(1)
		cell.add_child(SmaKit.label(I18n.t("achievement.%s.title" % achievement_id), 12,
			SmaUiTheme.POSITIVE if unlocked else SmaUiTheme.DIM))
		cell.add_child(SmaKit.caption(I18n.t("achievement.%s.desc" % achievement_id)))
		grid.add_child(cell)
	box.add_child(grid)
	_content.add_child(card)


func _open_glossary(term_id: String) -> void:
	var dialog := SmaGlossaryDialog.new()
	var main := get_tree().get_first_node_in_group("main")
	if main == null:
		return
	main.add_child(dialog)
	dialog.closed.connect(func(): refresh("glossary"))
	dialog.setup(game, term_id)


func _progress_bar(value: float) -> ProgressBar:
	var bar := ProgressBar.new()
	bar.min_value = 0
	bar.max_value = 100
	bar.value = clampf(value, 0.0, 100.0)
	bar.show_percentage = false
	bar.custom_minimum_size.y = 6
	var background := StyleBoxFlat.new()
	background.bg_color = SmaUiTheme.BG_DEEP
	background.set_corner_radius_all(3)
	var fill := StyleBoxFlat.new()
	fill.bg_color = SmaUiTheme.ACCENT_DARK
	fill.set_corner_radius_all(3)
	bar.add_theme_stylebox_override("background", background)
	bar.add_theme_stylebox_override("fill", fill)
	return bar
