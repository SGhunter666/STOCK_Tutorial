## Story archive: current chapter, replay entry point, flags and event history.
## The playable conversation itself lives in DialoguePanel.
class_name SmaStoryScreen
extends SmaScreen

var _active_box: VBoxContainer
var _catalog_box: VBoxContainer
var _flags_box: VBoxContainer
var _history_box: VBoxContainer


func _build() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	var root := SmaKit.vbox(12)
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(root)

	var heading := SmaKit.vbox(2)
	heading.add_child(SmaKit.title(I18n.t("story.title"), 22))
	heading.add_child(SmaKit.muted(I18n.t("story.subtitle")))
	heading.add_child(SmaKit.caption(I18n.t("story.event_hint")))
	root.add_child(heading)

	var active_card := SmaKit.card(14)
	_active_box = SmaKit.vbox(8)
	active_card.add_child(_active_box)
	root.add_child(active_card)

	var columns := SmaKit.hbox(12)
	columns.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(columns)

	var catalog_card := SmaKit.card(12)
	var catalog := SmaKit.vbox(8)
	catalog_card.add_child(catalog)
	catalog.add_child(SmaKit.label(I18n.t("story.open"), 13))
	var catalog_scroll := SmaKit.scroll(220)
	_catalog_box = SmaKit.vbox(6)
	catalog_scroll.add_child(_catalog_box)
	catalog.add_child(catalog_scroll)
	columns.add_child(catalog_card)

	var flags_card := SmaKit.card(12)
	var flags := SmaKit.vbox(8)
	flags_card.add_child(flags)
	flags.add_child(SmaKit.label(I18n.t("story.flags"), 13))
	var flags_scroll := SmaKit.scroll(220)
	_flags_box = SmaKit.vbox(4)
	flags_scroll.add_child(_flags_box)
	flags.add_child(flags_scroll)
	columns.add_child(flags_card)

	var history_card := SmaKit.card(12)
	var history := SmaKit.vbox(8)
	history_card.add_child(history)
	history.add_child(SmaKit.label(I18n.t("story.history"), 13))
	var history_scroll := SmaKit.scroll(220)
	_history_box = SmaKit.vbox(4)
	history_scroll.add_child(_history_box)
	history.add_child(history_scroll)
	columns.add_child(history_card)


func refresh(_reason: String = "") -> void:
	if game == null or not game.started or game.narrative == null:
		return
	_update_active()
	_update_catalog()
	_update_flags()
	_update_history()


func on_tick() -> void:
	pass


func _update_active() -> void:
	SmaKit.clear_children(_active_box)
	if game.narrative.is_active():
		var view: Dictionary = game.narrative.current_view()
		var head := SmaKit.hbox(10)
		head.add_child(SmaKit.label(I18n.t("story.active"), 13, SmaUiTheme.ACCENT))
		head.add_child(SmaKit.label(String(view.get("title", "")), 15))
		head.add_child(SmaKit.hspacer())
		var open := SmaKit.button(I18n.t("story.continue"), func(): _advance(), true)
		head.add_child(open)
		_active_box.add_child(head)
		_active_box.add_child(SmaKit.muted(String(view.get("speaker", ""))))
		var text := SmaKit.label(String(view.get("text", "")), 13)
		text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_active_box.add_child(text)
	else:
		_active_box.add_child(SmaKit.label(I18n.t("story.none"), 13, SmaUiTheme.MUTED))
		var replay := SmaKit.button(I18n.t("story.replay"), _replay, true)
		replay.custom_minimum_size.x = 160
		replay.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		_active_box.add_child(replay)


func _update_catalog() -> void:
	SmaKit.clear_children(_catalog_box)
	for story_id in game.narrative.stories.keys():
		var story: Dictionary = game.narrative.stories[story_id]
		var row := SmaKit.hbox(8)
		var title := String(story_id)
		if story.has("title"):
			title = game.localize(story["title"])
		row.add_child(SmaKit.cell(title, 1.4))
		var seen := bool(game.narrative.seen.get(story_id, false))
		row.add_child(SmaKit.cell(I18n.t("story.seen") if seen else "—", 0.6,
			HORIZONTAL_ALIGNMENT_RIGHT, SmaUiTheme.POSITIVE if seen else SmaUiTheme.DIM, 11))
		var open := SmaKit.button(I18n.t("story.open"), _start.bind(String(story_id)))
		open.add_theme_font_size_override("font_size", 10)
		row.add_child(open)
		_catalog_box.add_child(row)


func _update_flags() -> void:
	SmaKit.clear_children(_flags_box)
	var flags: Dictionary = game.narrative.flags
	if flags.is_empty():
		_flags_box.add_child(SmaKit.muted(I18n.t("story.no_flags")))
		return
	var keys := flags.keys()
	keys.sort()
	for key in keys:
		_flags_box.add_child(SmaKit.data_row([String(key), str(flags[key])],
			[1.2, 1.0], [SmaUiTheme.MUTED, SmaUiTheme.ACCENT],
			[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT]))


func _update_history() -> void:
	SmaKit.clear_children(_history_box)
	var history: Array = game.narrative.history
	if history.is_empty():
		_history_box.add_child(SmaKit.muted(I18n.t("story.no_history")))
		return
	var start := maxi(0, history.size() - 16)
	for index in range(history.size() - 1, start - 1, -1):
		var entry: Dictionary = history[index]
		var story_id := String(entry.get("story", ""))
		var title := story_id
		if game.narrative.stories.has(story_id) and game.narrative.stories[story_id].has("title"):
			title = game.localize(game.narrative.stories[story_id]["title"])
		var kind := String(entry.get("kind", ""))
		var kind_key := "story.kind_%s" % kind
		var kind_label := I18n.t(kind_key) if I18n.has_key(kind_key) else kind
		_history_box.add_child(SmaKit.data_row([
			"T%s" % str(entry.get("day", 0)), title, kind_label,
		], [0.5, 1.8, 0.9], [SmaUiTheme.MUTED, SmaUiTheme.TEXT, SmaUiTheme.ACCENT],
			[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_LEFT]))


func _advance() -> void:
	if game.narrative.is_active():
		game.narrative.advance()


func _start(story_id: String) -> void:
	if not game.narrative.is_active():
		game.narrative.start_story(story_id)


func _replay() -> void:
	_start("opening")
