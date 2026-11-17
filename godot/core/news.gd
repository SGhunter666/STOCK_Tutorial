## Deterministic market news emitted at the start of each trading day. The
## events shock simulated quotes immediately and are stored for the news feed.
class_name SmaNews
extends RefCounted

const LIMIT := 80

const COMPANY_EVENTS := [
	{"template": "earningsBeat", "min": 3.0, "max": 8.0},
	{"template": "earningsMiss", "min": -8.0, "max": -3.0},
	{"template": "contractWin", "min": 2.0, "max": 6.0},
	{"template": "lawsuit", "min": -7.0, "max": -2.0},
	{"template": "ceoExit", "min": -5.0, "max": -2.0},
	{"template": "recall", "min": -6.0, "max": -3.0},
	{"template": "upgrade", "min": 1.0, "max": 4.0},
	{"template": "downgrade", "min": -4.0, "max": -1.0},
]

const MACRO_EVENTS := [
	{"template": "rateCut", "min": 1.0, "max": 3.0},
	{"template": "rateHike", "min": -3.0, "max": -1.0},
	{"template": "inflationCool", "min": 1.0, "max": 2.5},
	{"template": "inflationHot", "min": -2.5, "max": -1.0},
	{"template": "growthStrong", "min": 1.0, "max": 2.5},
	{"template": "recessionFear", "min": -2.5, "max": -1.0},
]


static func _apply_shock(cs: Dictionary, pct: float) -> void:
	var last := maxf(0.01, float(cs.get("last", 0.0)) * (1.0 + pct / 100.0))
	cs["last"] = last
	cs["open"] = last
	cs["high"] = last
	cs["low"] = last


static func _push(state: Dictionary, entry: Dictionary) -> void:
	var items: Array = state.get("news", [])
	entry["id"] = int(state.get("newsSeq", 0))
	state["newsSeq"] = int(state.get("newsSeq", 0)) + 1
	items.append(entry)
	while items.size() > LIMIT:
		items.pop_front()
	state["news"] = items


static func _eligible_companies(state: Dictionary) -> Array:
	var result: Array = []
	for ticker in state["companies"].keys():
		var cs: Dictionary = state["companies"][ticker]
		var company: Dictionary = cs.get("company", {})
		if bool(company.get("isEtf", false)):
			continue
		result.append({"ticker": String(ticker), "company": company})
	return result


## Mirrors the web market engine: one macro roll, then up to two company rolls.
static func maybe_emit(state: Dictionary, rng: SmaRng) -> Array:
	var emitted: Array = []
	var companies := _eligible_companies(state)
	if companies.is_empty():
		return emitted
	var day := int(state.get("dayIndex", 0))
	if rng.next() < 0.22:
		var kind: Dictionary = rng.pick(MACRO_EVENTS)
		var pct := rng.range_float(float(kind["min"]), float(kind["max"]))
		for entry in companies:
			var cs: Dictionary = state["companies"][String(entry["ticker"])]
			var beta := maxf(0.5, float(entry["company"].get("beta", 1.0)))
			_apply_shock(cs, pct * beta)
		var news := {
			"day": day, "tick": 0, "kind": "macro",
			"template": String(kind["template"]), "ticker": "",
			"pct": roundf(pct * 10.0) / 10.0,
		}
		_push(state, news)
		emitted.append(news)
	if rng.next() < 0.5:
		var count := 2 if rng.next() < 0.18 else 1
		for index in count:
			var entry: Dictionary = rng.pick(companies)
			var kind: Dictionary = rng.pick(COMPANY_EVENTS)
			var pct := rng.range_float(float(kind["min"]), float(kind["max"]))
			var cs: Dictionary = state["companies"][String(entry["ticker"])]
			_apply_shock(cs, pct)
			var news := {
				"day": day, "tick": 0, "kind": "company",
				"template": String(kind["template"]),
				"ticker": String(entry["ticker"]),
				"pct": roundf(pct * 10.0) / 10.0,
			}
			_push(state, news)
			emitted.append(news)
	return emitted
