## Historical replay lab: real adjusted daily bars expanded into eight intraday
## ticks, with an account fully isolated from the academy simulation. Only data
## up to the current day/tick is ever exposed.
class_name SmaHistoryService
extends RefCounted

const CATALOG_PATH := "res://data/history/catalog.json"
const DATASET_DIR := "res://data/history"
const TICKS_PER_DAY := 8
const INTRADAY_5M_BARS := 78
const MINUTES_PER_BAR := 5
const VOLUME_WEIGHTS := [0.18, 0.12, 0.10, 0.08, 0.09, 0.11, 0.14, 0.18]

var catalog: Dictionary = {}
var _datasets: Dictionary = {}
var runs: Dictionary = {}


func _init() -> void:
	load_catalog()


func load_catalog() -> bool:
	var file := FileAccess.open(CATALOG_PATH, FileAccess.READ)
	if file == null:
		push_error("SmaHistory: missing catalog %s" % CATALOG_PATH)
		return false
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("SmaHistory: malformed catalog")
		return false
	catalog = parsed
	return true


func scenarios() -> Array:
	return catalog.get("scenarios", [])


func scenario(scenario_id: String) -> Dictionary:
	for entry in scenarios():
		if String(entry.get("id", "")) == scenario_id:
			return entry
	return {}


func load_dataset(scenario_id: String) -> Dictionary:
	if _datasets.has(scenario_id):
		return _datasets[scenario_id]
	var entry := scenario(scenario_id)
	if entry.is_empty():
		return {}
	var path := "%s/%s.json" % [DATASET_DIR, scenario_id]
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_error("SmaHistory: cannot open %s" % path)
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY or not parsed.has("tickers"):
		push_error("SmaHistory: malformed dataset %s" % path)
		return {}
	_datasets[scenario_id] = parsed
	return parsed


func dataset_loaded(scenario_id: String) -> bool:
	return _datasets.has(scenario_id)


func create_run(scenario_id: String, start_cash: float = -1.0) -> Dictionary:
	var cash := start_cash
	if cash < 0.0:
		cash = float(catalog.get("startCash", 10000))
	var dataset := load_dataset(scenario_id)
	var max_index := bar_count(dataset) - 1
	var warmup := mini(int(catalog.get("warmupDays", 20)), maxi(0, max_index))
	return {
		"scenarioId": scenario_id,
		"dayIndex": warmup,
		"startIndex": warmup,
		"tick": 0,
		"selectedTicker": "",
		"account": _create_account(cash),
		"equityHistory": [{"day": warmup, "equity": cash}],
	}


func ensure_run(scenario_id: String, dataset: Dictionary) -> Dictionary:
	if not runs.has(scenario_id):
		runs[scenario_id] = create_run(scenario_id)
	var run: Dictionary = runs[scenario_id]
	var max_index := maxi(0, bar_count(dataset) - 1)
	run["dayIndex"] = clampi(int(run.get("dayIndex", 0)), 0, max_index)
	run["startIndex"] = clampi(int(run.get("startIndex", 0)), 0, int(run["dayIndex"]))
	run["tick"] = clampi(int(run.get("tick", 0)), 0, TICKS_PER_DAY - 1)
	run["account"] = _normalize_account(run.get("account", {}))
	if not run.has("equityHistory"):
		run["equityHistory"] = [{"day": int(run["startIndex"]),
			"equity": float(run["account"]["initialCash"])}]
	return run


func reset_run(scenario_id: String) -> Dictionary:
	runs[scenario_id] = create_run(scenario_id)
	return runs[scenario_id]


func run(scenario_id: String) -> Dictionary:
	return runs.get(scenario_id, {})


func _create_account(cash: float) -> Dictionary:
	return {"cash": cash, "initialCash": cash, "positions": {}, "trades": [],
		"realizedPnl": 0.0, "fees": 0.0}


func _normalize_account(raw: Variant) -> Dictionary:
	if typeof(raw) != TYPE_DICTIONARY:
		return _create_account(float(catalog.get("startCash", 10000)))
	var account: Dictionary = raw
	for key in ["cash", "initialCash", "realizedPnl", "fees"]:
		if not account.has(key) or not is_finite(float(account[key])):
			account[key] = 0.0
	if not account.has("positions") or typeof(account["positions"]) != TYPE_DICTIONARY:
		account["positions"] = {}
	if not account.has("trades") or typeof(account["trades"]) != TYPE_ARRAY:
		account["trades"] = []
	return account


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

static func bar_count(dataset: Dictionary) -> int:
	var tickers: Array = dataset.get("tickers", [])
	if tickers.is_empty():
		return 0
	return tickers[0].get("bars", []).size()


static func ticker_data(dataset: Dictionary, symbol: String) -> Dictionary:
	for ticker in dataset.get("tickers", []):
		if String(ticker.get("symbol", "")) == symbol:
			return ticker
	return {}


static func bars_for(dataset: Dictionary, symbol: String) -> Array:
	return ticker_data(dataset, symbol).get("bars", [])


static func current_date(dataset: Dictionary, day_index: int) -> String:
	var tickers: Array = dataset.get("tickers", [])
	if tickers.is_empty():
		return ""
	var bars: Array = tickers[0].get("bars", [])
	if day_index < 0 or day_index >= bars.size():
		return ""
	return String(bars[day_index][0])


static func _hash_string(value: String) -> int:
	var hash_value := 2166136261
	var bytes := value.to_utf16_buffer()
	var index := 0
	while index + 1 < bytes.size():
		var code: int = bytes[index] | (bytes[index + 1] << 8)
		hash_value = (hash_value ^ code) & 0xFFFFFFFF
		hash_value = (hash_value * 16777619) & 0xFFFFFFFF
		index += 2
	return hash_value


static func _imul(a: int, b: int) -> int:
	var al: int = a & 0xFFFF
	var ah: int = (a >> 16) & 0xFFFF
	var bl: int = b & 0xFFFF
	var bh: int = (b >> 16) & 0xFFFF
	return (al * bl + (((ah * bl + al * bh) & 0xFFFF) << 16)) & 0xFFFFFFFF


static func _noise(hash_value: int, salt: int) -> float:
	var mix := (hash_value ^ (salt * 2654435761)) & 0xFFFFFFFF
	var mixed := _imul(mix, 2654435761)
	return float(mixed) / 4294967295.0 * 2.0 - 1.0


static func _round(value: float, digits: int = 2) -> float:
	return SmaFormat.round_to(value, digits)


static func intraday_path(bar: Array, symbol: String) -> Array:
	var open_price := float(bar[1])
	var high := float(bar[2])
	var low := float(bar[3])
	var close := float(bar[4])
	if not is_finite(high) or not is_finite(low) or high <= low:
		var flat: Array = []
		for index in TICKS_PER_DAY:
			flat.append(_round(open_price))
		return flat
	var hash_value := _hash_string("%s|%s" % [symbol, bar[0]])
	var high_first := (hash_value & 1) == 0
	var anchors := [
		{"tick": 0, "price": open_price},
		{"tick": 2, "price": high if high_first else low},
		{"tick": 5, "price": low if high_first else high},
		{"tick": TICKS_PER_DAY - 1, "price": close},
	]
	var path: Array = []
	for tick in TICKS_PER_DAY:
		var right: Dictionary = anchors[anchors.size() - 1]
		for anchor in anchors:
			if int(anchor["tick"]) >= tick:
				right = anchor
				break
		var left: Dictionary = anchors[0]
		for anchor in anchors:
			if int(anchor["tick"]) <= tick:
				left = anchor
		var span := int(right["tick"]) - int(left["tick"])
		var ratio := float(tick - int(left["tick"])) / float(span) if span > 0 else 0.0
		var price := float(left["price"]) + (float(right["price"]) - float(left["price"])) * ratio
		if tick != int(left["tick"]):
			price += _noise(hash_value, tick + 11) * (high - low) * 0.06
		path.append(_round(clampf(price, low, high), 4))
	path[0] = _round(open_price, 4)
	path[2] = _round(float(anchors[1]["price"]), 4)
	path[5] = _round(float(anchors[2]["price"]), 4)
	path[TICKS_PER_DAY - 1] = _round(close, 4)
	return path


static func intraday_bar(bar: Array, symbol: String, tick: int = 0) -> Dictionary:
	var path := intraday_path(bar, symbol)
	var index := clampi(tick, 0, TICKS_PER_DAY - 1)
	var prices := path.slice(0, index + 1)
	var share := 0.0
	for i in range(index + 1):
		share += float(VOLUME_WEIGHTS[i])
	var high := -INF
	var low := INF
	for price in prices:
		high = maxf(high, float(price))
		low = minf(low, float(price))
	return {"d": bar[0], "o": float(path[0]), "h": high, "l": low,
		"c": float(path[index]), "v": int(round(float(bar[5] if bar.size() > 5 else 0) * share)),
		"tick": index}


static func quote_at_tick(dataset: Dictionary, symbol: String, day_index: int,
		tick: int = 0) -> Dictionary:
	var bars := bars_for(dataset, symbol)
	if day_index < 0 or day_index >= bars.size():
		return {}
	var bar: Array = bars[day_index]
	var intraday := intraday_bar(bar, symbol, tick)
	var prev_close := float((bars[day_index - 1] if day_index > 0 else bar)[4])
	var last := float(intraday["c"])
	return {
		"symbol": symbol, "date": bar[0], "open": intraday["o"], "high": intraday["h"],
		"low": intraday["l"], "last": last, "prevClose": prev_close,
		"volume": intraday["v"], "tick": intraday["tick"],
		"changePct": ((last - prev_close) / prev_close * 100.0) if prev_close > 0.0 else 0.0,
		"bid": maxf(0.01, _round(last - 0.01)), "ask": _round(last + 0.01),
	}


static func quotes_at_tick(dataset: Dictionary, day_index: int, tick: int = 0) -> Dictionary:
	var result := {}
	for ticker in dataset.get("tickers", []):
		var symbol := String(ticker.get("symbol", ""))
		result[symbol] = quote_at_tick(dataset, symbol, day_index, tick)
	return result


static func quote_at(dataset: Dictionary, symbol: String, day_index: int) -> Dictionary:
	var bars := bars_for(dataset, symbol)
	if day_index < 0 or day_index >= bars.size():
		return {}
	var bar: Array = bars[day_index]
	var prev_close := float((bars[day_index - 1] if day_index > 0 else bar)[4])
	return {"symbol": symbol, "date": bar[0], "open": float(bar[1]), "high": float(bar[2]),
		"low": float(bar[3]), "last": float(bar[4]), "prevClose": prev_close,
		"volume": float(bar[5] if bar.size() > 5 else 0),
		"changePct": ((float(bar[4]) - prev_close) / prev_close * 100.0) if prev_close > 0.0 else 0.0}


# ---------------------------------------------------------------------------
# Candles
# ---------------------------------------------------------------------------

static func _clock_text(minutes: int) -> String:
	return "%02d:%02d" % [int(minutes / 60.0), minutes % 60]


static func _minute_path(bar: Array, symbol: String) -> Array:
	var open_price := float(bar[1])
	var high := float(bar[2])
	var low := float(bar[3])
	var close := float(bar[4])
	var steps := INTRADAY_5M_BARS * MINUTES_PER_BAR
	if not is_finite(high) or not is_finite(low) or high <= low:
		var flat: Array = []
		for step in steps:
			flat.append(_round(open_price))
		return flat
	var hash_value := _hash_string("%s|%s|minute" % [symbol, bar[0]])
	var high_first := (hash_value & 1) == 0
	var anchors := [
		{"step": 0, "price": open_price},
		{"step": int(floor(steps * 0.32)), "price": high if high_first else low},
		{"step": int(floor(steps * 0.66)), "price": low if high_first else high},
		{"step": steps - 1, "price": close},
	]
	var prices: Array = []
	for step in steps:
		var right: Dictionary = anchors[anchors.size() - 1]
		for anchor in anchors:
			if int(anchor["step"]) >= step:
				right = anchor
				break
		var left: Dictionary = anchors[0]
		for anchor in anchors:
			if int(anchor["step"]) <= step:
				left = anchor
		var span := int(right["step"]) - int(left["step"])
		var ratio := float(step - int(left["step"])) / float(span) if span > 0 else 0.0
		var price := float(left["price"]) + (float(right["price"]) - float(left["price"])) * ratio
		if step != int(left["step"]):
			price += _noise(hash_value, step + 3) * (high - low) * 0.035
		prices.append(_round(clampf(price, low, high), 4))
	for anchor in anchors:
		prices[int(anchor["step"])] = _round(float(anchor["price"]), 4)
	return prices


static func _aggregate_candles(candles: Array, size: int) -> Array:
	if size <= 1:
		return candles
	var output: Array = []
	var index := 0
	while index < candles.size():
		var group: Array = candles.slice(index, mini(index + size, candles.size()))
		var high := -INF
		var low := INF
		var volume := 0
		for candle in group:
			high = maxf(high, float(candle["h"]))
			low = minf(low, float(candle["l"]))
			volume += int(candle.get("v", 0))
		output.append({"d": group[0]["d"], "time": group[0].get("time", ""),
			"end": group[group.size() - 1]["d"], "o": group[0]["o"], "h": high,
			"l": low, "c": group[group.size() - 1]["c"], "v": volume})
		index += size
	return output


static func build_intraday_candles(bar: Array, symbol: String, tick: int,
		timeframe: String, current_price: float) -> Array:
	var minute_prices := _minute_path(bar, symbol)
	var weights: Array = []
	var weight_sum := 0.0
	for index in INTRADAY_5M_BARS:
		var position := float(index) / float(INTRADAY_5M_BARS - 1) if INTRADAY_5M_BARS > 1 else 0.0
		var weight := 0.55 + 0.9 * absf(position * 2.0 - 1.0)
		weights.append(weight)
		weight_sum += weight
	var bars: Array = []
	for index in INTRADAY_5M_BARS:
		var start := index * MINUTES_PER_BAR
		var group: Array = minute_prices.slice(start, start + MINUTES_PER_BAR)
		var high := -INF
		var low := INF
		for price in group:
			high = maxf(high, float(price))
			low = minf(low, float(price))
		bars.append({"d": bar[0], "o": group[0], "h": high, "l": low,
			"c": group[group.size() - 1],
			"v": int(round(float(bar[5] if bar.size() > 5 else 0) * float(weights[index]) / weight_sum)),
			"time": _clock_text(9 * 60 + 30 + start)})
	var elapsed := maxi(0, tick) * 48
	var visible := mini(INTRADAY_5M_BARS, maxi(1, int(floor(float(elapsed) / MINUTES_PER_BAR)) + 1))
	var candles: Array = bars.slice(0, visible)
	var last_index := candles.size() - 1
	var minutes_into := maxi(1, mini(MINUTES_PER_BAR,
		elapsed - last_index * MINUTES_PER_BAR + 1))
	if last_index >= 0 and minutes_into < MINUTES_PER_BAR:
		var start := last_index * MINUTES_PER_BAR
		var group: Array = minute_prices.slice(start, start + minutes_into)
		var high := -INF
		var low := INF
		for price in group:
			high = maxf(high, float(price))
			low = minf(low, float(price))
		candles[last_index] = {
			"d": candles[last_index]["d"], "time": candles[last_index]["time"],
			"o": group[0], "h": high, "l": low, "c": group[group.size() - 1],
			"v": int(round(float(candles[last_index].get("v", 0))
				* float(minutes_into) / float(MINUTES_PER_BAR))),
		}
	if timeframe == "15m":
		candles = _aggregate_candles(candles, 3)
	elif timeframe == "1h":
		candles = _aggregate_candles(candles, 12)
	if is_finite(current_price) and not candles.is_empty():
		var last: Dictionary = candles[candles.size() - 1]
		last["c"] = _round(current_price, 4)
		last["h"] = maxf(float(last["h"]), float(last["c"]))
		last["l"] = minf(float(last["l"]), float(last["c"]))
	return candles


static func _week_key(date_text: String) -> String:
	var parsed := Time.get_datetime_dict_from_datetime_string(date_text + "T00:00:00", true)
	var weekday := int(parsed["weekday"])
	var offset := (weekday + 6) % 7
	var unix := Time.get_unix_time_from_datetime_dict(parsed) - offset * 86400
	return Time.get_datetime_string_from_unix_time(unix).substr(0, 10)


static func aggregate_by_period(candles: Array, timeframe: String) -> Array:
	var output: Array = []
	for candle in candles:
		var key := ""
		if timeframe == "1w":
			key = _week_key(String(candle["d"]))
		elif timeframe == "1mo":
			key = String(candle["d"]).substr(0, 7)
		else:
			key = String(candle["d"]).substr(0, 4)
		if not output.is_empty() and String(output[-1].get("key", "")) == key:
			var last: Dictionary = output[-1]
			last["h"] = maxf(float(last["h"]), float(candle["h"]))
			last["l"] = minf(float(last["l"]), float(candle["l"]))
			last["c"] = candle["c"]
			last["v"] = int(last.get("v", 0)) + int(candle.get("v", 0))
			last["end"] = candle["d"]
		else:
			output.append({"key": key, "d": candle["d"], "end": candle["d"],
				"o": candle["o"], "h": candle["h"], "l": candle["l"],
				"c": candle["c"], "v": candle.get("v", 0)})
	return output


static func history_candles(dataset: Dictionary, symbol: String, day_index: int,
		tick: int, timeframe: String, current_price: float) -> Dictionary:
	var bars := bars_for(dataset, symbol)
	if bars.is_empty():
		return {"candles": [], "labels": [], "intraday": false}
	if ["5m", "15m", "1h"].has(timeframe):
		var candles := build_intraday_candles(bars[day_index], symbol, tick, timeframe, current_price)
		var labels := [candles[0].get("time", "09:30") if not candles.is_empty() else "09:30",
			_session_clock_text(tick)]
		return {"candles": candles, "labels": labels, "intraday": true}
	var completed: Array = []
	for index in mini(day_index, bars.size()):
		var bar: Array = bars[index]
		completed.append({"d": bar[0], "end": bar[0], "o": bar[1], "h": bar[2],
			"l": bar[3], "c": bar[4], "v": bar[5] if bar.size() > 5 else 0})
	if day_index < bars.size():
		var partial := intraday_bar(bars[day_index], symbol, tick)
		completed.append({"d": partial["d"], "end": partial["d"], "o": partial["o"],
			"h": partial["h"], "l": partial["l"], "c": partial["c"], "v": partial["v"]})
	var candles2: Array
	if timeframe == "1d":
		candles2 = completed
	else:
		candles2 = aggregate_by_period(completed, timeframe)
	var labels2 := ["", ""]
	if not candles2.is_empty():
		labels2 = [String(candles2[0].get("d", "")),
			String(candles2[-1].get("end", candles2[-1].get("d", "")))]
	return {"candles": candles2, "labels": labels2, "intraday": false}


static func _session_clock_text(tick: int) -> String:
	var minutes := 9 * 60 + 30 + clampi(tick, 0, TICKS_PER_DAY - 1) * 48
	return _clock_text(minutes)


# ---------------------------------------------------------------------------
# Run progression and trading
# ---------------------------------------------------------------------------

func advance_tick(scenario_id: String, dataset: Dictionary) -> Dictionary:
	var run_data := ensure_run(scenario_id, dataset)
	var tick := int(run_data["tick"]) + 1
	var day_closed := false
	var reached_end := false
	if tick >= TICKS_PER_DAY:
		tick = 0
		day_closed = true
		var max_index := bar_count(dataset) - 1
		if int(run_data["dayIndex"]) >= max_index:
			reached_end = true
		else:
			run_data["dayIndex"] = int(run_data["dayIndex"]) + 1
			_record_equity(run_data, dataset)
	run_data["tick"] = tick
	return {"run": run_data, "dayClosed": day_closed, "reachedEnd": reached_end}


func advance_day(scenario_id: String, dataset: Dictionary) -> Dictionary:
	var run_data := ensure_run(scenario_id, dataset)
	var max_index := bar_count(dataset) - 1
	var next_index := mini(max_index, int(run_data["dayIndex"]) + 1)
	run_data["dayIndex"] = next_index
	run_data["tick"] = 0
	_record_equity(run_data, dataset)
	return {"run": run_data, "reachedEnd": next_index >= max_index}


func advance_to_event(scenario_id: String, dataset: Dictionary) -> Dictionary:
	var run_data := ensure_run(scenario_id, dataset)
	var entry := scenario(scenario_id)
	var date := current_date(dataset, int(run_data["dayIndex"]))
	var target := ""
	for event in entry.get("events", []):
		if String(event.get("date", "")) > date:
			target = String(event["date"])
			break
	if target == "":
		return {"run": run_data, "reachedEnd": true}
	var bars := bars_for(dataset, String(dataset.get("tickers", [{}])[0].get("symbol", "")))
	for index in bars.size():
		if String(bars[index][0]) >= target:
			run_data["dayIndex"] = index
			run_data["tick"] = 0
			_record_equity(run_data, dataset)
			return {"run": run_data, "reachedEnd": false}
	return {"run": run_data, "reachedEnd": true}


func trade(scenario_id: String, dataset: Dictionary, payload: Dictionary) -> Dictionary:
	var run_data := ensure_run(scenario_id, dataset)
	var symbol := String(payload.get("symbol", "")).to_upper()
	var side := String(payload.get("side", ""))
	var qty := int(floor(float(payload.get("qty", 0))))
	var tick := int(payload.get("tick", run_data.get("tick", 0)))
	if qty <= 0 or not ["buy", "sell"].has(side):
		return {"ok": false, "error": "history.invalid"}
	var quote := quote_at_tick(dataset, symbol, int(run_data["dayIndex"]), tick)
	if quote.is_empty():
		return {"ok": false, "error": "history.noData"}
	var account: Dictionary = run_data["account"]
	var price := float(quote["last"])
	var fee := float(catalog.get("fee", 1))
	var gross := qty * price
	if side == "buy":
		if gross + fee > float(account["cash"]) + 1e-9:
			return {"ok": false, "error": "history.insufficientCash"}
		account["cash"] = SmaFormat.round_to(float(account["cash"]) - gross - fee, 2)
		var position: Dictionary = account["positions"].get(symbol, {"qty": 0, "costBasis": 0.0})
		position["qty"] = int(position["qty"]) + qty
		position["costBasis"] = float(position["costBasis"]) + gross + fee
		account["positions"][symbol] = position
		account["fees"] = SmaFormat.round_to(float(account["fees"]) + fee, 2)
		account["trades"].append(_trade_record(symbol, side, qty, price, fee, 0.0,
			int(run_data["dayIndex"]), tick, String(quote["date"])))
	else:
		var position: Dictionary = account["positions"].get(symbol, {})
		if position.is_empty() or int(position["qty"]) < qty:
			return {"ok": false, "error": "history.insufficientShares"}
		var cost := float(position["costBasis"]) * float(qty) / float(position["qty"])
		var net := gross - fee
		var realized := net - cost
		account["cash"] = SmaFormat.round_to(float(account["cash"]) + net, 2)
		account["realizedPnl"] = SmaFormat.round_to(float(account["realizedPnl"]) + realized, 2)
		account["fees"] = SmaFormat.round_to(float(account["fees"]) + fee, 2)
		position["qty"] = int(position["qty"]) - qty
		position["costBasis"] = maxf(0.0, float(position["costBasis"]) - cost)
		if int(position["qty"]) <= 0:
			account["positions"].erase(symbol)
		else:
			account["positions"][symbol] = position
		account["trades"].append(_trade_record(symbol, side, qty, price, fee, realized,
			int(run_data["dayIndex"]), tick, String(quote["date"])))
	if account["trades"].size() > 400:
		account["trades"] = account["trades"].slice(account["trades"].size() - 400)
	run_data["selectedTicker"] = symbol
	return {"ok": true, "run": run_data, "price": price, "fee": fee}


func _trade_record(symbol: String, side: String, qty: int, price: float, fee: float,
		realized: float, day: int, tick: int, date: String) -> Dictionary:
	return {"symbol": symbol, "side": side, "qty": qty,
		"price": SmaFormat.round_to(price, 4), "fee": fee,
		"realized": SmaFormat.round_to(realized, 2), "day": day, "tick": tick,
		"date": date, "time": _session_clock_text(tick)}


func equity(scenario_id: String, dataset: Dictionary) -> float:
	var run_data := ensure_run(scenario_id, dataset)
	var account: Dictionary = run_data["account"]
	var value := float(account["cash"])
	var day := int(run_data["dayIndex"])
	var tick := int(run_data["tick"])
	for symbol in account["positions"].keys():
		var quote := quote_at_tick(dataset, String(symbol), day, tick)
		value += int(account["positions"][symbol]["qty"]) * float(quote.get("last", 0.0))
	return SmaFormat.round_to(value, 2)


func position_rows(scenario_id: String, dataset: Dictionary) -> Array:
	var run_data := ensure_run(scenario_id, dataset)
	var account: Dictionary = run_data["account"]
	var rows: Array = []
	for symbol in account["positions"].keys():
		var position: Dictionary = account["positions"][symbol]
		var quote := quote_at_tick(dataset, String(symbol), int(run_data["dayIndex"]), int(run_data["tick"]))
		var qty := int(position["qty"])
		var last := float(quote.get("last", 0.0))
		rows.append({"symbol": symbol, "qty": qty,
			"avgCost": float(position["costBasis"]) / float(maxi(1, qty)),
			"last": last, "marketValue": SmaFormat.round_to(qty * last, 2),
			"unrealized": SmaFormat.round_to(qty * last - float(position["costBasis"]), 2)})
	rows.sort_custom(func(a, b): return float(a["marketValue"]) > float(b["marketValue"]))
	return rows


func summary(scenario_id: String, dataset: Dictionary) -> Dictionary:
	var run_data := ensure_run(scenario_id, dataset)
	var account: Dictionary = run_data["account"]
	var current_equity := equity(scenario_id, dataset)
	var initial := float(account["initialCash"])
	var return_pct := ((current_equity - initial) / initial * 100.0) if initial > 0.0 else 0.0
	var benchmark_pct := _benchmark_return(run_data, dataset)
	var peak := initial
	var max_drawdown := 0.0
	for point in run_data.get("equityHistory", []):
		var value := float(point.get("equity", initial))
		peak = maxf(peak, value)
		if peak > 0.0:
			max_drawdown = maxf(max_drawdown, (peak - value) / peak * 100.0)
	var wins := 0
	var closed := 0
	for trade in account["trades"]:
		if String(trade.get("side", "")) == "sell":
			closed += 1
			if float(trade.get("realized", 0.0)) > 0.0:
				wins += 1
	return {
		"equity": current_equity, "cash": float(account["cash"]),
		"initialCash": initial, "returnPct": return_pct,
		"benchmarkPct": benchmark_pct, "maxDrawdown": max_drawdown,
		"trades": account["trades"].size(), "closedTrades": closed,
		"winRate": (float(wins) / float(closed) * 100.0) if closed > 0 else 0.0,
		"realizedPnl": float(account["realizedPnl"]), "fees": float(account["fees"]),
		"dayIndex": int(run_data["dayIndex"]), "tick": int(run_data["tick"]),
	}


func _benchmark_return(run_data: Dictionary, dataset: Dictionary) -> float:
	var benchmark := String(dataset.get("benchmark", "QQQ"))
	var start := int(run_data.get("startIndex", 0))
	var current := int(run_data.get("dayIndex", start))
	var start_quote := quote_at(dataset, benchmark, start)
	var current_quote := quote_at(dataset, benchmark, current)
	if start_quote.is_empty() or current_quote.is_empty():
		return 0.0
	var start_price := float(start_quote["last"])
	return ((float(current_quote["last"]) - start_price) / start_price * 100.0) if start_price > 0.0 else 0.0


func _record_equity(run_data: Dictionary, dataset: Dictionary) -> void:
	var history: Array = run_data.get("equityHistory", [])
	var value := equity(String(run_data["scenarioId"]), dataset)
	var point := {"day": int(run_data["dayIndex"]), "equity": value}
	if not history.is_empty() and int(history[-1].get("day", -1)) == int(point["day"]):
		history[-1] = point
	else:
		history.append(point)
	if history.size() > 500:
		history = history.slice(history.size() - 500)
	run_data["equityHistory"] = history


func events_up_to(scenario_id: String, date: String) -> Array:
	var result: Array = []
	for event in scenario(scenario_id).get("events", []):
		if String(event.get("date", "")) <= date:
			result.append(event)
	return result


func to_dict() -> Dictionary:
	return {"runs": runs}


func from_dict(data: Dictionary) -> void:
	runs = data.get("runs", {})
	for scenario_id in runs.keys():
		var run_data: Dictionary = runs[scenario_id]
		run_data["account"] = _normalize_account(run_data.get("account", {}))
		if not run_data.has("equityHistory"):
			run_data["equityHistory"] = [{"day": int(run_data.get("dayIndex", 0)),
				"equity": float(run_data["account"]["initialCash"])}]
