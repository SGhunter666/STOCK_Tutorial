## Single-candle illustration used by the K-line teaching demo. Draws the wick,
## body and the four OHLC labels so learners can connect the numbers to the shape.
class_name SmaCandleIllustration
extends Control

var open_price := 0.0
var high_price := 0.0
var low_price := 0.0
var close_price := 0.0


func _init() -> void:
	custom_minimum_size = Vector2(420, 230)
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func set_data(open_value: float, high_value: float, low_value: float, close_value: float) -> void:
	open_price = open_value
	high_price = high_value
	low_price = low_value
	close_price = close_value
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), SmaUiTheme.BG_DEEP)
	var left := 40.0
	var right := size.x - 120.0
	var top := 20.0
	var bottom := size.y - 24.0
	if right <= left or bottom <= top:
		return
	var low := minf(low_price, open_price)
	low = minf(low, close_price)
	var high := maxf(high_price, open_price)
	high = maxf(high, close_price)
	if high - low < 0.01:
		high += 0.5
		low -= 0.5
	var center_x := (left + right) * 0.5
	var color := SmaUiTheme.POSITIVE if close_price >= open_price else SmaUiTheme.NEGATIVE
	var y_high := _y(high_price, low, high, top, bottom)
	var y_low := _y(low_price, low, high, top, bottom)
	var y_open := _y(open_price, low, high, top, bottom)
	var y_close := _y(close_price, low, high, top, bottom)
	draw_line(Vector2(center_x, y_high), Vector2(center_x, y_low), color, 2.0)
	var body_width := 46.0
	var body_top := minf(y_open, y_close)
	var body_height := maxf(3.0, absf(y_open - y_close))
	draw_rect(Rect2(center_x - body_width * 0.5, body_top, body_width, body_height), color)
	var font := get_theme_default_font()
	var labels := [
		["O", open_price, y_open, SmaUiTheme.MUTED],
		["H", high_price, y_high, SmaUiTheme.POSITIVE],
		["L", low_price, y_low, SmaUiTheme.NEGATIVE],
		["C", close_price, y_close, SmaUiTheme.TEXT],
	]
	labels.sort_custom(func(a, b): return float(a[2]) < float(b[2]))
	var last_label_y := -100.0
	for entry in labels:
		var lane_y: float = entry[2]
		var lane_color: Color = entry[3]
		draw_line(Vector2(left, lane_y), Vector2(right, lane_y),
			Color(lane_color.r, lane_color.g, lane_color.b, 0.35), 1.0)
		var label_y := maxf(lane_y, last_label_y + 14.0)
		label_y = minf(label_y, size.y - 6.0)
		last_label_y = label_y
		var text := "%s  %s" % [entry[0], SmaFormat.money(float(entry[1]))]
		draw_string(font, Vector2(right + 8, label_y + 4), text,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 11, lane_color)


func _y(price: float, low: float, high: float, top: float, bottom: float) -> float:
	return lerpf(bottom, top, (price - low) / maxf(0.0001, high - low))
