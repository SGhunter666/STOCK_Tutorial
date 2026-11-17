## Optional external quote feed. Payloads are reference data only: they never
## mutate the deterministic market, the account or any save. Accepted shapes
## mirror the web build:
##   { "updatedAt": "...", "quotes": { "AURA": 12.34 } }
##   { "quotes": [{ "ticker": "AURA", "last": 12.34, "changePct": 1.2 }] }
##   { "AURA": 12.34 }
class_name SmaLiveFeed
extends RefCounted

const MAX_QUOTES := 80
const TICKER_PATTERN := "[^A-Z0-9.\\-]"


static func normalize(payload: Variant, now: int = 0) -> Dictionary:
	if payload == null:
		return {"ok": false, "error": "liveFeed.errorEmpty"}
	if now <= 0:
		now = int(Time.get_unix_time_from_system())
	var stamp: Variant = null
	var entries: Array = []
	if typeof(payload) == TYPE_ARRAY:
		for item in payload:
			if typeof(item) == TYPE_DICTIONARY:
				entries.append([item.get("ticker", ""), item])
	elif typeof(payload) == TYPE_DICTIONARY:
		var data: Dictionary = payload
		stamp = data.get("updatedAt", data.get("timestamp", data.get("time")))
		var quotes_value: Variant = data.get("quotes")
		if typeof(quotes_value) == TYPE_ARRAY:
			for item in quotes_value:
				if typeof(item) == TYPE_DICTIONARY:
					entries.append([item.get("ticker", ""), item])
		elif typeof(quotes_value) == TYPE_DICTIONARY:
			for key in quotes_value.keys():
				entries.append([key, quotes_value[key]])
		elif typeof(data.get("data")) == TYPE_DICTIONARY:
			var nested: Dictionary = data["data"]
			for key in nested.keys():
				entries.append([key, nested[key]])
		else:
			for key in data.keys():
				if String(key) in ["updatedAt", "timestamp", "time"]:
					continue
				var value: Variant = data[key]
				if typeof(value) in [TYPE_INT, TYPE_FLOAT] \
						or typeof(value) == TYPE_DICTIONARY:
					entries.append([key, value])
	var quotes: Array = []
	for entry in entries:
		var quote := _normalize_quote(String(entry[0]), entry[1])
		if quote.is_empty():
			continue
		quotes.append(quote)
		if quotes.size() >= MAX_QUOTES:
			break
	if quotes.is_empty():
		return {"ok": false, "error": "liveFeed.errorQuotes"}
	return {"ok": true, "quotes": quotes, "updatedAt": _time_value(stamp, now)}


static func _normalize_quote(ticker_value: String, raw: Variant) -> Dictionary:
	var ticker := ticker_value.to_upper()
	ticker = ticker.replace("\n", "").replace("\r", "").replace("\t", "")
	var regex := RegEx.new()
	regex.compile(TICKER_PATTERN)
	ticker = regex.sub(ticker, "", true).substr(0, 12)
	if ticker == "":
		return {}
	var last := NAN
	var change := NAN
	if typeof(raw) in [TYPE_INT, TYPE_FLOAT]:
		last = float(raw)
	elif typeof(raw) == TYPE_DICTIONARY:
		var data: Dictionary = raw
		for key in ["last", "price", "close"]:
			if data.has(key) and typeof(data[key]) in [TYPE_INT, TYPE_FLOAT]:
				last = float(data[key])
				break
		for key in ["changePct", "change"]:
			if data.has(key) and typeof(data[key]) in [TYPE_INT, TYPE_FLOAT]:
				change = float(data[key])
				break
	if not is_finite(last) or last <= 0.0:
		return {}
	return {
		"ticker": ticker,
		"last": last,
		"changePct": change if is_finite(change) else null,
	}


static func _time_value(value: Variant, fallback: int) -> int:
	if typeof(value) in [TYPE_INT, TYPE_FLOAT]:
		var numeric := int(value)
		return numeric if numeric > 0 else fallback
	if typeof(value) == TYPE_STRING:
		var text := String(value).strip_edges()
		if text == "":
			return fallback
		text = text.replace("Z", "").strip_edges().replace(" ", "T")
		var unix := Time.get_unix_time_from_datetime_string(text)
		if unix > 0.0:
			return int(unix)
	return fallback
