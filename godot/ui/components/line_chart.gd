## Minimal dependency-free line chart for NAV curves and backtest equity. It
## draws a framed plot, four horizontal grid lines, the series and min/max
## labels; screens own the data and the surrounding card.
class_name SmaLineChart
extends Control

var values: Array = []
var color := SmaUiTheme.ACCENT
var format_mode := "money"
var start_label := ""
var end_label := ""


func _init() -> void:
	custom_minimum_size = Vector2(320, 180)
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func set_series(next_values: Array, next_color: Color = Color(0, 0, 0, 0),
		next_format: String = "money", next_start: String = "",
		next_end: String = "") -> void:
	values = next_values
	color = SmaUiTheme.ACCENT if next_color.a <= 0.0 else next_color
	format_mode = next_format
	start_label = next_start
	end_label = next_end
	queue_redraw()


func _format(value: float) -> String:
	if format_mode == "pct":
		return SmaFormat.pct(value, 1)
	if format_mode == "number":
		return SmaFormat.num(value, 2)
	return SmaFormat.compact(value)


## Axis labels must stay distinguishable when the series moves inside a narrow
## range that compact formatting would round to the same text.
func _format_axis(value: float, other: float) -> String:
	if format_mode != "money":
		return _format(value)
	for digits in range(1, 5):
		var text := _compact_digits(value, digits)
		if text != _compact_digits(other, digits):
			return text
	return _format(value)


func _compact_digits(value: float, digits: int) -> String:
	var absolute := absf(value)
	if absolute >= 1_000_000_000.0:
		return SmaFormat.num(value / 1_000_000_000.0, digits) + "B"
	if absolute >= 1_000_000.0:
		return SmaFormat.num(value / 1_000_000.0, digits) + "M"
	if absolute >= 1_000.0:
		return SmaFormat.num(value / 1_000.0, digits) + "K"
	return SmaFormat.num(value, digits)


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), SmaUiTheme.BG_DEEP)
	if values.size() < 2:
		return
	var font := get_theme_default_font()
	var left := 64.0
	var right := size.x - 14.0
	var top := 12.0
	var bottom := size.y - 24.0
	if right <= left or bottom <= top:
		return
	var low := INF
	var high := -INF
	for value in values:
		low = minf(low, float(value))
		high = maxf(high, float(value))
	if high - low < 0.001:
		var pad := maxf(0.01, absf(high) * 0.01)
		high += pad
		low = maxf(0.0, low - pad)
	var padding := (high - low) * 0.08
	high += padding
	low -= padding
	for step in 4:
		var ratio := float(step) / 3.0
		var y := lerpf(top, bottom, ratio)
		draw_line(Vector2(left, y), Vector2(right, y),
			Color(SmaUiTheme.BORDER.r, SmaUiTheme.BORDER.g, SmaUiTheme.BORDER.b, 0.55), 1.0)
	var points := PackedVector2Array()
	for index in values.size():
		var x := lerpf(left, right, float(index) / float(values.size() - 1))
		var y := bottom - (float(values[index]) - low) / (high - low) * (bottom - top)
		points.append(Vector2(x, y))
	draw_polyline(points, color, 2.0, true)
	draw_string(font, Vector2(4, top + 4), _format_axis(high, low),
		HORIZONTAL_ALIGNMENT_LEFT, -1, 9, SmaUiTheme.DIM)
	draw_string(font, Vector2(4, bottom + 4), _format_axis(low, high),
		HORIZONTAL_ALIGNMENT_LEFT, -1, 9, SmaUiTheme.DIM)
	if start_label != "":
		draw_string(font, Vector2(left, size.y - 6), start_label,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 9, SmaUiTheme.DIM)
	if end_label != "":
		draw_string(font, Vector2(left, size.y - 6), end_label,
			HORIZONTAL_ALIGNMENT_RIGHT, right - left, 9, SmaUiTheme.DIM)
