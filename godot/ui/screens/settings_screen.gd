## Settings: language, clock speed, save data, scope and the explicit
## simulation boundaries page.
class_name SmaSettingsScreen
extends SmaScreen

var _body: VBoxContainer
var _export_dialog: FileDialog
var _import_dialog: FileDialog


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
	_render_language()
	_render_simulation()
	_render_display()
	_render_data()
	_render_scope()
	_render_boundaries()


func _render_header() -> void:
	var header := SmaKit.vbox(2)
	header.add_child(SmaKit.label(I18n.t("settings.title"), 20))
	var subtitle := SmaKit.muted(I18n.t("settings.subtitle"), 12)
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	header.add_child(subtitle)
	_body.add_child(header)


func _render_language() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(6)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("settings.languageTitle"), 14))
	box.add_child(SmaKit.muted(I18n.t("settings.languageSubtitle"), 11))
	var row := SmaKit.hbox(8)
	for entry in [["zh_CN", "简体中文", "settings.languageZhNote"],
			["en", "English", "settings.languageEnNote"]]:
		var button := SmaKit.button(String(entry[1]), Callable(),
			I18n.locale == String(entry[0]))
		button.custom_minimum_size.x = 180
		button.pressed.connect(func():
			I18n.set_locale(String(entry[0]))
			game.settings["locale"] = String(entry[0])
			game.save_game(false))
		row.add_child(button)
	box.add_child(row)
	box.add_child(SmaKit.muted(I18n.t("settings.languageHint"), 10))
	_body.add_child(card)


func _render_simulation() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("settings.simulationTitle"), 14))
	box.add_child(SmaKit.muted(I18n.t("settings.simulationSubtitle"), 11))
	var row := SmaKit.hbox(6)
	row.add_child(SmaKit.label(I18n.t("settings.speed"), 11))
	for speed in [1, 5, 10, 30, 60]:
		var button := SmaKit.toggle("%d×" % int(speed))
		button.button_pressed = int(game.speed) == int(speed)
		button.pressed.connect(func():
			game.set_speed(int(speed))
			game.save_game(false)
			refresh())
		row.add_child(button)
	box.add_child(row)
	var layout_row := SmaKit.hbox(6)
	layout_row.add_child(SmaKit.label(I18n.t("settings.layoutTitle"), 11))
	var layout_select := OptionButton.new()
	layout_select.add_item(I18n.t("settings.beginner"))
	layout_select.add_item(I18n.t("settings.advanced"))
	layout_select.selected = 1 if String(game.settings.get("layout", "beginner")) \
		== "advanced" else 0
	layout_select.custom_minimum_size.x = 150
	layout_select.item_selected.connect(func(index):
		game.set_layout("advanced" if index == 1 else "beginner"))
	layout_row.add_child(layout_select)
	box.add_child(layout_row)
	box.add_child(SmaKit.muted(I18n.t("settings.layoutHint"), 10))
	var theme_row := SmaKit.hbox(6)
	theme_row.add_child(SmaKit.label(I18n.t("settings.themeTitle"), 11))
	var theme_select := OptionButton.new()
	theme_select.add_item(I18n.t("settings.themeDark"))
	theme_select.add_item(I18n.t("settings.themeLight"))
	theme_select.selected = 1 if String(game.settings.get("theme", "dark")) == "light" else 0
	theme_select.custom_minimum_size.x = 150
	theme_select.item_selected.connect(func(index):
		game.set_theme("light" if index == 1 else "dark"))
	theme_row.add_child(theme_select)
	box.add_child(theme_row)
	box.add_child(SmaKit.muted(I18n.t("settings.themeHint"), 10))
	var motion := CheckBox.new()
	motion.text = I18n.t("settings.reducedMotion")
	motion.button_pressed = bool(game.settings.get("reducedMotion", false))
	motion.toggled.connect(func(value):
		game.settings["reducedMotion"] = value
		game.save_game(false))
	box.add_child(motion)
	_body.add_child(card)


func _render_display() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(6)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("settings.displayTitle"), 14))
	box.add_child(SmaKit.muted(I18n.t("settings.displaySubtitle"), 11))
	var mode_row := SmaKit.hbox(6)
	mode_row.add_child(SmaKit.label(I18n.t("settings.displayMode"), 11))
	var mode_select := OptionButton.new()
	mode_select.add_item(I18n.t("settings.displayWindowed"))
	mode_select.add_item(I18n.t("settings.displayFullscreen"))
	mode_select.selected = 1 if String(game.settings.get("displayMode", "windowed")) \
		== "fullscreen" else 0
	mode_select.custom_minimum_size.x = 150
	mode_select.item_selected.connect(func(index):
		game.set_display_mode("fullscreen" if index == 1 else "windowed"))
	mode_row.add_child(mode_select)
	box.add_child(mode_row)
	var preset_row := SmaKit.hbox(6)
	preset_row.add_child(SmaKit.label(I18n.t("settings.displayResolution"), 11))
	var preset_select := OptionButton.new()
	for preset in SmaDisplay.PRESETS:
		preset_select.add_item(I18n.t("settings.displayAuto") if preset == "auto"
			else preset.replace("x", " × "))
		preset_select.set_item_metadata(preset_select.item_count - 1, preset)
		if String(game.settings.get("windowPreset", "auto")) == preset:
			preset_select.select(preset_select.item_count - 1)
	preset_select.custom_minimum_size.x = 160
	preset_select.disabled = String(game.settings.get("displayMode", "windowed")) == "fullscreen"
	preset_select.item_selected.connect(func(index):
		game.set_window_preset(String(preset_select.get_item_metadata(index))))
	preset_row.add_child(preset_select)
	box.add_child(preset_row)
	box.add_child(SmaKit.muted(I18n.t("settings.displayNote"), 10))
	_body.add_child(card)


func _render_data() -> void:
	var info: Dictionary = game.save_info()
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("settings.dataTitle"), 14))
	box.add_child(SmaKit.muted(I18n.t("settings.dataSubtitle"), 11))
	var saved := int(info.get("modified", 0))
	var saved_text := I18n.t("settings.notSavedYet")
	if saved > 0:
		var stamp := Time.get_datetime_dict_from_unix_time(saved)
		saved_text = I18n.t("settings.lastSaved", {
			"time": "%02d:%02d:%02d" % [int(stamp["hour"]), int(stamp["minute"]),
				int(stamp["second"])]})
	box.add_child(SmaKit.muted(saved_text, 11))
	box.add_child(SmaKit.muted(String(info.get("path", "")), 10))
	var actions := SmaKit.hbox(8)
	actions.add_child(SmaKit.button(I18n.t("settings.saveNow"), _save_now, true))
	actions.add_child(SmaKit.button(I18n.t("settings.exportSave"), _export))
	actions.add_child(SmaKit.button(I18n.t("settings.importSave"), _import))
	actions.add_child(SmaKit.button(I18n.t("settings.resetProgress"), _reset))
	box.add_child(actions)
	box.add_child(SmaKit.muted(I18n.t("settings.dataHint"), 10))
	_body.add_child(card)


func _save_now() -> void:
	game.save_now()
	refresh()


func _export() -> void:
	if _export_dialog == null:
		_export_dialog = FileDialog.new()
		_export_dialog.file_mode = FileDialog.FILE_MODE_SAVE_FILE
		_export_dialog.access = FileDialog.ACCESS_FILESYSTEM
		_export_dialog.add_filter("*.json", "JSON")
		_export_dialog.file_selected.connect(func(path):
			game.export_save(path))
		add_child(_export_dialog)
	_export_dialog.popup_centered_ratio(0.6)


func _import() -> void:
	if _import_dialog == null:
		_import_dialog = FileDialog.new()
		_import_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
		_import_dialog.access = FileDialog.ACCESS_FILESYSTEM
		_import_dialog.add_filter("*.json", "JSON")
		_import_dialog.file_selected.connect(func(path):
			game.import_save(path))
		add_child(_import_dialog)
	_import_dialog.popup_centered_ratio(0.6)


func _reset() -> void:
	var dialog := ConfirmationDialog.new()
	dialog.title = I18n.t("settings.resetTitle")
	dialog.dialog_text = I18n.t("settings.resetMessage")
	dialog.ok_button_text = I18n.t("settings.resetConfirm")
	dialog.confirmed.connect(func():
		game.reset_progress()
		refresh())
	add_child(dialog)
	dialog.popup_centered()


func _render_scope() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("settings.scopeTitle"), 14))
	var scope_subtitle := SmaKit.muted(I18n.t("settings.scopeSubtitle"), 11)
	scope_subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(scope_subtitle)
	var scope_text := SmaKit.muted(I18n.t("settings.scopeText"), 10)
	scope_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(scope_text)
	var columns := SmaKit.hbox(18)
	var included := SmaKit.vbox(2)
	included.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	included.add_child(SmaKit.caption(I18n.t("settings.scopeIncluded")))
	for key in ["settings.scope.p1a", "settings.scope.p1b", "settings.scope.p1c",
			"settings.scope.p1d", "settings.scope.p1e", "settings.scope.p1f",
			"settings.scope.p1g", "settings.scope.p1h", "settings.scope.p1i",
			"settings.scope.p1j", "settings.scope.p1k"]:
		var item := SmaKit.muted("• " + I18n.t(key), 10)
		item.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		included.add_child(item)
	columns.add_child(included)
	var planned := SmaKit.vbox(2)
	planned.custom_minimum_size.x = 300
	planned.size_flags_horizontal = Control.SIZE_SHRINK_END
	planned.add_child(SmaKit.caption(I18n.t("settings.scopePlanned")))
	for key in ["settings.scope.future.a", "settings.scope.future.b",
			"settings.scope.future.c"]:
		var item := SmaKit.muted("• " + I18n.t(key), 10)
		item.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		planned.add_child(item)
	columns.add_child(planned)
	box.add_child(columns)
	var disclaimer := SmaKit.muted(I18n.t("settings.disclaimer"), 10)
	disclaimer.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(disclaimer)
	_body.add_child(card)


func _render_boundaries() -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("boundaries.title"), 14))
	box.add_child(SmaKit.muted(I18n.t("boundaries.intro"), 11))
	box.add_child(SmaKit.button(I18n.t("boundaries.settingsLink"), _go_boundaries))
	_body.add_child(card)


func _go_boundaries() -> void:
	var main := get_tree().get_first_node_in_group("main")
	if main != null and main.has_method("navigate"):
		main.navigate("boundaries")
