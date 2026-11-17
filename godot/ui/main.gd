## Application shell: top bar, navigation, feature screens, start overlay,
## dialogue overlay and toast layer. Screens are rebuilt on locale changes and
## only receive state through Game's public interface.
class_name SmaMain
extends Control

const NAV_ITEMS := [
	["dashboard", "nav.dashboard"],
	["market", "nav.market"],
	["etf", "nav.etf"],
	["trade", "nav.trade"],
	["options", "nav.options"],
	["futures", "nav.futures"],
	["multiasset", "nav.multiasset"],
	["news", "nav.news"],
	["macro", "nav.macro"],
	["portfolio", "nav.portfolio"],
	["academy", "nav.academy"],
	["challenges", "nav.challenges"],
	["career", "nav.career"],
	["fund", "nav.fund"],
	["quant", "nav.quant"],
	["tax", "nav.tax"],
	["history", "nav.history"],
	["replay", "nav.replay"],
	["statements", "statements.title"],
	["glossary", "nav.glossary"],
	["sandbox", "nav.sandbox"],
	["roadmap", "roadmap.title"],
	["boundaries", "boundaries.title"],
	["settings", "nav.settings"],
	["story", "nav.story"],
]

var _screens: Dictionary = {}
var _nav_buttons: Dictionary = {}
var _current_screen := "market"
var _screen_host: Control
var _dialogue: SmaDialoguePanel
var _start_overlay: Control
var _ff_overlay: Control
var _ff_bar: ProgressBar
var _ff_percent: Label
var _toast_panel: PanelContainer
var _toast_label: Label
var _toast_tween: Tween

var _cash_label: Label
var _equity_label: Label
var _pnl_label: Label
var _day_label: Label
var _clock_label: Label
var _story_badge: Label
var _pause_button: Button
var _speed_buttons: Dictionary = {}
var _step_buttons: Array[Button] = []
var _start_continue: Button
var _top_metrics: Dictionary = {}


func _ready() -> void:
	add_to_group("main")
	Game.state_changed.connect(_on_state_changed)
	Game.tick.connect(_on_tick)
	Game.story_changed.connect(_on_story_changed)
	Game.toast_requested.connect(show_toast)
	Game.game_started.connect(_on_game_started)
	Game.game_loaded.connect(_on_game_loaded)
	Game.fast_forward_started.connect(_on_fast_forward_started)
	Game.fast_forward_progress.connect(_on_fast_forward_progress)
	Game.fast_forward_finished.connect(_on_fast_forward_finished)
	Game.academy_changed.connect(_on_academy_changed)
	I18n.locale_changed.connect(_on_locale_changed)
	Game.layout_changed.connect(_on_layout_changed)
	Game.theme_changed.connect(_on_theme_changed)
	_build_ui()
	if not Game.started:
		_show_start_overlay()


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST and Game.started:
		Game.save_game(false)


# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------

func _build_ui() -> void:
	# The Control theme holds button and input styleboxes captured at build time,
	# so it must be rebuilt whenever the palette or density changes.
	theme = SmaUiTheme.build()
	_start_overlay = null
	_ff_overlay = null
	_ff_bar = null
	_ff_percent = null
	_dialogue = null
	_toast_panel = null
	_toast_label = null
	_toast_tween = null
	_nav_buttons.clear()
	_speed_buttons.clear()
	_step_buttons.clear()
	_top_metrics.clear()
	SmaKit.clear_children(self)
	var background := ColorRect.new()
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.color = SmaUiTheme.BG
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)

	var root := VBoxContainer.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 0)
	add_child(root)
	root.add_child(_build_topbar())

	var body := HBoxContainer.new()
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 0)
	root.add_child(body)
	body.add_child(_build_sidebar())

	var content_margin := MarginContainer.new()
	content_margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content_margin.size_flags_vertical = Control.SIZE_EXPAND_FILL
	for side in ["left", "right", "top", "bottom"]:
		content_margin.add_theme_constant_override("margin_%s" % side, 16)
	body.add_child(content_margin)
	_screen_host = Control.new()
	_screen_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_screen_host.size_flags_vertical = Control.SIZE_EXPAND_FILL
	content_margin.add_child(_screen_host)

	_build_screens()
	_dialogue = SmaDialoguePanel.new()
	_dialogue.setup(Game)
	add_child(_dialogue)
	_build_fast_forward_overlay()
	_build_toast()
	_update_topbar()
	_refresh_nav()


func _build_topbar() -> Control:
	var bar := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = SmaUiTheme.BG_DEEP
	style.border_color = SmaUiTheme.BORDER
	style.border_width_bottom = 1
	style.set_content_margin_all(0)
	bar.add_theme_stylebox_override("panel", style)

	var margin := MarginContainer.new()
	for side in ["left", "right"]:
		margin.add_theme_constant_override("margin_%s" % side, 16)
	for side in ["top", "bottom"]:
		margin.add_theme_constant_override("margin_%s" % side, 10)
	bar.add_child(margin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	margin.add_child(row)

	var brand := VBoxContainer.new()
	brand.add_theme_constant_override("separation", 0)
	var brand_main := SmaKit.label("SMA", 18, SmaUiTheme.ACCENT)
	brand_main.add_theme_color_override("font_outline_color", SmaUiTheme.BG_DEEP)
	brand.add_child(brand_main)
	brand.add_child(SmaKit.caption(I18n.t("app.title")))
	row.add_child(brand)
	row.add_child(_vertical_divider())

	var clock_box := VBoxContainer.new()
	clock_box.add_theme_constant_override("separation", 0)
	_day_label = SmaKit.label("—", 12, SmaUiTheme.MUTED)
	_clock_label = SmaKit.label("09:30:00", 17)
	clock_box.add_child(_day_label)
	clock_box.add_child(_clock_label)
	row.add_child(clock_box)
	row.add_child(_vertical_divider())

	for spec in [["cash", "header.cash"], ["equity", "header.equity"], ["pnl", "header.day_pnl"]]:
		var box := VBoxContainer.new()
		box.add_theme_constant_override("separation", 0)
		box.add_child(SmaKit.caption(I18n.t(String(spec[1]))))
		var value := SmaKit.label("—", 15)
		box.add_child(value)
		_top_metrics[String(spec[0])] = value
		row.add_child(box)
	_cash_label = _top_metrics["cash"]
	_equity_label = _top_metrics["equity"]
	_pnl_label = _top_metrics["pnl"]

	row.add_child(SmaKit.hspacer())

	var speed_box := HBoxContainer.new()
	speed_box.add_theme_constant_override("separation", 3)
	var group := ButtonGroup.new()
	for value in Game.SPEEDS:
		var button := SmaKit.toggle("%d×" % value, group)
		button.custom_minimum_size.x = 38
		button.add_theme_font_size_override("font_size", 11)
		button.pressed.connect(_on_speed.bind(int(value)))
		_speed_buttons[int(value)] = button
		speed_box.add_child(button)
	row.add_child(speed_box)

	_pause_button = SmaKit.button(I18n.t("header.pause"), _toggle_pause)
	_pause_button.custom_minimum_size.x = 64
	row.add_child(_pause_button)

	var minute_button := SmaKit.button(I18n.t("header.step_minute"), _step_minute)
	minute_button.add_theme_font_size_override("font_size", 10)
	minute_button.tooltip_text = I18n.t("header.step_minute")
	_step_buttons.append(minute_button)
	row.add_child(minute_button)

	var day_button := SmaKit.button(I18n.t("header.step_day"), _step_day)
	day_button.add_theme_font_size_override("font_size", 10)
	day_button.tooltip_text = I18n.t("header.step_day")
	_step_buttons.append(day_button)
	row.add_child(day_button)

	var save_button := SmaKit.button(I18n.t("header.save"), func(): Game.save_game(true))
	save_button.add_theme_font_size_override("font_size", 11)
	row.add_child(save_button)

	var language := SmaKit.button("中 / EN", _toggle_language)
	language.add_theme_font_size_override("font_size", 11)
	row.add_child(language)
	return bar


func _build_sidebar() -> Control:
	var panel := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = SmaUiTheme.BG_DEEP
	style.border_color = SmaUiTheme.BORDER
	style.border_width_right = 1
	style.set_content_margin_all(12)
	panel.add_theme_stylebox_override("panel", style)
	panel.custom_minimum_size.x = 196

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	panel.add_child(box)
	var nav_scroll := ScrollContainer.new()
	nav_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	nav_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_child(nav_scroll)
	var nav_box := VBoxContainer.new()
	nav_box.add_theme_constant_override("separation", 4)
	nav_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	nav_scroll.add_child(nav_box)
	var group := ButtonGroup.new()
	for entry in NAV_ITEMS:
		var button := SmaKit.toggle(I18n.t(String(entry[1])), group)
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.custom_minimum_size.y = 32
		button.pressed.connect(func(): navigate(String(entry[0])))
		_nav_buttons[String(entry[0])] = button
		nav_box.add_child(button)
	_story_badge = SmaKit.caption("")
	nav_box.add_child(_story_badge)
	var disclaimer := SmaKit.caption(I18n.t("app.disclaimer"))
	disclaimer.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(disclaimer)
	return panel


func _vertical_divider() -> Control:
	var line := ColorRect.new()
	line.color = SmaUiTheme.BORDER
	line.custom_minimum_size.x = 1
	line.custom_minimum_size.y = 34
	return line


func _build_screens() -> void:
	_screens.clear()
	_screens["dashboard"] = SmaDashboardScreen.new()
	_screens["market"] = SmaMarketScreen.new()
	_screens["etf"] = SmaEtfScreen.new()
	_screens["trade"] = SmaTradeScreen.new()
	_screens["options"] = SmaOptionsScreen.new()
	_screens["futures"] = SmaFuturesScreen.new()
	_screens["multiasset"] = SmaMultiAssetScreen.new()
	_screens["news"] = SmaNewsScreen.new()
	_screens["macro"] = SmaMacroScreen.new()
	_screens["portfolio"] = SmaPortfolioScreen.new()
	_screens["academy"] = SmaAcademyScreen.new()
	_screens["challenges"] = SmaChallengesScreen.new()
	_screens["career"] = SmaCareerScreen.new()
	_screens["fund"] = SmaFundScreen.new()
	_screens["quant"] = SmaQuantScreen.new()
	_screens["tax"] = SmaTaxScreen.new()
	_screens["history"] = SmaHistoryScreen.new()
	_screens["replay"] = SmaReplayScreen.new()
	_screens["statements"] = SmaStatementsScreen.new()
	_screens["glossary"] = SmaGlossaryScreen.new()
	_screens["sandbox"] = SmaSandboxScreen.new()
	_screens["roadmap"] = SmaRoadmapScreen.new()
	_screens["boundaries"] = SmaBoundariesScreen.new()
	_screens["settings"] = SmaSettingsScreen.new()
	_screens["story"] = SmaStoryScreen.new()
	for id in _screens.keys():
		var screen: SmaScreen = _screens[id]
		screen.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		_screen_host.add_child(screen)
		screen.setup(Game)
		screen.visible = false
	navigate(_current_screen, false)


func _build_toast() -> void:
	_toast_panel = PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = SmaUiTheme.PANEL_ALT
	style.border_color = SmaUiTheme.ACCENT_DARK
	style.set_border_width_all(1)
	style.set_corner_radius_all(10)
	style.set_content_margin_all(10)
	style.shadow_color = Color(0, 0, 0, 0.35)
	style.shadow_size = 10
	_toast_panel.add_theme_stylebox_override("panel", style)
	_toast_panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	_toast_panel.position = Vector2(size.x * 0.5, size.y - 70)
	_toast_panel.visible = false
	_toast_panel.z_index = 60
	_toast_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_toast_label = SmaKit.label("", 12)
	_toast_panel.add_child(_toast_label)
	add_child(_toast_panel)


# ---------------------------------------------------------------------------
# Navigation and refresh
# ---------------------------------------------------------------------------

func navigate(screen_id: String, force: bool = false) -> void:
	if not _screens.has(screen_id):
		return
	_current_screen = screen_id
	for id in _screens.keys():
		_screens[id].visible = id == screen_id
	for id in _nav_buttons.keys():
		_nav_buttons[id].button_pressed = id == screen_id
	var screen: SmaScreen = _screens[screen_id]
	if force or not screen.built:
		screen.setup(Game)
	else:
		screen.refresh("nav")


func _refresh_nav() -> void:
	for id in _nav_buttons.keys():
		_nav_buttons[id].button_pressed = id == _current_screen
	if _story_badge != null:
		var active := Game.started and Game.narrative != null and Game.narrative.is_active()
		_story_badge.text = "● %s" % I18n.t("story.active") if active else ""


func _on_state_changed(reason: String) -> void:
	_update_topbar()
	_refresh_nav()
	if _screens.has(_current_screen):
		_screens[_current_screen].refresh(reason)


func _on_tick() -> void:
	_update_topbar()
	if Game.is_fast_forwarding():
		return
	if _screens.has(_current_screen):
		_screens[_current_screen].on_tick()


func _on_story_changed() -> void:
	_refresh_nav()
	if _dialogue != null:
		_dialogue.refresh()
	if _screens.has(_current_screen):
		_screens[_current_screen].refresh("story")


func _on_academy_changed() -> void:
	if _screens.has("academy"):
		_screens["academy"].refresh("academy")


func _on_game_started() -> void:
	if _start_overlay != null:
		_start_overlay.visible = false
	navigate("market", false)


func _on_game_loaded() -> void:
	if _start_overlay != null:
		_start_overlay.visible = false
	# A save carries its own theme and layout, so rebuild before showing it.
	_build_ui()
	navigate("market", false)


func _build_fast_forward_overlay() -> void:
	_ff_overlay = Control.new()
	_ff_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_ff_overlay.z_index = 45
	_ff_overlay.visible = false
	_ff_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_ff_overlay)
	var dim := ColorRect.new()
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.color = Color(0.02, 0.04, 0.07, 0.62)
	_ff_overlay.add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_ff_overlay.add_child(center)
	var panel := SmaKit.card(22)
	panel.custom_minimum_size = Vector2(480, 0)
	center.add_child(panel)
	var box := SmaKit.vbox(10)
	panel.add_child(box)
	box.add_child(SmaKit.label(I18n.t("fast_forward.title"), 18))
	box.add_child(SmaKit.muted(I18n.t("fast_forward.hint")))
	_ff_bar = ProgressBar.new()
	_ff_bar.min_value = 0
	_ff_bar.max_value = 100
	_ff_bar.value = 0
	_ff_bar.show_percentage = false
	_ff_bar.custom_minimum_size = Vector2(420, 14)
	var background := StyleBoxFlat.new()
	background.bg_color = SmaUiTheme.BG_DEEP
	background.border_color = SmaUiTheme.BORDER
	background.set_border_width_all(1)
	background.set_corner_radius_all(7)
	var fill := StyleBoxFlat.new()
	fill.bg_color = SmaUiTheme.ACCENT_DARK
	fill.border_color = SmaUiTheme.ACCENT
	fill.set_border_width_all(1)
	fill.set_corner_radius_all(7)
	_ff_bar.add_theme_stylebox_override("background", background)
	_ff_bar.add_theme_stylebox_override("fill", fill)
	box.add_child(_ff_bar)
	_ff_percent = SmaKit.caption("0%")
	box.add_child(_ff_percent)


func _on_fast_forward_started() -> void:
	if _ff_overlay != null:
		_ff_overlay.visible = true
		_ff_bar.value = 0
		_ff_percent.text = "0%"


func _on_fast_forward_progress(value: float) -> void:
	if _ff_bar == null:
		return
	var percent := clampf(value, 0.0, 1.0)
	_ff_bar.value = percent * 100.0
	_ff_percent.text = "%d%%" % int(round(percent * 100.0))


func _on_fast_forward_finished() -> void:
	if _ff_overlay != null:
		_ff_overlay.visible = false
	_update_topbar()


func _update_topbar() -> void:
	if not Game.started or Game.exchange == null:
		_day_label.text = "—"
		_clock_label.text = "09:30:00"
		_cash_label.text = "—"
		_equity_label.text = "—"
		_pnl_label.text = "—"
		return
	var day := int(Game.exchange.state["dayIndex"])
	_day_label.text = "T%d · %s" % [day, SmaCalendar.format_date(day, I18n.locale)]
	_clock_label.text = SmaCalendar.session_clock(int(Game.exchange.state["second"]))
	var cash := float(Game.exchange.state["account"]["cash"])
	var equity := Game.exchange.equity()
	var pnl := equity - _day_start_equity()
	_cash_label.text = SmaFormat.money(cash)
	_equity_label.text = SmaFormat.money(equity)
	_pnl_label.text = SmaFormat.signed_money(pnl)
	_pnl_label.add_theme_color_override("font_color", SmaKit.value_color(pnl))
	_pause_button.text = I18n.t("header.play") if Game.paused else I18n.t("header.pause")
	var fast_forwarding: bool = Game.is_fast_forwarding()
	_pause_button.disabled = Game.is_story_paused() or fast_forwarding
	for value in _speed_buttons.keys():
		_speed_buttons[value].button_pressed = int(Game.speed) == int(value)
		_speed_buttons[value].disabled = fast_forwarding
	for button in _step_buttons:
		button.disabled = Game.is_story_paused() or fast_forwarding


func _day_start_equity() -> float:
	var history: Array = Game.exchange.state["account"]["equityHistory"]
	var day := int(Game.exchange.state["dayIndex"])
	var value := float(Game.exchange.state["account"]["initialCash"])
	for point in history:
		if int(point.get("day", 0)) < day:
			value = float(point.get("equity", value))
	return value


# ---------------------------------------------------------------------------
# Header actions
# ---------------------------------------------------------------------------

func _on_speed(value: int) -> void:
	Game.set_speed(value)
	if Game.paused and not Game.is_story_paused():
		Game.set_paused(false)
	_update_topbar()


func _toggle_pause() -> void:
	Game.toggle_pause()
	_update_topbar()


func _step_minute() -> void:
	Game.step_minute()
	_update_topbar()


func _step_day() -> void:
	Game.step_day()
	_update_topbar()


func _toggle_language() -> void:
	I18n.toggle()
	Game.settings["locale"] = I18n.locale
	Game.academy_mark_language_switched()


func _on_locale_changed(_locale: String) -> void:
	var start_visible := _start_overlay != null and _start_overlay.visible
	_build_ui()
	if not Game.started or start_visible:
		_show_start_overlay()


func _on_layout_changed() -> void:
	var start_visible := _start_overlay != null and _start_overlay.visible
	_build_ui()
	if not Game.started or start_visible:
		_show_start_overlay()


func _on_theme_changed() -> void:
	var start_visible := _start_overlay != null and _start_overlay.visible
	_build_ui()
	if not Game.started or start_visible:
		_show_start_overlay()


# ---------------------------------------------------------------------------
# Start overlay and toast
# ---------------------------------------------------------------------------

func _show_start_overlay() -> void:
	if _start_overlay != null:
		_start_overlay.visible = true
		return
	_start_overlay = Control.new()
	_start_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_start_overlay.z_index = 40
	add_child(_start_overlay)
	var dim := ColorRect.new()
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.color = Color(0.02, 0.04, 0.07, 0.9)
	_start_overlay.add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_start_overlay.add_child(center)
	var panel := SmaKit.card(28)
	panel.custom_minimum_size = Vector2(620, 0)
	center.add_child(panel)
	var box := SmaKit.vbox(14)
	panel.add_child(box)
	box.add_child(SmaKit.label("SMA", 15, SmaUiTheme.ACCENT))
	box.add_child(SmaKit.label(I18n.t("start.title"), 34))
	box.add_child(SmaKit.muted(I18n.t("start.subtitle"), 14))
	box.add_child(SmaKit.caption(I18n.t("app.tagline")))
	box.add_child(SmaKit.separator())
	var new_game := SmaKit.button(I18n.t("start.new_game"), _start_new_game, true)
	new_game.custom_minimum_size.y = 46
	box.add_child(new_game)
	_start_continue = SmaKit.button(I18n.t("start.continue"), _continue_game)
	_start_continue.custom_minimum_size.y = 42
	_start_continue.disabled = not Game.has_save()
	box.add_child(_start_continue)
	if not Game.has_save():
		box.add_child(SmaKit.caption(I18n.t("start.no_save")))
	box.add_child(SmaKit.separator())
	var footer := SmaKit.hbox(10)
	footer.add_child(SmaKit.caption(I18n.t("start.footer")))
	footer.add_child(SmaKit.hspacer())
	footer.add_child(SmaKit.button(I18n.t("start.language"), _toggle_language))
	box.add_child(footer)
	var disclaimer := SmaKit.caption(I18n.t("app.disclaimer"))
	disclaimer.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(disclaimer)


func _start_new_game() -> void:
	Game.new_game()
	_start_overlay.visible = false


func _continue_game() -> void:
	if Game.load_game() and _start_overlay != null:
		_start_overlay.visible = false


func show_toast(message: String) -> void:
	if _toast_panel == null or message == "":
		return
	_toast_label.text = message
	_toast_panel.visible = true
	_toast_panel.modulate = Color.WHITE
	_toast_panel.reset_size()
	_toast_panel.position = Vector2(size.x * 0.5 - _toast_panel.size.x * 0.5, size.y - 76)
	if _toast_tween != null and _toast_tween.is_valid():
		_toast_tween.kill()
	_toast_tween = create_tween()
	_toast_tween.tween_interval(2.6)
	_toast_tween.tween_property(_toast_panel, "modulate:a", 0.0, 0.35)
	_toast_tween.tween_callback(func(): _toast_panel.visible = false)
