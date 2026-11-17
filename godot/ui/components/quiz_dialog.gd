## Quiz modal: questions, answers, grading and worked solutions. The dialog owns
## only transient UI state; scores and completion are recorded by Game/SmaAcademy.
class_name SmaQuizDialog
extends Control

signal closed
signal retry_requested(unit_id: String)

var game: Node
var unit_id: String
var session: Dictionary
var _content: VBoxContainer
var _footer: HBoxContainer
var _feedback: Label
var _answers: Dictionary = {}
var _controls: Dictionary = {}
var _submitted := false


func setup(game_ref: Node, target_unit: String, quiz_session: Dictionary) -> void:
	game = game_ref
	unit_id = target_unit
	session = quiz_session
	_build()
	render_questions()


func _build() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	z_index = 55
	var dim := ColorRect.new()
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.color = Color(0.02, 0.04, 0.07, 0.82)
	add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)
	var panel := SmaKit.card(20)
	panel.custom_minimum_size = Vector2(880, 640)
	center.add_child(panel)
	var root := SmaKit.vbox(12)
	panel.add_child(root)
	var header := SmaKit.hbox(12)
	header.add_child(SmaKit.label(I18n.t("quiz.title"), 20))
	var unit_title := I18n.t(String(SmaAcademy.unit(unit_id).get("titleKey", unit_id)))
	header.add_child(SmaKit.muted(unit_title, 13))
	header.add_child(SmaKit.hspacer())
	header.add_child(SmaKit.button(I18n.t("common.close"), _close))
	root.add_child(header)
	root.add_child(SmaKit.muted(I18n.t("quiz.subtitle", {"pass": session.get("passScore", 80)})))
	root.add_child(SmaKit.separator())
	var scroll := SmaKit.scroll(470)
	_content = SmaKit.vbox(14)
	scroll.add_child(_content)
	root.add_child(scroll)
	_footer = SmaKit.hbox(10)
	_feedback = SmaKit.muted("")
	_feedback.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_footer.add_child(_feedback)
	_footer.add_child(SmaKit.hspacer())
	_footer.add_child(SmaKit.button(I18n.t("quiz.submit"), _submit, true))
	root.add_child(_footer)


func render_questions() -> void:
	SmaKit.clear_children(_content)
	_answers.clear()
	_controls.clear()
	_submitted = false
	var questions: Array = session.get("questions", [])
	for index in questions.size():
		var question: Dictionary = questions[index]
		var card := SmaKit.card(12)
		var box := SmaKit.vbox(8)
		card.add_child(box)
		_content.add_child(card)
		var head := SmaKit.hbox(10)
		head.add_child(SmaKit.caption("%02d" % (index + 1)))
		head.add_child(SmaKit.caption(I18n.t("quiz.type.%s" % String(question["type"]))))
		head.add_child(SmaKit.hspacer())
		box.add_child(head)
		var prompt := SmaKit.label(_prompt_text(question), 14)
		prompt.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		box.add_child(prompt)
		var question_id := String(question["id"])
		var question_type := String(question["type"])
		if question_type == "numeric":
			var line := LineEdit.new()
			line.placeholder_text = I18n.t("quiz.numericPlaceholder")
			line.custom_minimum_size.x = 220
			box.add_child(line)
			_controls[question_id] = {"type": "numeric", "control": line}
			box.add_child(SmaKit.caption(I18n.t("quiz.unit.%s" % String(question.get("answerFormat", "number")))))
			box.add_child(SmaKit.caption(I18n.t("quiz.numericHint")))
		elif question_type == "multi":
			var checks: Array = []
			for option in question.get("options", []):
				var check := CheckBox.new()
				var base := I18n.t(String(option["key"]), SmaAcademy.formatted_params(question))
				check.set_meta("base_text", base)
				check.text = "○ " + base
				check.add_theme_font_size_override("font_size", 13)
				check.toggled.connect(_on_multi_toggled.bind(check))
				box.add_child(check)
				checks.append({"key": String(option["key"]), "control": check})
			_controls[question_id] = {"type": "multi", "checks": checks}
			box.add_child(SmaKit.caption(I18n.t("quiz.multiHint")))
		else:
			var group := ButtonGroup.new()
			var checks2: Array = []
			for option in question.get("options", []):
				var check := CheckBox.new()
				var base := I18n.t(String(option["key"]), SmaAcademy.formatted_params(question))
				check.set_meta("base_text", base)
				check.text = "○ " + base
				check.button_group = group
				check.add_theme_font_size_override("font_size", 13)
				check.toggled.connect(_on_single_toggled.bind(question_id, String(option["key"]), check))
				box.add_child(check)
				checks2.append(check)
			_controls[question_id] = {"type": "single", "checks": checks2}
			box.add_child(SmaKit.caption(I18n.t("quiz.singleHint")))


func _prompt_text(question: Dictionary) -> String:
	return I18n.t(String(question.get("promptKey", "")), SmaAcademy.formatted_params(question))


func _on_single_toggled(pressed: bool, question_id: String, option_key: String,
		check: CheckBox) -> void:
	if not pressed:
		check.text = "○ " + String(check.get_meta("base_text"))
		return
	_answers[question_id] = option_key
	if not _controls.has(question_id):
		return
	for other in _controls[question_id]["checks"]:
		var other_check: CheckBox = other
		other_check.text = ("● " if other_check == check else "○ ") \
			+ String(other_check.get_meta("base_text"))


func _on_multi_toggled(pressed: bool, check: CheckBox) -> void:
	check.text = ("● " if pressed else "○ ") + String(check.get_meta("base_text"))


func _submit() -> void:
	if _submitted:
		return
	var answers := {}
	for question_id in _controls.keys():
		var entry: Dictionary = _controls[question_id]
		var kind := String(entry["type"])
		if kind == "numeric":
			var text := String(entry["control"].text).strip_edges()
			if text == "":
				_feedback.text = I18n.t("quiz.answerAll")
				return
			answers[question_id] = float(text)
		elif kind == "multi":
			var selected: Array = []
			for check in entry["checks"]:
				if check["control"].button_pressed:
					selected.append(check["key"])
			if selected.is_empty():
				_feedback.text = I18n.t("quiz.answerAll")
				return
			answers[question_id] = selected
		else:
			if not _answers.has(question_id):
				_feedback.text = I18n.t("quiz.answerAll")
				return
			answers[question_id] = _answers[question_id]
	_submitted = true
	var outcome: Dictionary = game.academy_submit_quiz(unit_id, session, answers)
	_feedback.text = ""
	_render_result(outcome)


func _render_result(outcome: Dictionary) -> void:
	SmaKit.clear_children(_content)
	var grade: Dictionary = outcome.get("grade", {})
	var passed := bool(grade.get("passed", false))
	var head := SmaKit.card(14)
	var head_box := SmaKit.vbox(6)
	head.add_child(head_box)
	head_box.add_child(SmaKit.label(I18n.t("quiz.resultsTitle"), 18))
	var params := {"score": grade.get("score", 0), "correct": grade.get("correctCount", 0),
		"total": grade.get("total", 0), "pass": session.get("passScore", 80)}
	head_box.add_child(SmaKit.label(I18n.t("quiz.passedText" if passed else "quiz.failedText", params),
		13, SmaUiTheme.POSITIVE if passed else SmaUiTheme.WARNING))
	_content.add_child(head)
	for detail in grade.get("details", []):
		var card := SmaKit.card(10)
		var box := SmaKit.vbox(4)
		card.add_child(box)
		var question := _question_by_id(String(detail["id"]))
		var prompt := SmaKit.label(_prompt_text(question), 13)
		prompt.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		box.add_child(prompt)
		var status := I18n.t("quiz.correct" if bool(detail["correct"]) else "quiz.incorrect")
		box.add_child(SmaKit.label(status, 11, SmaUiTheme.POSITIVE if bool(detail["correct"])
			else SmaUiTheme.NEGATIVE))
		box.add_child(SmaKit.muted("%s: %s" % [I18n.t("quiz.yourAnswer"),
			_format_answer(detail.get("given", null), question)]))
		box.add_child(SmaKit.muted("%s: %s" % [I18n.t("quiz.correctAnswer"),
			_format_answer(detail.get("expected", null), question)]))
		var explain_key := String(question.get("explainKey", ""))
		if explain_key != "" and I18n.has_key(explain_key):
			var explanation := SmaKit.muted(I18n.t(explain_key))
			explanation.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			box.add_child(explanation)
		_content.add_child(card)
	SmaKit.clear_children(_footer)
	_footer.add_child(SmaKit.button(I18n.t("quiz.retry"), _retry))
	_footer.add_child(SmaKit.hspacer())
	_footer.add_child(SmaKit.button(I18n.t("quiz.backToAcademy"), _close, true))


func _question_by_id(question_id: String) -> Dictionary:
	for question in session.get("questions", []):
		if String(question["id"]) == question_id:
			return question
	return {}


func _format_answer(value: Variant, question: Dictionary) -> String:
	if value == null:
		return I18n.t("quiz.noAnswer")
	if typeof(value) == TYPE_ARRAY:
		var parts: Array[String] = []
		for item in value:
			parts.append(I18n.t(String(item), SmaAcademy.formatted_params(question)))
		return " · ".join(parts) if not parts.is_empty() else I18n.t("quiz.noAnswer")
	if typeof(value) == TYPE_DICTIONARY:
		return str(value)
	if String(question.get("type", "")) == "numeric":
		var numeric := float(value)
		var kind := String(question.get("answerFormat", "number"))
		if kind == "money":
			return SmaFormat.money(numeric)
		if kind == "millions":
			return SmaFormat.num(numeric, 1) + " " + I18n.t("quiz.millionsUnit")
		if kind == "integer":
			return SmaFormat.num(numeric, 0)
		return SmaFormat.num(numeric, 2)
	return I18n.t(str(value), SmaAcademy.formatted_params(question))


func _retry() -> void:
	retry_requested.emit(unit_id)
	_close()


func _close() -> void:
	closed.emit()
	queue_free()
