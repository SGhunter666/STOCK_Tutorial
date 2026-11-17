## Central visual language. Every screen pulls colors, spacing and control styles
## from here so the UI cannot drift into per-screen one-off styling.
class_name SmaUiTheme
extends RefCounted

const CARD_RADIUS := 10
const GAP := 10

## Palette values are runtime variables so the whole UI can switch between the
## dark terminal look and the light daytime look without per-screen overrides.
static var BG := Color("#0a1220")
static var BG_DEEP := Color("#070d18")
static var PANEL := Color("#111d2e")
static var PANEL_ALT := Color("#16263a")
static var PANEL_HOVER := Color("#1b3049")
static var BORDER := Color("#22384f")
static var TEXT := Color("#e7f1f8")
static var MUTED := Color("#89a3ba")
static var DIM := Color("#5c7488")
static var ACCENT := Color("#5eead4")
static var ACCENT_DARK := Color("#0f766e")
static var POSITIVE := Color("#4ade80")
static var NEGATIVE := Color("#f87171")
static var WARNING := Color("#fbbf24")
static var INFO := Color("#60a5fa")
static var mode := "dark"

## Layout density: 1.0 for the beginner layout, a compact factor for advanced.
static var density := 1.0


static func set_density(value: float) -> void:
	density = clampf(value, 0.82, 1.0)


static func set_theme_mode(value: String) -> void:
	mode = value if ["dark", "light"].has(value) else "dark"
	if mode == "light":
		BG = Color("#f2f6fa")
		BG_DEEP = Color("#ffffff")
		PANEL = Color("#ffffff")
		PANEL_ALT = Color("#eef3f8")
		PANEL_HOVER = Color("#e2eaf2")
		BORDER = Color("#cfdae5")
		TEXT = Color("#16202c")
		MUTED = Color("#536475")
		DIM = Color("#7b8b9c")
		ACCENT = Color("#0d9488")
		ACCENT_DARK = Color("#0f766e")
		POSITIVE = Color("#15803d")
		NEGATIVE = Color("#dc2626")
		WARNING = Color("#b45309")
		INFO = Color("#1d4ed8")
	else:
		BG = Color("#0a1220")
		BG_DEEP = Color("#070d18")
		PANEL = Color("#111d2e")
		PANEL_ALT = Color("#16263a")
		PANEL_HOVER = Color("#1b3049")
		BORDER = Color("#22384f")
		TEXT = Color("#e7f1f8")
		MUTED = Color("#89a3ba")
		DIM = Color("#5c7488")
		ACCENT = Color("#5eead4")
		ACCENT_DARK = Color("#0f766e")
		POSITIVE = Color("#4ade80")
		NEGATIVE = Color("#f87171")
		WARNING = Color("#fbbf24")
		INFO = Color("#60a5fa")


static func _box(color: Color, border_color: Color = Color(0, 0, 0, 0),
		radius: int = CARD_RADIUS, margin: int = 10) -> StyleBoxFlat:
	if border_color.a <= 0.0:
		border_color = BORDER
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = border_color
	style.set_border_width_all(1)
	style.set_corner_radius_all(radius)
	style.set_content_margin_all(margin)
	return style


static func build() -> Theme:
	var theme := Theme.new()
	var fallback := SystemFont.new()
	fallback.font_names = PackedStringArray([
		"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
		"Noto Sans CJK SC", "Source Han Sans SC", "Arial Unicode MS", "sans-serif",
	])
	fallback.allow_system_fallback = true
	fallback.antialiasing = TextServer.FONT_ANTIALIASING_GRAY
	var font: Font = fallback
	# macOS may resolve SystemFont("PingFang SC") to PingFang HK, which lacks
	# simplified glyphs such as 远. Load a Simplified-capable system face first.
	if OS.get_name() == "macOS":
		for candidate in ["/System/Library/Fonts/STHeiti Light.ttc",
				"/System/Library/Fonts/STHeiti Medium.ttc",
				"/System/Library/Fonts/Supplemental/Songti.ttc"]:
			var file := FontFile.new()
			var err := file.load_dynamic_font(candidate)
			if err == OK and file.get_font_name() != "" and file.has_char(0x8FDC):
				file.fallbacks.append(fallback)
				font = file
				break
	theme.default_font = font
	theme.default_font_size = 13

	theme.set_color("font_color", "Label", TEXT)
	theme.set_color("font_shadow_color", "Label", Color(0, 0, 0, 0))

	theme.set_stylebox("panel", "PanelContainer", _box(PANEL))
	theme.set_stylebox("panel", "Panel", _box(PANEL))

	theme.set_stylebox("normal", "Button", _box(PANEL_ALT, BORDER, 8, 9))
	theme.set_stylebox("hover", "Button", _box(PANEL_HOVER, ACCENT_DARK, 8, 9))
	theme.set_stylebox("pressed", "Button", _box(ACCENT_DARK, ACCENT, 8, 9))
	theme.set_stylebox("disabled", "Button", _box(PANEL, BORDER, 8, 9))
	theme.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	theme.set_color("font_color", "Button", TEXT)
	theme.set_color("font_hover_color", "Button", Color.WHITE)
	theme.set_color("font_pressed_color", "Button", Color.WHITE)
	theme.set_color("font_disabled_color", "Button", DIM)
	theme.set_font_size("font_size", "Button", 13)

	theme.set_stylebox("normal", "LineEdit", _box(BG_DEEP, BORDER, 8, 8))
	theme.set_stylebox("focus", "LineEdit", _box(BG_DEEP, ACCENT_DARK, 8, 8))
	theme.set_color("font_color", "LineEdit", TEXT)
	theme.set_color("font_placeholder_color", "LineEdit", DIM)
	theme.set_font_size("font_size", "LineEdit", 13)

	theme.set_stylebox("normal", "OptionButton", _box(PANEL_ALT, BORDER, 8, 8))
	theme.set_stylebox("hover", "OptionButton", _box(PANEL_HOVER, ACCENT_DARK, 8, 8))
	theme.set_stylebox("pressed", "OptionButton", _box(ACCENT_DARK, ACCENT, 8, 8))
	theme.set_stylebox("focus", "OptionButton", StyleBoxEmpty.new())
	theme.set_color("font_color", "OptionButton", TEXT)
	theme.set_font_size("font_size", "OptionButton", 13)

	theme.set_stylebox("panel", "PopupMenu", _box(PANEL_ALT, BORDER, 8, 6))
	theme.set_color("font_color", "PopupMenu", TEXT)
	theme.set_color("font_hover_color", "PopupMenu", Color.WHITE)
	theme.set_font_size("font_size", "PopupMenu", 13)

	theme.set_stylebox("scroll", "VScrollBar", _box(BG_DEEP, BORDER, 6, 0))
	theme.set_stylebox("grabber", "VScrollBar", _box(PANEL_HOVER, BORDER, 6, 0))
	theme.set_stylebox("grabber_highlight", "VScrollBar", _box(ACCENT_DARK, BORDER, 6, 0))
	theme.set_stylebox("grabber_pressed", "VScrollBar", _box(ACCENT_DARK, ACCENT, 6, 0))

	theme.set_stylebox("normal", "SpinBox", _box(BG_DEEP, BORDER, 8, 6))
	theme.set_color("font_color", "SpinBox", TEXT)

	theme.set_color("font_color", "CheckBox", TEXT)
	theme.set_color("font_pressed_color", "CheckBox", ACCENT)
	theme.set_font_size("font_size", "CheckBox", 13)

	return theme
