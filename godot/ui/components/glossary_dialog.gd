## Glossary modal: searchable terms with definitions, examples and related links.
## Opening a term is recorded by Game so glossary achievements remain honest.
class_name SmaGlossaryDialog
extends Control

signal closed

var game: Node
var _terms: Array = []
var _selected_id := ""
var _search: LineEdit
var _list: VBoxContainer
var _detail: VBoxContainer


func setup(game_ref: Node, initial_term_id: String = "") -> void:
	game = game_ref
	_terms = SmaAcademy.catalog().get("glossary", [])
	_selected_id = initial_term_id
	if _selected_id == "" and not _terms.is_empty():
		_selected_id = String(_terms[0]["id"])
	_build()
	_refresh_list()
	_render_detail()


func _build() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	z_index = 56
	var dim := ColorRect.new()
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.color = Color(0.02, 0.04, 0.07, 0.82)
	add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)
	var panel := SmaKit.card(20)
	panel.custom_minimum_size = Vector2(920, 620)
	center.add_child(panel)
	var root := SmaKit.vbox(10)
	panel.add_child(root)
	var header := SmaKit.hbox(10)
	header.add_child(SmaKit.label(I18n.t("glossary.title"), 20))
	header.add_child(SmaKit.muted(I18n.t("glossary.subtitle", {"count": _terms.size()}), 12))
	header.add_child(SmaKit.hspacer())
	header.add_child(SmaKit.button(I18n.t("common.close"), _close))
	root.add_child(header)
	_search = LineEdit.new()
	_search.placeholder_text = I18n.t("glossary.searchPlaceholder")
	_search.text_changed.connect(func(_text): _refresh_list())
	root.add_child(_search)
	var body := SmaKit.hbox(12)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(body)
	var list_card := SmaKit.card(8)
	list_card.custom_minimum_size.x = 280
	var list_scroll := SmaKit.scroll(460)
	_list = SmaKit.vbox(2)
	list_scroll.add_child(_list)
	list_card.add_child(list_scroll)
	body.add_child(list_card)
	var detail_card := SmaKit.card(14)
	var detail_scroll := SmaKit.scroll(460)
	_detail = SmaKit.vbox(10)
	detail_scroll.add_child(_detail)
	detail_card.add_child(detail_scroll)
	body.add_child(detail_card)
	root.add_child(SmaKit.caption(I18n.t("glossary.disclaimer")))


func _refresh_list() -> void:
	SmaKit.clear_children(_list)
	var query := _search.text.strip_edges().to_lower() if _search != null else ""
	var visible := 0
	for term in _terms:
		var term_id := String(term["id"])
		var name := I18n.t("glossary.terms.%s.name" % term_id)
		var definition := I18n.t("glossary.terms.%s.def" % term_id)
		if query != "" and not name.to_lower().contains(query) \
				and not definition.to_lower().contains(query) and not term_id.to_lower().contains(query):
			continue
		visible += 1
		var button := SmaKit.button(name, _select_term.bind(term_id))
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.custom_minimum_size.y = 30
		button.add_theme_font_size_override("font_size", 12)
		if term_id == _selected_id:
			button.add_theme_color_override("font_color", SmaUiTheme.ACCENT)
		_list.add_child(button)
	if visible == 0:
		_list.add_child(SmaKit.muted(I18n.t("glossary.noResults")))


func _select_term(term_id: String) -> void:
	_selected_id = term_id
	game.academy_record_glossary(term_id)
	_refresh_list()
	_render_detail()


func _render_detail() -> void:
	SmaKit.clear_children(_detail)
	if _selected_id == "":
		return
	var term: Dictionary = {}
	for entry in _terms:
		if String(entry["id"]) == _selected_id:
			term = entry
			break
	if term.is_empty():
		return
	_detail.add_child(SmaKit.label(I18n.t("glossary.terms.%s.name" % _selected_id), 24))
	var unit_id := String(term.get("unitId", ""))
	if unit_id != "":
		var unit_title := I18n.t("curriculum.%s.title" % unit_id)
		_detail.add_child(SmaKit.caption(I18n.t("glossary.lesson", {"unit": unit_title})))
	_detail.add_child(SmaKit.separator())
	var definition := SmaKit.label(I18n.t("glossary.terms.%s.def" % _selected_id), 14)
	definition.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_detail.add_child(definition)
	var example_key := "glossary.terms.%s.example" % _selected_id
	if I18n.has_key(example_key):
		var example := SmaKit.card(10)
		var box := SmaKit.vbox(4)
		example.add_child(box)
		box.add_child(SmaKit.caption(I18n.t("glossary.example")))
		var example_text := SmaKit.label(I18n.t(example_key), 13, SmaUiTheme.MUTED)
		example_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		box.add_child(example_text)
		_detail.add_child(example)
	var related: Array = term.get("related", [])
	if not related.is_empty():
		_detail.add_child(SmaKit.caption(I18n.t("glossary.related")))
		var row := SmaKit.hbox(6)
		for related_id in related:
			var button := SmaKit.button(I18n.t("glossary.terms.%s.name" % String(related_id)),
				_select_term.bind(String(related_id)))
			button.add_theme_font_size_override("font_size", 11)
			row.add_child(button)
		_detail.add_child(row)


func _close() -> void:
	closed.emit()
	queue_free()
