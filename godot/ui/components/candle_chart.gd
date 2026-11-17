## Canvas candle + volume chart. Reads only already-finalized/visible candles;
## it never asks the engine for future data.
class_name SmaCandleChart
extends Control

var candles: Array = []
var title_text: String = ""
var timeframe: String = "1m"
var _font: Font
var _font_size := 10


func _init() -> void:
	custom_minimum_size = Vector2(320, 280)
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func set_candles(next_candles: Array, next_timeframe: String = "1m", next_title: String = "") -> void:
	candles = next_candles
	timeframe = next_timeframe
	title_text = next_title
	queue_redraw()


func _draw() -> void:
	_font = get_theme_default_font()
	_font_size = 10
	var rect := Rect2(Vector2.ZERO, size)
	draw_rect(rect, SmaUiTheme.BG_DEEP)
	if title_text != "":
		draw_string(_font, Vector2(12, 20), title_text,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 11, SmaUiTheme.MUTED)
	if candles.is_empty():
		draw_string(_font, Vector2(12, size.y * 0.5), I18n.t("chart.no_data"),
			HORIZONTAL_ALIGNMENT_LEFT, -1, 12, SmaUiTheme.DIM)
		return
	var visible := candles
	var limit := 70 if timeframe in ["1m", "5m", "15m", "30m", "1h", "4h"] else 60
	if visible.size() > limit:
		visible = visible.slice(visible.size() - limit)
	var left := 12.0
	var right := size.x - 74.0
	var top := 32.0
	var price_bottom := size.y - 64.0
	var volume_top := price_bottom + 12.0
	var volume_bottom := size.y - 18.0
	if right <= left or price_bottom <= top:
		return
	var low := INF
	var high := -INF
	var max_volume := 1.0
	for bar in visible:
		low = minf(low, float(bar["l"]))
		high = maxf(high, float(bar["h"]))
		max_volume = maxf(max_volume, float(bar.get("v", 0)))
	if high - low < 0.0001:
		high += 0.5
		low -= 0.5
	var padding := (high - low) * 0.08
	high += padding
	low -= padding

	# Horizontal grid + price labels.
	for step in 5:
		var t := float(step) / 4.0
		var y := lerpf(top, price_bottom, t)
		draw_line(Vector2(left, y), Vector2(right, y),
			Color(SmaUiTheme.BORDER.r, SmaUiTheme.BORDER.g, SmaUiTheme.BORDER.b, 0.55), 1.0)
		var price := lerpf(high, low, t)
		draw_string(_font, Vector2(right + 6, y + 3), SmaFormat.num(price, 2),
			HORIZONTAL_ALIGNMENT_LEFT, -1, _font_size, SmaUiTheme.DIM)

	var count := visible.size()
	var slot := (right - left) / float(count)
	var body_width := maxf(1.5, slot * 0.62)
	for index in count:
		var bar: Dictionary = visible[index]
		var open_price := float(bar["o"])
		var close_price := float(bar["c"])
		var high_price := float(bar["h"])
		var low_price := float(bar["l"])
		var x := left + slot * (float(index) + 0.5)
		var y_open := _price_y(open_price, low, high, top, price_bottom)
		var y_close := _price_y(close_price, low, high, top, price_bottom)
		var y_high := _price_y(high_price, low, high, top, price_bottom)
		var y_low := _price_y(low_price, low, high, top, price_bottom)
		var color := SmaUiTheme.POSITIVE if close_price >= open_price else SmaUiTheme.NEGATIVE
		draw_line(Vector2(x, y_high), Vector2(x, y_low), color, 1.0)
		var body_top := minf(y_open, y_close)
		var body_height := maxf(1.0, absf(y_close - y_open))
		draw_rect(Rect2(x - body_width * 0.5, body_top, body_width, body_height), color)
		var volume := float(bar.get("v", 0))
		var volume_height := (volume / max_volume) * maxf(2.0, volume_bottom - volume_top)
		draw_rect(Rect2(x - body_width * 0.5, volume_bottom - volume_height,
			body_width, volume_height), Color(color.r, color.g, color.b, 0.38))

	var last_price := float(visible[-1]["c"])
	var last_y := _price_y(last_price, low, high, top, price_bottom)
	draw_line(Vector2(left, last_y), Vector2(right, last_y),
		Color(SmaUiTheme.ACCENT.r, SmaUiTheme.ACCENT.g, SmaUiTheme.ACCENT.b, 0.6), 1.0)
	draw_string(_font, Vector2(right + 6, last_y + 3), SmaFormat.num(last_price, 2),
		HORIZONTAL_ALIGNMENT_LEFT, -1, _font_size, SmaUiTheme.ACCENT)

	var first: Dictionary = visible[0]
	var last: Dictionary = visible[-1]
	var first_label := _label_for(first)
	var last_label := _label_for(last)
	draw_string(_font, Vector2(left, size.y - 4), first_label,
		HORIZONTAL_ALIGNMENT_LEFT, -1, _font_size, SmaUiTheme.DIM)
	draw_string(_font, Vector2(right - 62, size.y - 4), last_label,
		HORIZONTAL_ALIGNMENT_LEFT, -1, _font_size, SmaUiTheme.DIM)
	if count > 2:
		var middle: Dictionary = visible[count / 2]
		draw_string(_font, Vector2(left + (right - left) * 0.5 - 24, size.y - 4),
			_label_for(middle), HORIZONTAL_ALIGNMENT_LEFT, -1, _font_size, SmaUiTheme.DIM)
	draw_string(_font, Vector2(left, volume_top - 2), I18n.t("trade.volume"),
		HORIZONTAL_ALIGNMENT_LEFT, -1, 9, SmaUiTheme.DIM)


func _price_y(price: float, low: float, high: float, top: float, bottom: float) -> float:
	var t := (price - low) / maxf(0.000001, high - low)
	return lerpf(bottom, top, t)


func _label_for(bar: Dictionary) -> String:
	if timeframe in ["1D", "1W", "1M", "1d", "1w", "1mo", "1y"]:
		var day_text := String(bar.get("d", ""))
		return day_text.substr(5) if day_text.length() >= 10 else day_text
	return String(bar.get("time", ""))
