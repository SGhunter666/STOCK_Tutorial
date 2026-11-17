## Small UI factory used by every screen. These helpers exist to keep screens
## focused on layout and state, not on repeating Control boilerplate.
class_name SmaKit
extends RefCounted


static func label(text: String, size: int = 13,
		color: Color = Color(0, 0, 0, 0)) -> Label:
	var node := Label.new()
	node.text = text
	node.add_theme_font_size_override("font_size",
		maxi(9, int(round(float(size) * SmaUiTheme.density))))
	node.add_theme_color_override("font_color",
		SmaUiTheme.TEXT if color.a <= 0.0 else color)
	return node


static func muted(text: String, size: int = 12) -> Label:
	return label(text, size, SmaUiTheme.MUTED)


static func title(text: String, size: int = 20) -> Label:
	return label(text, size, SmaUiTheme.TEXT)


static func caption(text: String) -> Label:
	var node := label(text, 11, SmaUiTheme.DIM)
	return node


static func card(margin: int = 12) -> PanelContainer:
	var panel := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = SmaUiTheme.PANEL
	style.border_color = SmaUiTheme.BORDER
	style.set_border_width_all(1)
	style.set_corner_radius_all(SmaUiTheme.CARD_RADIUS)
	style.set_content_margin_all(maxi(5, int(round(float(margin) * SmaUiTheme.density))))
	panel.add_theme_stylebox_override("panel", style)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return panel


static func vbox(separation: int = SmaUiTheme.GAP) -> VBoxContainer:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation",
		maxi(1, int(round(float(separation) * SmaUiTheme.density))))
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return box


static func hbox(separation: int = SmaUiTheme.GAP) -> HBoxContainer:
	var box := HBoxContainer.new()
	box.add_theme_constant_override("separation",
		maxi(1, int(round(float(separation) * SmaUiTheme.density))))
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return box


static func button(text: String, callback: Callable = Callable(), primary: bool = false) -> Button:
	var node := Button.new()
	node.text = text
	node.focus_mode = Control.FOCUS_NONE
	node.add_theme_font_size_override("font_size",
		maxi(9, int(round(12.0 * SmaUiTheme.density))))
	if primary:
		var normal := StyleBoxFlat.new()
		normal.bg_color = SmaUiTheme.ACCENT_DARK
		normal.border_color = SmaUiTheme.ACCENT
		normal.set_border_width_all(1)
		normal.set_corner_radius_all(8)
		normal.set_content_margin_all(9)
		node.add_theme_stylebox_override("normal", normal)
		var hover := normal.duplicate() as StyleBoxFlat
		hover.bg_color = SmaUiTheme.ACCENT
		hover.border_color = SmaUiTheme.ACCENT
		node.add_theme_stylebox_override("hover", hover)
		node.add_theme_color_override("font_color", SmaUiTheme.BG_DEEP)
		node.add_theme_color_override("font_hover_color", SmaUiTheme.BG_DEEP)
		node.add_theme_color_override("font_pressed_color", SmaUiTheme.BG_DEEP)
	if callback.is_valid():
		node.pressed.connect(callback)
	return node


static func toggle(text: String, group: ButtonGroup = null) -> Button:
	var node := button(text)
	node.toggle_mode = true
	node.button_group = group
	return node


static func cell(text: String, ratio: float = 1.0, align: HorizontalAlignment = HORIZONTAL_ALIGNMENT_LEFT,
		color: Color = Color(0, 0, 0, 0), size: int = 12) -> Label:
	var node := label(text, size, color)
	node.horizontal_alignment = align
	node.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	node.size_flags_stretch_ratio = ratio
	node.clip_text = true
	node.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return node


static func header_row(columns: Array, ratios: Array, aligns: Array = []) -> HBoxContainer:
	var row := hbox(8)
	row.add_theme_constant_override("separation", 8)
	for index in columns.size():
		var align: HorizontalAlignment = HORIZONTAL_ALIGNMENT_LEFT
		if index < aligns.size():
			align = aligns[index]
		var text := I18n.t(String(columns[index]))
		row.add_child(cell(text, float(ratios[index]), align, SmaUiTheme.DIM, 11))
	return row


static func data_row(values: Array, ratios: Array, colors: Array = [], aligns: Array = []) -> HBoxContainer:
	var row := hbox(8)
	for index in values.size():
		var color := SmaUiTheme.TEXT
		if index < colors.size():
			color = colors[index]
		var align: HorizontalAlignment = HORIZONTAL_ALIGNMENT_LEFT
		if index < aligns.size():
			align = aligns[index]
		row.add_child(cell(String(values[index]), float(ratios[index]), align, color, 12))
	return row


static func separator() -> HSeparator:
	var line := HSeparator.new()
	var style := StyleBoxFlat.new()
	style.bg_color = SmaUiTheme.BORDER
	style.content_margin_top = 1
	style.content_margin_bottom = 1
	line.add_theme_stylebox_override("separator", style)
	return line


static func spacer(height: float = 0.0, expand: bool = false) -> Control:
	var node := Control.new()
	if height > 0.0:
		node.custom_minimum_size.y = height
	if expand:
		node.size_flags_vertical = Control.SIZE_EXPAND_FILL
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return node


## Horizontal spring for HBox rows. Kept separate from spacer() so vertical and
## horizontal layouts cannot silently steal each other's expansion.
static func hspacer() -> Control:
	var node := Control.new()
	node.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return node


static func clear_children(node: Node) -> void:
	for child in node.get_children():
		node.remove_child(child)
		child.queue_free()


static func scroll(height: float = 0.0) -> ScrollContainer:
	var node := ScrollContainer.new()
	node.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	node.size_flags_vertical = Control.SIZE_EXPAND_FILL
	if height > 0.0:
		node.custom_minimum_size.y = height
	return node


static func value_color(value: float) -> Color:
	if value > 0.0:
		return SmaUiTheme.POSITIVE
	if value < 0.0:
		return SmaUiTheme.NEGATIVE
	return SmaUiTheme.MUTED


static func sector_label(sector: String) -> String:
	var key := "sector.%s" % sector
	if I18n.has_key(key):
		return I18n.t(key)
	return sector.capitalize()


static func liquidity_label(liquidity: String) -> String:
	var key := "liquidity.%s" % liquidity
	if I18n.has_key(key):
		return I18n.t(key)
	return liquidity.capitalize()


static func style_label(style: String) -> String:
	var key := "style.%s" % style
	if I18n.has_key(key):
		return I18n.t(key)
	return style.capitalize()
