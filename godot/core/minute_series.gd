## One-minute OHLCV aggregation. Bars only contain real simulated trades; missing
## minutes are never filled with invented volume, and no future bar is exposed.
class_name SmaMinuteSeries
extends RefCounted

const SESSION_MINUTES := 390
const INTRADAY_TIMEFRAMES := ["1m", "5m", "15m", "30m", "1h", "4h"]
const ALL_TIMEFRAMES := ["1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W", "1M"]
const _TIMEFRAME_MINUTES := {"5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240}


static func create() -> Dictionary:
	return {"intraday": [], "current": null, "daily": []}


static func minute_index_for_second(second: int) -> int:
	return clampi(int(floor(float(second) / 60.0)), 0, SESSION_MINUTES - 1)


static func _clock_text(minutes: int) -> String:
	return "%02d:%02d" % [int(minutes / 60.0), minutes % 60]


static func apply_trade(series: Dictionary, trade: Dictionary) -> Dictionary:
	var minute := minute_index_for_second(int(trade.get("second", 0)))
	var current: Variant = series.get("current", null)
	if current != null and int(current["minute"]) != minute:
		finalize_minute(series)
		current = null
	if current == null:
		var price := float(trade.get("price", 0.0))
		series["current"] = {
			"date": String(trade.get("date", "")),
			"minute": minute,
			"time": _clock_text(9 * 60 + 30 + minute),
			"o": price,
			"h": price,
			"l": price,
			"c": price,
			"v": int(trade.get("qty", 0)),
			"trades": 1,
			"finalized": false,
		}
		return series["current"]
	var bar: Dictionary = series["current"]
	var price := float(trade.get("price", 0.0))
	bar["h"] = maxf(float(bar["h"]), price)
	bar["l"] = minf(float(bar["l"]), price)
	bar["c"] = price
	bar["v"] = int(bar["v"]) + int(trade.get("qty", 0))
	bar["trades"] = int(bar["trades"]) + 1
	return bar


static func finalize_minute(series: Dictionary) -> Variant:
	var current: Variant = series.get("current", null)
	if current == null:
		return null
	var bar: Dictionary = current.duplicate(true)
	bar["finalized"] = true
	series["intraday"].append(bar)
	series["current"] = null
	return bar


static func finalize_day(series: Dictionary, date: String) -> Variant:
	finalize_minute(series)
	var bars: Array = series.get("intraday", [])
	if bars.is_empty():
		return null
	var high := -INF
	var low := INF
	var volume := 0
	var trades := 0
	for bar in bars:
		high = maxf(high, float(bar["h"]))
		low = minf(low, float(bar["l"]))
		volume += int(bar["v"])
		trades += int(bar.get("trades", 0))
	var daily := {
		"d": date,
		"end": date,
		"o": bars[0]["o"],
		"h": high,
		"l": low,
		"c": bars[bars.size() - 1]["c"],
		"v": volume,
		"trades": trades,
		"minutes": bars.size(),
		"finalized": true,
	}
	series["daily"].append(daily)
	if series["daily"].size() > 260:
		series["daily"] = series["daily"].slice(series["daily"].size() - 260)
	series["intraday"] = []
	series["current"] = null
	return daily


static func _base_candle(bar: Dictionary, extra: Dictionary = {}) -> Dictionary:
	var candle := {
		"d": String(bar.get("date", bar.get("d", ""))),
		"end": String(bar.get("date", bar.get("end", bar.get("d", "")))),
		"o": bar["o"], "h": bar["h"], "l": bar["l"], "c": bar["c"],
		"v": bar.get("v", 0), "trades": bar.get("trades", 0),
		"partial": not bool(bar.get("finalized", false)),
	}
	if bar.has("time"):
		candle["time"] = bar["time"]
	candle.merge(extra, true)
	return candle


static func _aggregate_intraday(bars: Array, size: int) -> Array:
	var groups := {}
	for bar in bars:
		var bucket := int(floor(float(bar["minute"]) / float(size))) * size
		var key := "%s|%d" % [bar["date"], bucket]
		if not groups.has(key):
			var group := _base_candle(bar)
			group["time"] = _clock_text(9 * 60 + 30 + bucket)
			group["bucket"] = bucket
			group["partial"] = not bool(bar.get("finalized", false))
			groups[key] = group
		else:
			var group: Dictionary = groups[key]
			group["h"] = maxf(float(group["h"]), float(bar["h"]))
			group["l"] = minf(float(group["l"]), float(bar["l"]))
			group["c"] = bar["c"]
			group["v"] = int(group["v"]) + int(bar.get("v", 0))
			group["trades"] = int(group.get("trades", 0)) + int(bar.get("trades", 0))
			group["partial"] = bool(group["partial"]) or not bool(bar.get("finalized", false))
	var result := groups.values()
	result.sort_custom(func(a, b): return int(a["bucket"]) < int(b["bucket"]))
	return result


static func _current_day_candle(series: Dictionary, date: String) -> Variant:
	var bars: Array = []
	bars.append_array(series.get("intraday", []))
	var current: Variant = series.get("current", null)
	if current != null:
		bars.append(current)
	if bars.is_empty():
		return null
	var high := -INF
	var low := INF
	var volume := 0
	var trades := 0
	for bar in bars:
		high = maxf(high, float(bar["h"]))
		low = minf(low, float(bar["l"]))
		volume += int(bar.get("v", 0))
		trades += int(bar.get("trades", 0))
	return {
		"d": date, "end": date, "o": bars[0]["o"], "h": high, "l": low,
		"c": bars[bars.size() - 1]["c"], "v": volume, "trades": trades,
		"minutes": bars.size(), "partial": true,
	}


static func _aggregate_daily(daily: Array, key_of: Callable) -> Array:
	var groups := {}
	var order: Array[String] = []
	for bar in daily:
		var key: String = key_of.call(String(bar["d"]))
		if not groups.has(key):
			groups[key] = {
				"d": bar["d"], "end": bar["d"], "o": bar["o"], "h": bar["h"],
				"l": bar["l"], "c": bar["c"], "v": bar["v"],
				"trades": bar.get("trades", 0), "partial": bool(bar.get("partial", false)),
			}
			order.append(key)
		else:
			var group: Dictionary = groups[key]
			group["end"] = bar["d"]
			group["h"] = maxf(float(group["h"]), float(bar["h"]))
			group["l"] = minf(float(group["l"]), float(bar["l"]))
			group["c"] = bar["c"]
			group["v"] = int(group["v"]) + int(bar.get("v", 0))
			group["trades"] = int(group.get("trades", 0)) + int(bar.get("trades", 0))
			group["partial"] = bool(group["partial"]) or bool(bar.get("partial", false))
	var result := []
	for key in order:
		result.append(groups[key])
	return result


static func candles(series: Dictionary, timeframe: String, date: String) -> Array:
	var bars: Array = []
	bars.append_array(series.get("intraday", []))
	var current: Variant = series.get("current", null)
	if current != null:
		bars.append(current)
	if timeframe == "1m":
		return bars.map(func(bar): return _base_candle(bar))
	if INTRADAY_TIMEFRAMES.has(timeframe):
		return _aggregate_intraday(bars, int(_TIMEFRAME_MINUTES[timeframe]))
	var daily: Array = series.get("daily", []).duplicate(true)
	var today: Variant = _current_day_candle(series, date)
	if today != null:
		var replaced := false
		for index in daily.size():
			if String(daily[index]["d"]) == date:
				daily[index] = today
				replaced = true
				break
		if not replaced:
			daily.append(today)
	if timeframe == "1D":
		return daily
	if timeframe == "1W":
		return _aggregate_daily(daily, func(day: String) -> String:
			var parsed := Time.get_datetime_dict_from_datetime_string(day + "T00:00:00", true)
			var weekday := int(parsed["weekday"])
			var offset := (weekday + 6) % 7
			var unix := Time.get_unix_time_from_datetime_dict(parsed) - offset * 86400
			return Time.get_datetime_string_from_unix_time(unix).substr(0, 10))
	if timeframe == "1M":
		return _aggregate_daily(daily, func(day: String) -> String: return day.substr(0, 7))
	return []
