## Roadmap: honest phase-by-phase status of the project.
class_name SmaRoadmapScreen
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
	_body = SmaKit.vbox(10)
	scroll.add_child(_body)


func refresh(_reason: String = "") -> void:
	if not built:
		return
	SmaKit.clear_children(_body)
	var header := SmaKit.hbox(10)
	var titles := SmaKit.vbox(2)
	titles.add_child(SmaKit.label(I18n.t("roadmap.title"), 20))
	titles.add_child(SmaKit.muted(I18n.t("roadmap.subtitle"), 12))
	header.add_child(titles)
	header.add_child(SmaKit.hspacer())
	header.add_child(SmaKit.button(I18n.t("nav.academy"), _go_academy))
	_body.add_child(header)
	for phase in range(1, 15):
		var card := SmaKit.card(11)
		var box := SmaKit.vbox(4)
		card.add_child(box)
		var head := SmaKit.hbox(8)
		head.add_child(SmaKit.label("%d" % phase, 14, SmaUiTheme.ACCENT))
		head.add_child(SmaKit.label(I18n.t("roadmap.p%d.title" % phase), 14))
		head.add_child(SmaKit.hspacer())
		head.add_child(SmaKit.label(I18n.t("roadmap.statusShipped"), 10,
			SmaUiTheme.POSITIVE))
		box.add_child(head)
		var text := SmaKit.muted(I18n.t("roadmap.p%d.text" % phase), 11)
		text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		box.add_child(text)
		var items: Array = []
		for item in range(1, 6):
			var key := "roadmap.p%d.i%d" % [phase, item]
			if I18n.has_key(key):
				items.append("✓ " + I18n.t(key))
		if not items.is_empty():
			box.add_child(SmaKit.muted("\n".join(items), 10))
		_body.add_child(card)
	_body.add_child(SmaKit.muted(I18n.t("roadmap.note"), 10))


func _go_academy() -> void:
	var main := get_tree().get_first_node_in_group("main")
	if main != null and main.has_method("navigate"):
		main.navigate("academy")
