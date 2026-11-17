## Minimal payoff curve used by the option strategy demo. Dependency-free:
## draws a zero line, the P&L polyline and a few labels.
class_name SmaPayoffChart
extends Control

var values: Array = []
var low_text := ""
var high_text := ""


func _init() -> void:
	custom_minimum_size = Vector2(320, 160)
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func set_values(next_values: Array, next_low: String, next_high: String) -> void:
	values = next_values
	low_text = next_low
	high_text = next_high
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), SmaUiTheme.BG_DEEP)
	if values.size() < 2:
		return
	var font := get_theme_default_font()
	var left := 62.0
	var right := size.x - 16.0
	var top := 12.0
	var bottom := size.y - 24.0
	if right <= left or bottom <= top:
		return
	var low := 0.0
	var high := 0.0
	for value in values:
		low = minf(low, float(value))
		high = maxf(high, float(value))
	if high - low < 0.01:
		high += 0.5
		low -= 0.5
	var padding := (high - low) * 0.08
	high += padding
	low -= padding
	var zero_y := _y_for(0.0, low, high, top, bottom)
	draw_line(Vector2(left, zero_y), Vector2(right, zero_y),
		Color(SmaUiTheme.BORDER.r, SmaUiTheme.BORDER.g, SmaUiTheme.BORDER.b, 0.9), 1.0)
	var points := PackedVector2Array()
	for index in values.size():
		var x := lerpf(left, right, float(index) / float(values.size() - 1))
		points.append(Vector2(x, _y_for(float(values[index]), low, high, top, bottom)))
	draw_polyline(points, SmaUiTheme.ACCENT, 2.0, true)
	draw_string(font, Vector2(6, top + 4), SmaFormat.money(high),
		HORIZONTAL_ALIGNMENT_LEFT, -1, 10, SmaUiTheme.DIM)
	draw_string(font, Vector2(6, bottom + 4), SmaFormat.money(low),
		HORIZONTAL_ALIGNMENT_LEFT, -1, 10, SmaUiTheme.DIM)
	draw_string(font, Vector2(left, size.y - 6), low_text,
		HORIZONTAL_ALIGNMENT_LEFT, -1, 10, SmaUiTheme.DIM)
	draw_string(font, Vector2(left, size.y - 6), high_text,
		HORIZONTAL_ALIGNMENT_RIGHT, right - left, 10, SmaUiTheme.DIM)


func _y_for(value: float, low: float, high: float, top: float, bottom: float) -> float:
	return bottom - (value - low) / (high - low) * (bottom - top)
