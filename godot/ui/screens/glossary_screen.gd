## Bilingual glossary page. Search filters by both language names and
## definitions; opening a term uses the shared glossary modal.
class_name SmaGlossaryScreen
extends SmaScreen

var _body: VBoxContainer
var _search: LineEdit
var _grid: GridContainer
var _empty: Label
var _terms: Array = []


func _build() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	var root := SmaKit.vbox(10)
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(root)
	_terms = SmaAcademy.catalog().get("glossary", [])
	_render_header(root)
	var toolbar := SmaKit.hbox(10)
	_search = LineEdit.new()
	_search.placeholder_text = I18n.t("glossary.searchPlaceholder")
	_search.custom_minimum_size.x = 360
	_search.text_changed.connect(func(_text): _apply_filter())
	toolbar.add_child(_search)
	toolbar.add_child(SmaKit.muted(I18n.t("glossary.twoLanguages"), 11))
	root.add_child(toolbar)
	var scroll := SmaKit.scroll()
	root.add_child(scroll)
	_body = SmaKit.vbox(10)
	scroll.add_child(_body)
	_grid = GridContainer.new()
	_grid.columns = 2
	_grid.add_theme_constant_override("h_separation", 10)
	_grid.add_theme_constant_override("v_separation", 10)
	_body.add_child(_grid)
	_empty = SmaKit.muted(I18n.t("glossary.noResults"), 12)
	_empty.visible = false
	_body.add_child(_empty)
	_body.add_child(SmaKit.muted(I18n.t("glossary.disclaimer"), 10))
	_build_cards()


func _render_header(root: VBoxContainer) -> void:
	var header := SmaKit.hbox(10)
	var titles := SmaKit.vbox(2)
	titles.add_child(SmaKit.label(I18n.t("glossary.title"), 20))
	titles.add_child(SmaKit.muted(I18n.t("glossary.subtitle", {"count": _terms.size()}), 12))
	header.add_child(titles)
	header.add_child(SmaKit.hspacer())
	header.add_child(SmaKit.button(I18n.t("nav.academy"), _go_academy))
	root.add_child(header)


func _go_academy() -> void:
	var main := get_tree().get_first_node_in_group("main")
	if main != null and main.has_method("navigate"):
		main.navigate("academy")


func _build_cards() -> void:
	SmaKit.clear_children(_grid)
	for term in _terms:
		var card := SmaKit.card(11)
		var box := SmaKit.vbox(4)
		card.add_child(box)
		var term_id := String(term["id"])
		var head := SmaKit.hbox(8)
		var names := SmaKit.vbox(0)
		names.add_child(SmaKit.label(I18n.t("glossary.terms.%s.name" % term_id), 14))
		head.add_child(names)
		head.add_child(SmaKit.hspacer())
		head.add_child(SmaKit.button(I18n.t("glossary.open"),
			_open_term.bind(term_id)))
		box.add_child(head)
		var definition := I18n.t("glossary.terms.%s.def" % term_id)
		var definition_label := SmaKit.muted(definition, 11)
		definition_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		box.add_child(definition_label)
		var example := I18n.t("glossary.terms.%s.example" % term_id)
		if example != "" and not example.begins_with("glossary."):
			var example_label := SmaKit.muted(I18n.t("glossary.example") + ": " + example, 10)
			example_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			box.add_child(example_label)
		card.set_meta("search", (I18n.t("glossary.terms.%s.name" % term_id) + " "
			+ definition).to_lower())
		_grid.add_child(card)


func _apply_filter() -> void:
	var query := _search.text.strip_edges().to_lower()
	var visible := 0
	for card in _grid.get_children():
		var matches: bool = query == "" or String(card.get_meta("search", "")).contains(query)
		card.visible = matches
		if matches:
			visible += 1
	_empty.visible = visible == 0


func _open_term(term_id: String) -> void:
	var dialog := SmaGlossaryDialog.new()
	add_child(dialog)
	dialog.setup(game, term_id)
	dialog.closed.connect(func(): dialog.queue_free())


func refresh(_reason: String = "") -> void:
	pass
