## Deterministic teaching macro cycle. Every value is a pure function of the
## simulated day and seed, so a save always shows the same macro picture.
class_name SmaMacro
extends RefCounted

const TAU_APPROX := 6.283185307179586


static func seed_phase(seed: String) -> float:
	var hash := 0
	for index in seed.length():
		hash = (hash * 31 + seed.unicode_at(index)) % 1000
	return float(hash) / 1000.0 * TAU_APPROX


static func _wave(day: float, period: float, phase: float) -> float:
	return sin((day / period) * TAU_APPROX + phase)


static func _round1(value: float) -> float:
	return roundf(value * 10.0) / 10.0


static func _round2(value: float) -> float:
	return roundf(value * 100.0) / 100.0


static func snapshot(day: int, seed: String) -> Dictionary:
	var phase := seed_phase(seed)
	var policy := _round1(2.6 + 1.6 * _wave(day, 240.0, phase)
		+ 0.7 * _wave(day, 60.0, phase + 1.0))
	var inflation := _round1(2.3 + 1.1 * _wave(day, 150.0, phase + 0.6)
		+ 0.4 * _wave(day, 45.0, phase))
	var growth := _round1(2.1 + 1.3 * _wave(day, 300.0, phase + 1.2))
	var unemployment := _round1(5.1 - 0.9 * _wave(day, 200.0, phase + 0.3))
	var real_rate := _round1(policy - inflation)
	var regime := "neutral"
	if growth >= 2.6:
		regime = "expansion"
	elif growth <= 1.2:
		regime = "slowdown"
	elif inflation >= 3.2:
		regime = "inflation"
	return {
		"policyRate": policy,
		"inflation": inflation,
		"growth": growth,
		"unemployment": unemployment,
		"realRate": real_rate,
		"regime": regime,
	}


static func regime_key(regime: String) -> String:
	return "macro.regime.%s" % regime


## Extended picture used by the economy page, bonds, FX and commodities.
static func world(day: int, seed: String) -> Dictionary:
	var data := snapshot(day, seed)
	var phase := seed_phase(seed)
	var confidence := _round1(
		100.0 + float(data["growth"]) * 7.0
		- float(data["unemployment"]) * 2.2
		- maxf(0.0, float(data["realRate"])) * 1.8
		+ _wave(day, 90.0, phase + 0.4) * 2.0)
	var yield2 := _round2(float(data["policyRate"]) + 0.15
		+ _wave(day, 120.0, phase) * 0.1)
	var yield10 := _round2(float(data["policyRate"]) + 0.55
		+ float(data["growth"]) * 0.18 - float(data["inflation"]) * 0.08
		+ _wave(day, 180.0, phase + 0.9) * 0.12)
	var curve := _round2(yield10 - yield2)
	var credit_spread := _round2(1.15 + maxf(0.0, 2.1 - float(data["growth"])) * 1.1
		+ maxf(0.0, float(data["realRate"])) * 0.35)
	var appetite := 50.0 + float(data["growth"]) * 12.0
	appetite -= float(data["inflation"]) * 6.0
	appetite -= maxf(0.0, float(data["realRate"])) * 5.0
	if String(data["regime"]) == "expansion":
		appetite += 8.0
	elif String(data["regime"]) == "slowdown":
		appetite -= 8.0
	data["confidence"] = confidence
	data["yield2"] = yield2
	data["yield10"] = yield10
	data["curve"] = curve
	data["creditSpread"] = credit_spread
	data["riskAppetite"] = int(round(clampf(appetite, 0.0, 100.0)))
	return data


const CALENDAR_TYPES := ["cpi", "payrolls", "gdp", "pmi", "centralBank"]
const CALENDAR_INTERVAL := 21


static func _event_surprise(seed: String, date: int, type: String) -> float:
	var hash := 0
	var text := "%s:%d:%s" % [seed, date, type]
	for index in text.length():
		hash = (hash * 31 + text.unicode_at(index)) % 10000
	return (float(hash) / 10000.0 - 0.5) * 2.0


## Recent and upcoming deterministic macro releases with forecasts and surprises.
static func calendar(day: int, seed: String, past: int = 3, future: int = 3) -> Array:
	var phase := seed_phase(seed)
	var events: Array = []
	var first := int(floor(float(day - past * CALENDAR_INTERVAL) / CALENDAR_INTERVAL)) \
		* CALENDAR_INTERVAL
	var date := first
	while date <= day + future * CALENDAR_INTERVAL:
		if date >= 0:
			var type := String(CALENDAR_TYPES[absi(int(floor(float(date) / CALENDAR_INTERVAL)))
				% CALENDAR_TYPES.size()])
			var snapshot_data := snapshot(maxi(0, date), seed)
			var forecast := 50.0
			var sensitivity := 0.2
			var positive_when := 1.0
			if type == "cpi":
				forecast = _round1(float(snapshot_data["inflation"]))
				sensitivity = 0.45
				positive_when = -1.0
			elif type == "payrolls":
				forecast = roundf(120.0 + float(snapshot_data["growth"]) * 35.0
					+ _wave(date, 90.0, phase) * 28.0)
				sensitivity = 0.03
			elif type == "gdp":
				forecast = _round1(float(snapshot_data["growth"]))
				sensitivity = 0.35
			elif type == "pmi":
				forecast = _round1(50.0 + (float(snapshot_data["growth"]) - 2.1) * 3.5)
				sensitivity = 0.22
			else:
				forecast = _round2(float(snapshot_data["policyRate"]))
				sensitivity = 0.55
				positive_when = -1.0
			var surprise := _event_surprise(seed, date, type)
			var actual := 0.0
			if type == "payrolls":
				actual = roundf(forecast + surprise * 55.0)
			else:
				var factor := 0.35 if type == "centralBank" else (0.7 if type == "cpi" else 0.6)
				actual = _round2(forecast + surprise * factor)
			var diff := _round2(actual - forecast)
			events.append({
				"day": date,
				"type": type,
				"forecast": forecast,
				"actual": actual,
				"surprise": diff,
				"impactPct": _round2(diff * sensitivity * positive_when),
				"released": date <= day,
			})
		date += CALENDAR_INTERVAL
	return events


const REGIONS := [
	{"id": "us", "nameKey": "macroPage.region.us", "base": 1000.0, "period": 260.0,
		"coupling": 1.0, "phase": 0.0},
	{"id": "europe", "nameKey": "macroPage.region.europe", "base": 760.0, "period": 240.0,
		"coupling": 0.78, "phase": 0.6},
	{"id": "asia", "nameKey": "macroPage.region.asia", "base": 880.0, "period": 220.0,
		"coupling": 0.62, "phase": 1.1},
	{"id": "em", "nameKey": "macroPage.region.em", "base": 640.0, "period": 200.0,
		"coupling": 0.48, "phase": 1.7},
]


## Global market proxies. The US row is the caller's simulated index; other
## regions are deterministic local waves coupled to the US change.
static func global_markets(us_level: float, us_change: float, day: int,
		seed: String) -> Array:
	var phase := seed_phase(seed)
	var rows: Array = []
	for region in REGIONS:
		var row: Dictionary = region.duplicate(true)
		if String(region["id"]) == "us":
			row["level"] = _round2(us_level)
			row["changePct"] = _round2(us_change)
			row["coupling"] = 1.0
		else:
			var local := _wave(day, float(region["period"]),
				phase + float(region["phase"])) * 6.0
			row["level"] = _round2(float(region["base"]) * (1.0
				+ _wave(day, float(region["period"]),
					phase + float(region["phase"])) * 0.09))
			row["changePct"] = _round2(us_change * float(region["coupling"])
				+ local / float(region["period"]))
			row["coupling"] = float(region["coupling"])
			row["local"] = _round2(local / float(region["period"]))
		rows.append(row)
	return rows
