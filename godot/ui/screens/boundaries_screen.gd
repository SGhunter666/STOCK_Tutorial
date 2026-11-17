## Explicit simulation boundaries: cash-settled futures, approximated early
## assignment and survivorship-biased historical samples.
class_name SmaBoundariesScreen
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
	_render_header()
	for boundary in ["futures", "options", "history"]:
		var card := SmaKit.card(12)
		var box := SmaKit.vbox(4)
		card.add_child(box)
		box.add_child(SmaKit.label(I18n.t("boundaries.%s.title" % boundary), 14))
		box.add_child(SmaKit.muted(I18n.t("boundaries.eyebrow"), 10))
		var text := SmaKit.label(I18n.t("boundaries.%s.body" % boundary), 12)
		text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		box.add_child(text)
		var detail := SmaKit.muted(I18n.t("boundaries.%s.detail" % boundary), 11)
		detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		box.add_child(detail)
		_body.add_child(card)
	_body.add_child(SmaKit.muted(I18n.t("boundaries.note"), 10))


func _render_header() -> void:
	var header := SmaKit.hbox(10)
	var titles := SmaKit.vbox(2)
	titles.add_child(SmaKit.label(I18n.t("boundaries.title"), 20))
	var subtitle := SmaKit.muted(I18n.t("boundaries.subtitle"), 12)
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	titles.add_child(subtitle)
	header.add_child(titles)
	header.add_child(SmaKit.hspacer())
	header.add_child(SmaKit.button(I18n.t("boundaries.back"), _back))
	_body.add_child(header)


func _back() -> void:
	var main := get_tree().get_first_node_in_group("main")
	if main != null and main.has_method("navigate"):
		main.navigate("settings")
