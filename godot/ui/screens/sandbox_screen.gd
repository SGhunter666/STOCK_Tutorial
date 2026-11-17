## Sandbox mode: an independent paper-trading book with configurable capital,
## market seed and commission. It never overwrites the career save.
class_name SmaSandboxScreen
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
	if game == null:
		return
	_render_header()
	if game.sandbox_mode:
		_render_current()
	else:
		_render_setup()
	_render_rules()


func _render_header() -> void:
	var header := SmaKit.hbox(10)
	var titles := SmaKit.vbox(2)
	titles.add_child(SmaKit.label(I18n.t("sandbox.title"), 20))
	var subtitle := SmaKit.muted(I18n.t("sandbox.subtitle"), 12)
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	titles.add_child(subtitle)
	header.add_child(titles)
	header.add_child(SmaKit.hspacer())
	header.add_child(SmaKit.label(I18n.t("sandbox.activePill" if game.sandbox_mode
		else "sandbox.careerPill"), 11, SmaUiTheme.ACCENT))
	_body.add_child(header)


func _render_setup() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(6)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("sandbox.setupTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("sandbox.setupSubtitle"), 11))
	var cash := SpinBox.new()
	cash.min_value = 1000
	cash.max_value = 10000000
	cash.step = 1000
	cash.value = float(game.sandbox_config.get("cash", 100000.0))
	box.add_child(_field("sandbox.cashLabel", cash))
	var seed_input := LineEdit.new()
	seed_input.text = String(game.sandbox_config.get("seed", "sandbox-2026"))
	seed_input.max_length = 48
	box.add_child(_field("sandbox.seedLabel", seed_input))
	var difficulty := OptionButton.new()
	var values := ["easy", "normal", "hard"]
	for index in values.size():
		difficulty.add_item(I18n.t("sandbox.difficulty.%s" % String(values[index])))
		if String(values[index]) == String(game.sandbox_config.get("difficulty", "normal")):
			difficulty.selected = index
	box.add_child(_field("sandbox.difficultyLabel", difficulty))
	var start := SmaKit.button(I18n.t("sandbox.start"), Callable(), true)
	start.pressed.connect(func():
		game.start_sandbox(cash.value, seed_input.text, String(values[difficulty.selected]))
		refresh())
	box.add_child(start)
	box.add_child(SmaKit.muted(I18n.t("sandbox.note"), 10))
	_body.add_child(card)


func _field(label_key: String, control: Control) -> VBoxContainer:
	var box := SmaKit.vbox(1)
	box.add_child(SmaKit.caption(I18n.t(label_key)))
	box.add_child(control)
	return box


func _render_current() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("sandbox.currentTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("sandbox.currentSubtitle"), 11))
	for pair in [
		["sandbox.cashLabel", SmaFormat.money(float(game.sandbox_config["cash"]))],
		["sandbox.seedLabel", String(game.sandbox_config["seed"])],
		["sandbox.difficultyLabel", I18n.t("sandbox.difficulty.%s" % String(
			game.sandbox_config["difficulty"]))],
		["sandbox.commission", SmaFormat.num(float(game.sandbox_config["commission"]), 1)],
		["sandbox.equityLabel", SmaFormat.money(game.get_equity())],
	]:
		var row := SmaKit.hbox(8)
		row.add_child(SmaKit.muted(I18n.t(String(pair[0])), 11))
		row.add_child(SmaKit.hspacer())
		row.add_child(SmaKit.label(String(pair[1]), 11))
		box.add_child(row)
	var actions := SmaKit.hbox(8)
	actions.add_child(SmaKit.button(I18n.t("sandbox.restart"), _restart, true))
	actions.add_child(SmaKit.button(I18n.t("sandbox.exit"), _exit))
	box.add_child(actions)
	box.add_child(SmaKit.muted(I18n.t("sandbox.activeNote"), 10))
	_body.add_child(card)


func _restart() -> void:
	game.restart_sandbox()
	refresh()


func _exit() -> void:
	game.exit_sandbox()
	refresh()
	var main := get_tree().get_first_node_in_group("main")
	if main != null and main.has_method("navigate"):
		main.navigate("dashboard")


func _render_rules() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("sandbox.rulesTitle"), 14))
	box.add_child(SmaKit.muted(I18n.t("sandbox.rulesSubtitle"), 11))
	for key in ["sandbox.ruleIndependent", "sandbox.ruleCourse", "sandbox.ruleReset",
			"sandbox.ruleDifficulty"]:
		box.add_child(SmaKit.muted("• " + I18n.t(key), 11))
	_body.add_child(card)
