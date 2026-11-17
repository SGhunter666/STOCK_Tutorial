## Academy progression, practice validation and quiz grading. Pure logic: the
## UI and Game own persistence and events, this class only reads/writes the
## education dictionary and returns outcomes.
class_name SmaAcademy
extends RefCounted

const CATALOG_PATH := "res://data/academy/curriculum.json"
const XP_SECTION := 5
const XP_PRACTICE := 25
const XP_QUIZ_PASS := 40
const XP_QUIZ_PERFECT := 15
const XP_UNIT_COMPLETE := 20
const XP_PER_LEVEL := 150
const PASS_SCORE := 80

const TOOL_RULES := {
	"order.limit": {"unitId": "u4", "sectionId": "s3"},
	"trade.short": {"unitId": "u17", "sectionId": "s1"},
	"trade.margin": {"unitId": "u18", "sectionId": "s1"},
	"order.stop": {"unitId": "u19", "sectionId": "s1"},
	"market.depth": {"unitId": "u20", "sectionId": "s1"},
	"options.trade": {"unitId": "u21", "sectionId": "s1"},
	"options.sell": {"unitId": "u25", "sectionId": "s1"},
	"trade.futures": {"unitId": "u29", "sectionId": "s1"},
}

static var _catalog_cache: Dictionary = {}


static func catalog() -> Dictionary:
	if not _catalog_cache.is_empty():
		return _catalog_cache
	var file := FileAccess.open(CATALOG_PATH, FileAccess.READ)
	if file == null:
		push_error("SmaAcademy: missing catalog %s" % CATALOG_PATH)
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("SmaAcademy: malformed catalog")
		return {}
	_catalog_cache = parsed
	return _catalog_cache


static func units() -> Array:
	return catalog().get("units", [])


static func branch_units() -> Array:
	var result: Array = []
	for entry in units():
		if bool(entry.get("optional", false)):
			result.append(entry)
	return result


static func branch_for_unit(unit_id: String) -> Dictionary:
	for entry in catalog().get("branches", []):
		if String(entry.get("unitId", "")) == unit_id:
			return entry
	return {}


static func unit(unit_id: String) -> Dictionary:
	for entry in units():
		if String(entry.get("id", "")) == unit_id:
			return entry
	return {}


static func section(unit_id: String, section_id: String) -> Dictionary:
	for entry in unit(unit_id).get("sections", []):
		if String(entry.get("id", "")) == section_id:
			return entry
	return {}


static func create_state() -> Dictionary:
	var state := {
		"units": {},
		"xp": 0,
		"xpAwards": {},
		"achievements": [],
		"inspectedTickers": [],
		"glossaryOpened": [],
		"demosCompleted": {},
		"financialsViewed": [],
		"languageSwitched": false,
	}
	for entry in units():
		state["units"][String(entry["id"])] = _new_unit_progress()
	return state


static func _new_unit_progress() -> Dictionary:
	return {
		"sectionsRead": {},
		"quizBest": null,
		"quizAttempts": 0,
		"lastScore": null,
		"practiceDone": false,
		"completed": false,
		"completedDay": null,
	}


static func normalize_state(saved: Variant) -> Dictionary:
	var state := create_state()
	if typeof(saved) != TYPE_DICTIONARY:
		return state
	var data: Dictionary = saved
	state["xp"] = int(data.get("xp", 0))
	state["xpAwards"] = data.get("xpAwards", {})
	state["achievements"] = data.get("achievements", [])
	state["inspectedTickers"] = data.get("inspectedTickers", [])
	state["glossaryOpened"] = data.get("glossaryOpened", [])
	state["demosCompleted"] = data.get("demosCompleted", {})
	state["financialsViewed"] = data.get("financialsViewed", [])
	state["languageSwitched"] = bool(data.get("languageSwitched", false))
	var saved_units: Dictionary = data.get("units", {})
	for entry in units():
		var unit_id := String(entry["id"])
		var progress: Dictionary = _new_unit_progress()
		var raw: Dictionary = saved_units.get(unit_id, {})
		progress["sectionsRead"] = raw.get("sectionsRead", {})
		progress["quizBest"] = raw.get("quizBest", null)
		progress["quizAttempts"] = int(raw.get("quizAttempts", 0))
		progress["lastScore"] = raw.get("lastScore", null)
		progress["practiceDone"] = bool(raw.get("practiceDone", false))
		progress["completed"] = bool(raw.get("completed", false))
		progress["completedDay"] = raw.get("completedDay", null)
		state["units"][unit_id] = progress
	return state


static func ensure_unit(state: Dictionary, unit_id: String) -> Dictionary:
	if not state["units"].has(unit_id):
		state["units"][unit_id] = _new_unit_progress()
	return state["units"][unit_id]


static func is_section_read(state: Dictionary, unit_id: String, section_id: String) -> bool:
	var progress := ensure_unit(state, unit_id)
	return bool(progress["sectionsRead"].get(section_id, false))


static func is_unit_complete(state: Dictionary, unit_id: String) -> bool:
	return bool(ensure_unit(state, unit_id)["completed"])


static func is_unit_unlocked(state: Dictionary, unit_id: String) -> bool:
	var entry := unit(unit_id)
	if entry.is_empty():
		return false
	for prerequisite in entry.get("prerequisites", []):
		if not is_unit_complete(state, String(prerequisite)):
			return false
	return true


static func progress_rows(state: Dictionary, entry: Dictionary) -> Dictionary:
	var progress := ensure_unit(state, String(entry["id"]))
	var sections: Array = entry.get("sections", [])
	var read := 0
	for section_entry in sections:
		if bool(progress["sectionsRead"].get(String(section_entry["id"]), false)):
			read += 1
	var total := sections.size()
	var quiz_passed := int(progress["quizBest"] if progress["quizBest"] != null else 0) \
		>= int(entry.get("quiz", {}).get("passScore", PASS_SCORE))
	var practice_done := bool(progress["practiceDone"])
	var pct := 0
	if total > 0:
		pct = int(round((float(read) / float(total) * 0.5
			+ (0.25 if practice_done else 0.0)
			+ (0.25 if quiz_passed else 0.0)) * 100.0))
	if bool(progress["completed"]):
		pct = 100
	else:
		pct = mini(99, pct)
	return {
		"read": read, "total": total, "allRead": read == total,
		"practiceDone": practice_done, "quizBest": progress["quizBest"],
		"quizAttempts": int(progress["quizAttempts"]), "quizPassed": quiz_passed,
		"completed": bool(progress["completed"]), "pct": pct,
	}


static func award_xp(state: Dictionary, key: String, amount: int) -> int:
	if state["xpAwards"].has(key):
		return 0
	state["xpAwards"][key] = amount
	state["xp"] = int(state["xp"]) + amount
	return amount


static func level_info(state: Dictionary) -> Dictionary:
	var xp := int(state["xp"])
	var level := int(floor(float(xp) / float(XP_PER_LEVEL))) + 1
	var into := xp % XP_PER_LEVEL
	return {"level": level, "xp": xp, "intoLevel": into, "needed": XP_PER_LEVEL,
		"pct": float(into) / float(XP_PER_LEVEL) * 100.0}


static func overall_progress(state: Dictionary) -> Dictionary:
	var completed := 0
	var total := 0
	for entry in units():
		if bool(entry.get("optional", false)):
			continue
		total += 1
		if is_unit_complete(state, String(entry["id"])):
			completed += 1
	return {"completed": completed, "total": total,
		"pct": float(completed) / float(total) * 100.0 if total > 0 else 0.0}


static func mark_section_read(state: Dictionary, unit_id: String, section_id: String,
		day: int) -> Dictionary:
	var entry := unit(unit_id)
	if entry.is_empty():
		return {"ok": false, "error": "academy.unitUnknown"}
	if section(unit_id, section_id).is_empty():
		return {"ok": false, "error": "academy.sectionUnknown"}
	var progress := ensure_unit(state, unit_id)
	var xp_gained := 0
	if not bool(progress["sectionsRead"].get(section_id, false)):
		progress["sectionsRead"][section_id] = true
		xp_gained += award_xp(state, "section:%s.%s" % [unit_id, section_id], XP_SECTION)
	var completion := _evaluate_completion(state, entry, day)
	return {"ok": true, "xpGained": xp_gained + int(completion.get("xpGained", 0)),
		"completed": bool(completion.get("completed", false))}


static func record_practice(state: Dictionary, unit_id: String, day: int) -> Dictionary:
	var entry := unit(unit_id)
	if entry.is_empty():
		return {"ok": false}
	var progress := ensure_unit(state, unit_id)
	if bool(progress["practiceDone"]):
		return {"ok": true, "already": true, "xpGained": 0, "completed": false}
	progress["practiceDone"] = true
	var xp_gained := award_xp(state, "practice:%s" % unit_id, XP_PRACTICE)
	var completion := _evaluate_completion(state, entry, day)
	return {"ok": true, "already": false,
		"xpGained": xp_gained + int(completion.get("xpGained", 0)),
		"completed": bool(completion.get("completed", false))}


static func record_quiz(state: Dictionary, unit_id: String, score: int,
		day: int) -> Dictionary:
	var entry := unit(unit_id)
	if entry.is_empty():
		return {"ok": false}
	var progress := ensure_unit(state, unit_id)
	progress["quizAttempts"] = int(progress["quizAttempts"]) + 1
	progress["lastScore"] = score
	var previous_best := int(progress["quizBest"] if progress["quizBest"] != null else 0)
	progress["quizBest"] = maxi(previous_best, score)
	var xp_gained := 0
	if score >= PASS_SCORE:
		xp_gained += award_xp(state, "quiz:%s:pass" % unit_id, XP_QUIZ_PASS)
	if score == 100:
		xp_gained += award_xp(state, "quiz:%s:perfect" % unit_id, XP_QUIZ_PERFECT)
	var completion := _evaluate_completion(state, entry, day)
	return {"ok": true, "score": score, "passed": score >= PASS_SCORE,
		"xpGained": xp_gained + int(completion.get("xpGained", 0)),
		"completed": bool(completion.get("completed", false))}


static func _evaluate_completion(state: Dictionary, entry: Dictionary, day: int) -> Dictionary:
	var progress := ensure_unit(state, String(entry["id"]))
	if bool(progress["completed"]):
		return {"completed": false, "justCompleted": false, "xpGained": 0}
	var sections: Array = entry.get("sections", [])
	var all_read := true
	for section_entry in sections:
		if not bool(progress["sectionsRead"].get(String(section_entry["id"]), false)):
			all_read = false
			break
	var quiz_passed := int(progress["quizBest"] if progress["quizBest"] != null else 0) \
		>= int(entry.get("quiz", {}).get("passScore", PASS_SCORE))
	if not (all_read and bool(progress["practiceDone"]) and quiz_passed):
		return {"completed": false, "justCompleted": false, "xpGained": 0}
	progress["completed"] = true
	progress["completedDay"] = day
	var xp_gained := award_xp(state, "unit:%s:complete" % String(entry["id"]),
		XP_UNIT_COMPLETE)
	return {"completed": true, "justCompleted": true, "xpGained": xp_gained}


# ---------------------------------------------------------------------------
# Practice
# ---------------------------------------------------------------------------

static func evaluate_practice(state: Dictionary, entry: Dictionary,
		snapshot: Dictionary) -> Dictionary:
	var task: Dictionary = entry.get("practice", {})
	if task.is_empty():
		return {"done": false, "current": 0, "target": 0}
	var target := int(task.get("target", 1))
	var check := String(task.get("check", ""))
	var trades: Array = snapshot.get("trades", [])
	var orders: Array = snapshot.get("orders", [])
	match check:
		"inspect-companies":
			var current := int(state["inspectedTickers"].size())
			return {"done": current >= target, "current": mini(current, target), "target": target}
		"buy-under-budget":
			for trade in trades:
				if String(trade.get("action", "")) == "openLong" \
						and float(trade.get("qty", 0)) * float(trade.get("price", 0.0)) <= float(target):
					return {"done": true, "current": 1, "target": 1}
			return {"done": false, "current": 0, "target": 1}
		"round-trip":
			for trade in trades:
				if String(trade.get("action", "")) == "closeLong":
					return {"done": true, "current": 1, "target": 1}
			return {"done": false, "current": 0, "target": 1}
		"limit-fill":
			var resting := false
			for order in orders:
				if String(order.get("status", "")) == "open" and String(order.get("type", "")) == "limit" \
						and String(order.get("side", "")) == "buy":
					resting = true
				if String(order.get("status", "")) == "filled" \
						and String(order.get("type", "")) == "limit" \
						and String(order.get("side", "")) == "buy" \
						and float(order.get("refPrice", 0.0)) > 0.0 \
						and float(order.get("limitPrice", 0.0)) < float(order.get("refPrice", 0.0)):
					return {"done": true, "current": 1, "target": 1, "resting": resting}
			return {"done": false, "current": 0, "target": 1, "resting": resting}
		"inspect-dividend":
			var dividend_count := 0
			for ticker in state["inspectedTickers"]:
				var company := SmaCompanyCatalog.get_company(String(ticker))
				if float(company.get("financials", {}).get("dividendPerShare", 0.0)) > 0.0:
					dividend_count += 1
			return {"done": dividend_count >= target,
				"current": mini(dividend_count, target), "target": target}
		"inspect-styles":
			var styles := {}
			for ticker in state["inspectedTickers"]:
				var style := _style_of(String(ticker))
				if style != "":
					styles[style] = true
			return {"done": styles.size() >= target,
				"current": mini(styles.size(), target), "target": target}
		"diversify-sectors":
			var positions: Dictionary = snapshot.get("positions", {})
			var sectors := {}
			for ticker in positions.keys():
				if int(positions[ticker].get("qty", 0)) <= 0:
					continue
				var company := SmaCompanyCatalog.get_company(String(ticker))
				if not company.is_empty():
					sectors[String(company.get("sector", ""))] = true
			return {"done": sectors.size() >= target,
				"current": mini(sectors.size(), target), "target": target}
		"hold-days":
			var current_day := int(snapshot.get("day", 0))
			var positions2: Dictionary = snapshot.get("positions", {})
			var longest := 0
			for ticker in positions2.keys():
				if int(positions2[ticker].get("qty", 0)) <= 0:
					continue
				for trade in trades:
					if String(trade.get("action", "")) != "openLong" \
							or String(trade.get("ticker", "")) != String(ticker):
						continue
					longest = maxi(longest, current_day - int(trade.get("day", current_day)))
			return {"done": longest >= target, "current": mini(longest, target), "target": target}
		"demo":
			var demo_id := String(task.get("demoId", ""))
			var completed := bool(state.get("demosCompleted", {}).get(demo_id, false))
			return {"done": completed, "current": 1 if completed else 0, "target": 1}
		"advanced-inspect":
			var viewed: Array = state.get("financialsViewed", [])
			return {"done": viewed.size() >= target,
				"current": mini(viewed.size(), target), "target": target}
		"short-round-trip":
			var opened := false
			var covered := false
			for trade in trades:
				var action := String(trade.get("action", ""))
				if action == "openShort":
					opened = true
				elif action == "closeShort":
					covered = true
			return {"done": opened and covered,
				"current": (1 if opened else 0) + (1 if covered else 0), "target": 2}
		"stop-fill":
			var matched := false
			for order in orders:
				if String(order.get("status", "")) != "filled":
					continue
				var order_type := String(order.get("type", ""))
				var triggered_from := String(order.get("triggeredFrom", ""))
				if order_type == "stop" or order_type == "trailing" \
						or triggered_from == "stop" or triggered_from == "trailing":
					matched = true
					break
			return {"done": matched, "current": 1 if matched else 0, "target": 1}
		"option-buy":
			var bought := false
			for trade in snapshot.get("optionTrades", []):
				if String(trade.get("side", "")) == "buy":
					bought = true
					break
			return {"done": bought, "current": 1 if bought else 0, "target": 1}
		"option-buy-type":
			var wanted := String(task.get("optionType", ""))
			var matched_type := false
			for trade in snapshot.get("optionTrades", []):
				if String(trade.get("side", "")) == "buy" \
						and String(trade.get("optionType", "")) == wanted:
					matched_type = true
					break
			return {"done": matched_type, "current": 1 if matched_type else 0, "target": 1}
		"option-sell":
			var sold := false
			for trade in snapshot.get("optionTrades", []):
				if String(trade.get("side", "")) == "sell":
					sold = true
					break
			return {"done": sold, "current": 1 if sold else 0, "target": 1}
		"income-strategy":
			var option_positions: Array = snapshot.get("options", [])
			var stock_positions: Dictionary = snapshot.get("positions", {})
			var cash := float(snapshot.get("cash", 0.0))
			var covered := false
			for position in option_positions:
				if String(position.get("type", "")) != "call" \
						or int(position.get("qty", 0)) >= 0:
					continue
				var stock: Dictionary = stock_positions.get(
					String(position.get("ticker", "")), {})
				var shares := absi(int(stock.get("qty", 0)))
				if shares >= -int(position.get("qty", 0)) * SmaOptions.CONTRACT_SIZE:
					covered = true
					break
			var secured_put := false
			for position in option_positions:
				if String(position.get("type", "")) != "put" \
						or int(position.get("qty", 0)) >= 0:
					continue
				var needed := float(position.get("strike", 0.0)) \
					* SmaOptions.CONTRACT_SIZE * -int(position.get("qty", 0))
				if cash >= needed:
					secured_put = true
					break
			var income_done := covered or secured_put
			return {"done": income_done, "current": 1 if income_done else 0, "target": 1}
		"vertical-spread":
			var has_spread := false
			for option_type in ["call", "put"]:
				var by_expiry := {}
				for position in snapshot.get("options", []):
					if String(position.get("type", "")) != option_type:
						continue
					var expiry := int(position.get("expiryDay", 0))
					var grouped: Dictionary = by_expiry.get(expiry, {"long": [], "short": []})
					var qty := int(position.get("qty", 0))
					if qty > 0:
						grouped["long"].append(float(position.get("strike", 0.0)))
					elif qty < 0:
						grouped["short"].append(float(position.get("strike", 0.0)))
					by_expiry[expiry] = grouped
				for grouped in by_expiry.values():
					var longs: Array = grouped["long"]
					var shorts: Array = grouped["short"]
					if longs.is_empty() or shorts.is_empty():
						continue
					longs.sort()
					shorts.sort()
					if absf(float(longs[0]) - float(shorts[0])) > 0.000001:
						has_spread = true
						break
				if has_spread:
					break
			return {"done": has_spread, "current": 1 if has_spread else 0, "target": 1}
		"volatility-long":
			var combos := {}
			for position in snapshot.get("options", []):
				if int(position.get("qty", 0)) <= 0:
					continue
				var expiry := int(position.get("expiryDay", 0))
				var types: Dictionary = combos.get(expiry, {})
				types[String(position.get("type", ""))] = true
				combos[expiry] = types
			var long_vol := false
			for types in combos.values():
				if bool(types.get("call", false)) and bool(types.get("put", false)):
					long_vol = true
					break
			return {"done": long_vol, "current": 1 if long_vol else 0, "target": 1}
		"futures-trade":
			var opened_future := false
			for trade in snapshot.get("futuresTrades", []):
				if String(trade.get("action", "")) == "open":
					opened_future = true
					break
			return {"done": opened_future, "current": 1 if opened_future else 0, "target": 1}
		"hedge-position":
			var has_long_stock := false
			for ticker in snapshot.get("positions", {}).keys():
				if int(snapshot["positions"][ticker].get("qty", 0)) > 0:
					has_long_stock = true
					break
			var has_short_future := false
			for position in snapshot.get("futures", []):
				if String(position.get("side", "")) == "short" \
						and int(position.get("qty", 0)) > 0:
					has_short_future = true
					break
			var hedged := has_long_stock and has_short_future
			return {"done": hedged,
				"current": (1 if has_long_stock else 0) + (1 if has_short_future else 0),
				"target": 2}
		"graduation":
			var stock_done: bool = not snapshot.get("trades", []).is_empty()
			var option_done: bool = not snapshot.get("optionTrades", []).is_empty()
			var futures_done: bool = not snapshot.get("futuresTrades", []).is_empty()
			return {"done": stock_done and option_done and futures_done,
				"current": (1 if stock_done else 0) + (1 if option_done else 0)
					+ (1 if futures_done else 0),
				"target": 3}
	return {"done": false, "current": 0, "target": target}


## Maps the Godot simulation's stage/sector metadata onto the academy's six
## teaching styles. This is a pedagogical label, not a real market factor.
static func style_of(ticker: String) -> String:
	return _style_of(ticker)


static func _style_of(ticker: String) -> String:
	var company := SmaCompanyCatalog.get_company(ticker)
	if company.is_empty():
		return ""
	var stage := String(company.get("stage", ""))
	var sector := String(company.get("sector", ""))
	var financials: Dictionary = company.get("financials", {})
	if stage == "early" or String(company.get("risk", "")) == "veryHigh":
		return "speculative"
	if stage == "highGrowth" or stage == "growth":
		return "growth"
	if stage == "turnaround":
		return "value"
	if stage == "mature":
		var price := float(company.get("price", 0.0))
		var dps := float(financials.get("dividendPerShare", 0.0))
		if price > 0.0 and dps / price >= 0.025:
			return "dividend"
		if ["energy", "materials", "industrials"].has(sector):
			return "cyclical"
		return "bluechip"
	return "bluechip"


static func sync_practice(state: Dictionary, snapshot: Dictionary, day: int) -> Array:
	var completed: Array = []
	for entry in units():
		var unit_id := String(entry["id"])
		if not is_unit_unlocked(state, unit_id):
			continue
		var progress := ensure_unit(state, unit_id)
		if bool(progress["practiceDone"]):
			continue
		var result := evaluate_practice(state, entry, snapshot)
		if not bool(result["done"]):
			continue
		var outcome := record_practice(state, unit_id, day)
		completed.append({"unitId": unit_id, "xpGained": int(outcome.get("xpGained", 0)),
			"completed": bool(outcome.get("completed", false))})
	return completed


static func record_inspection(state: Dictionary, ticker: String) -> bool:
	var symbol := ticker.to_upper()
	if state["inspectedTickers"].has(symbol):
		return false
	state["inspectedTickers"].append(symbol)
	return true


static func record_glossary_visit(state: Dictionary, term_id: String) -> bool:
	if state["glossaryOpened"].has(term_id):
		return false
	state["glossaryOpened"].append(term_id)
	return true


static func record_demo_completed(state: Dictionary, demo_id: String) -> bool:
	if String(demo_id) == "" or bool(state["demosCompleted"].get(demo_id, false)):
		return false
	state["demosCompleted"][demo_id] = true
	return true


static func record_financials_viewed(state: Dictionary, ticker: String) -> bool:
	var symbol := ticker.to_upper()
	if symbol == "" or state["financialsViewed"].has(symbol):
		return false
	state["financialsViewed"].append(symbol)
	return true


# ---------------------------------------------------------------------------
# Quiz
# ---------------------------------------------------------------------------

static func build_quiz(unit_id: String, attempt: int = 1) -> Dictionary:
	var raw_questions: Array = catalog().get("quizzes", {}).get(unit_id, [])
	if raw_questions.is_empty():
		return {}
	var rng := SmaRng.new("quiz:%s:%d" % [unit_id, attempt])
	var questions: Array = []
	for raw in raw_questions:
		var question: Dictionary = raw.duplicate(true)
		if String(question.get("type", "")) == "numeric":
			question.merge(_numeric_question(String(question.get("numericKind", "")), rng), true)
		else:
			question["options"] = rng.shuffled(question.get("options", []))
		questions.append(question)
	return {"unitId": unit_id, "attempt": attempt, "questions": questions,
		"passScore": PASS_SCORE}


static func _numeric_question(kind: String, rng: SmaRng) -> Dictionary:
	match kind:
		"u1-q3":
			var price := roundf(rng.range_float(18.0, 92.0) * 2.0) / 2.0
			var shares := rng.rand_int(40, 400)
			var answer := price * shares
			return {"params": {"price": price, "shares": shares},
				"paramKinds": {"price": "money", "shares": "integer"},
				"answer": answer, "tolerance": maxf(0.5, answer * 0.01),
				"answerFormat": "millions"}
		"u2-q2":
			var price2 := float(rng.pick([7.9, 12.4, 17.5, 23.8, 31.2, 45.6, 58.4]))
			return {"params": {"cash": 1000.0, "price": price2, "fee": 1.0},
				"paramKinds": {"cash": "money", "price": "money", "fee": "money"},
				"answer": floor(999.0 / price2), "tolerance": 0.0, "answerFormat": "integer"}
		"u2-q6":
			var bid3 := SmaFormat.round_to(rng.range_float(20.0, 80.0), 2)
			var ask3 := SmaFormat.round_to(bid3 + rng.range_float(0.02, 0.15), 2)
			var qty3 := rng.rand_int(20, 200)
			return {"params": {"bid": bid3, "ask": ask3, "qty": qty3},
				"paramKinds": {"bid": "money", "ask": "money", "qty": "integer"},
				"answer": SmaFormat.round_to((ask3 - bid3) * qty3, 2),
				"tolerance": 0.02, "answerFormat": "money"}
		"u3-q2":
			var n1 := rng.rand_int(10, 40)
			var n2 := rng.rand_int(10, 40)
			var p1 := SmaFormat.round_to(rng.range_float(20.0, 60.0), 2)
			var p2 := SmaFormat.round_to(rng.range_float(20.0, 60.0), 2)
			return {"params": {"n1": n1, "n2": n2, "p1": p1, "p2": p2},
				"paramKinds": {"n1": "integer", "n2": "integer", "p1": "money", "p2": "money"},
				"answer": (n1 * p1 + n2 * p2) / float(n1 + n2),
				"tolerance": 0.02, "answerFormat": "money"}
		"u3-q3":
			var qty4 := rng.rand_int(20, 100)
			var buy := SmaFormat.round_to(rng.range_float(20.0, 60.0), 2)
			var sell := SmaFormat.round_to(buy + rng.range_float(1.0, 10.0), 2)
			return {"params": {"qty": qty4, "buy": buy, "sell": sell, "fee": 1.0},
				"paramKinds": {"qty": "integer", "buy": "money", "sell": "money", "fee": "money"},
				"answer": SmaFormat.round_to(qty4 * (sell - buy) - 2.0, 2),
				"tolerance": 0.02, "answerFormat": "money"}
		"u4-q2":
			var limit := SmaFormat.round_to(rng.range_float(15.0, 70.0), 2)
			return {"params": {"limit": limit, "qty": 100, "fee": 1.0},
				"paramKinds": {"limit": "money", "qty": "integer", "fee": "money"},
				"answer": SmaFormat.round_to(100.0 * limit + 1.0, 2),
				"tolerance": 0.02, "answerFormat": "money"}
		"u4-q6":
			var bid6 := SmaFormat.round_to(rng.range_float(20.0, 80.0), 2)
			var ask6 := SmaFormat.round_to(bid6 + rng.range_float(0.03, 0.18), 2)
			return {"params": {"bid": bid6, "ask": ask6, "qty": 50},
				"paramKinds": {"bid": "money", "ask": "money", "qty": "integer"},
				"answer": SmaFormat.round_to((ask6 - bid6) * 50.0, 2),
				"tolerance": 0.02, "answerFormat": "money"}
		"u5-q2":
			var qty5 := int(roundf(rng.range_float(50.0, 400.0) / 10.0)) * 10
			var per_share := SmaFormat.round_to(rng.range_float(0.2, 1.2), 2)
			return {"params": {"qty": qty5, "perShare": per_share},
				"paramKinds": {"qty": "integer", "perShare": "money"},
				"answer": SmaFormat.round_to(qty5 * per_share, 2),
				"tolerance": 0.02, "answerFormat": "money"}
		"u5-q6":
			var price5 := SmaFormat.round_to(rng.range_float(20.0, 90.0), 2)
			var annual5 := SmaFormat.round_to(rng.range_float(0.6, 3.6), 2)
			return {"params": {"price": price5, "annual": annual5},
				"paramKinds": {"price": "money", "annual": "money"},
				"answer": SmaFormat.round_to(annual5 / price5 * 100.0, 2),
				"tolerance": 0.03, "answerFormat": "percent"}
		"u7-q4":
			var weight7 := float(roundf(rng.range_float(50.0, 80.0)))
			var r1 := roundf(rng.range_float(4.0, 18.0) * 10.0) / 10.0
			var r2 := roundf(rng.range_float(-12.0, 3.0) * 10.0) / 10.0
			return {"params": {"weight": weight7, "r1": r1, "r2": r2},
				"paramKinds": {"weight": "number", "r1": "percent", "r2": "percent"},
				"answer": SmaFormat.round_to(weight7 * r1 + (100.0 - weight7) * r2, 2),
				"tolerance": 0.05, "answerFormat": "percent"}
		"u8-q2":
			var principal8 := roundf(rng.range_float(500.0, 3000.0) / 100.0) * 100.0
			var rate8 := roundf(rng.range_float(4.0, 12.0) * 10.0) / 10.0
			var years8 := roundf(rng.range_float(2.0, 5.0))
			var answer8 := principal8 * pow(1.0 + rate8 / 100.0, years8)
			return {"params": {"principal": principal8, "rate": rate8, "years": years8},
				"paramKinds": {"principal": "money", "rate": "percent", "years": "number"},
				"answer": SmaFormat.round_to(answer8, 2),
				"tolerance": 0.02, "answerFormat": "money"}
		"u9-q4":
			var open9 := roundf(rng.range_float(20.0, 80.0) * 100.0) / 100.0
			var close9 := roundf((open9 + rng.range_float(-3.0, 3.0)) * 100.0) / 100.0
			return {"params": {"open": open9, "close": close9},
				"paramKinds": {"open": "money", "close": "money"},
				"answer": absf(close9 - open9), "tolerance": 0.02, "answerFormat": "money"}
		"u10-q4":
			var base10 := roundf(rng.range_float(10.0, 60.0) * 100.0) / 100.0
			var p1 := base10
			var p2 := base10 + 2.0
			var p3 := base10 + 4.0
			return {"params": {"p1": p1, "p2": p2, "p3": p3},
				"paramKinds": {"p1": "money", "p2": "money", "p3": "money"},
				"answer": SmaFormat.round_to((p1 + p2 + p3) / 3.0, 2),
				"tolerance": 0.02, "answerFormat": "money"}
		"u11-q4":
			var revenue11 := float(roundf(rng.range_float(500.0, 3000.0) / 10.0) * 10.0)
			var cogs11 := roundf(revenue11 * rng.range_float(0.4, 0.7))
			return {"params": {"revenue": revenue11, "cogs": cogs11},
				"paramKinds": {"revenue": "millions", "cogs": "millions"},
				"answer": revenue11 - cogs11, "tolerance": 1.0, "answerFormat": "millions"}
		"u12-q4":
			var fcf12 := float(roundf(rng.range_float(50.0, 500.0) / 10.0) * 10.0)
			var discount12 := roundf(rng.range_float(8.0, 15.0) * 10.0) / 10.0
			return {"params": {"fcf": fcf12, "discount": discount12},
				"paramKinds": {"fcf": "millions", "discount": "percent"},
				"answer": SmaFormat.round_to(fcf12 / (1.0 + discount12 / 100.0), 2),
				"tolerance": 0.05, "answerFormat": "millions"}
		"u14-q4":
			var stock14 := float(roundf(rng.range_float(40.0, 80.0)))
			var stock_return14 := roundf(rng.range_float(6.0, 18.0) * 10.0) / 10.0
			var bond_return14 := roundf(rng.range_float(1.0, 5.0) * 10.0) / 10.0
			return {"params": {"stock": stock14, "stockReturn": stock_return14,
					"bondReturn": bond_return14},
				"paramKinds": {"stock": "number", "stockReturn": "percent",
					"bondReturn": "percent"},
				"answer": SmaFormat.round_to(
					stock14 * stock_return14 + (100.0 - stock14) * bond_return14, 2),
				"tolerance": 0.05, "answerFormat": "percent"}
		"u15-q4":
			var account15 := float(roundf(rng.range_float(5000.0, 20000.0) / 100.0) * 100.0)
			var risk15 := roundf(rng.range_float(0.5, 2.0) * 10.0) / 10.0
			var entry15 := roundf(rng.range_float(20.0, 80.0) * 100.0) / 100.0
			var stop15 := roundf((entry15 - rng.range_float(2.0, 8.0)) * 100.0) / 100.0
			var per_share15 := maxf(0.01, entry15 - stop15)
			return {"params": {"account": account15, "risk": risk15,
					"entry": entry15, "stop": stop15},
				"paramKinds": {"account": "money", "risk": "percent",
					"entry": "money", "stop": "money"},
				"answer": floorf(account15 * risk15 / 100.0 / per_share15),
				"tolerance": 0.0, "answerFormat": "integer"}
		"u17-q4":
			var qty17 := float(roundf(rng.range_float(10.0, 50.0)))
			var entry17 := roundf(rng.range_float(30.0, 90.0) * 100.0) / 100.0
			var exit17 := roundf((entry17 - rng.range_float(3.0, 15.0)) * 100.0) / 100.0
			return {"params": {"qty": qty17, "entry": entry17, "exit": exit17},
				"paramKinds": {"qty": "integer", "entry": "money", "exit": "money"},
				"answer": SmaFormat.round_to((entry17 - exit17) * qty17, 2),
				"tolerance": 0.05, "answerFormat": "money"}
		"u18-q4":
			var debit18 := float(roundf(rng.range_float(2000.0, 20000.0) / 100.0) * 100.0)
			return {"params": {"debit": debit18}, "paramKinds": {"debit": "money"},
				"answer": SmaFormat.round_to(debit18 * 0.08 / 252.0, 2),
				"tolerance": 0.02, "answerFormat": "money"}
		"u19-q4":
			var entry19 := roundf(rng.range_float(40.0, 150.0) * 100.0) / 100.0
			var trail19 := roundf(rng.range_float(3.0, 12.0) * 100.0) / 100.0
			return {"params": {"entry": entry19, "trail": trail19},
				"paramKinds": {"entry": "money", "trail": "money"},
				"answer": SmaFormat.round_to(entry19 - trail19, 2),
				"tolerance": 0.02, "answerFormat": "money"}
		"u20-q4":
			var best20 := roundf(rng.range_float(20.0, 90.0) * 100.0) / 100.0
			var size1_20 := float(roundf(rng.range_float(100.0, 400.0) / 10.0) * 10.0)
			var size2_20 := float(roundf(rng.range_float(100.0, 400.0) / 10.0) * 10.0)
			var qty20 := size1_20 + floorf(size2_20 / 2.0)
			var second20 := roundf((best20 + 0.05) * 100.0) / 100.0
			var notional20 := size1_20 * best20 + floorf(size2_20 / 2.0) * second20
			return {"params": {"best": best20, "size1": size1_20,
					"size2": size2_20, "qty": qty20, "second": second20},
				"paramKinds": {"best": "money", "size1": "integer",
					"size2": "integer", "qty": "integer", "second": "money"},
				"answer": SmaFormat.round_to(notional20 / qty20, 2),
				"tolerance": 0.02, "answerFormat": "money"}
		"u21-q4":
			var strike21 := roundf(rng.range_float(20.0, 80.0) * 100.0) / 100.0
			var spot21 := roundf((strike21 + rng.range_float(2.0, 15.0)) * 100.0) / 100.0
			return {"params": {"spot": spot21, "strike": strike21},
				"paramKinds": {"spot": "money", "strike": "money"},
				"answer": SmaFormat.round_to(maxf(0.0, spot21 - strike21), 2),
				"tolerance": 0.02, "answerFormat": "money"}
		"u22-q4":
			var strike22 := roundf(rng.range_float(20.0, 80.0) * 100.0) / 100.0
			var premium22 := roundf(rng.range_float(0.5, 5.0) * 100.0) / 100.0
			return {"params": {"strike": strike22, "premium": premium22},
				"paramKinds": {"strike": "money", "premium": "money"},
				"answer": SmaFormat.round_to(strike22 + premium22, 2),
				"tolerance": 0.02, "answerFormat": "money"}
		"u23-q4":
			var strike23 := roundf(rng.range_float(30.0, 90.0) * 100.0) / 100.0
			var premium23 := roundf(rng.range_float(0.5, 5.0) * 100.0) / 100.0
			return {"params": {"strike": strike23, "premium": premium23},
				"paramKinds": {"strike": "money", "premium": "money"},
				"answer": SmaFormat.round_to(strike23 - premium23, 2),
				"tolerance": 0.02, "answerFormat": "money"}
		"u24-q4":
			var strike24 := roundf(rng.range_float(20.0, 70.0) * 100.0) / 100.0
			var spot24 := roundf((strike24 + rng.range_float(2.0, 12.0)) * 100.0) / 100.0
			var intrinsic24 := SmaFormat.round_to(spot24 - strike24, 2)
			var premium24 := roundf((intrinsic24 + rng.range_float(0.5, 4.0)) * 100.0) / 100.0
			return {"params": {"spot": spot24, "strike": strike24, "premium": premium24},
				"paramKinds": {"spot": "money", "strike": "money", "premium": "money"},
				"answer": SmaFormat.round_to(premium24 - intrinsic24, 2),
				"tolerance": 0.02, "answerFormat": "money"}
		"u25-q4":
			var strike25 := roundf(rng.range_float(20.0, 80.0) * 100.0) / 100.0
			var spot25 := roundf((strike25 + rng.range_float(0.0, 12.0)) * 100.0) / 100.0
			var premium25 := roundf(rng.range_float(1.0, 5.0) * 100.0) / 100.0
			return {"params": {"strike": strike25, "spot": spot25, "premium": premium25},
				"paramKinds": {"strike": "money", "spot": "money", "premium": "money"},
				"answer": SmaFormat.round_to(
					(premium25 - maxf(0.0, spot25 - strike25)) * 100.0, 2),
				"tolerance": 0.02, "answerFormat": "money"}
		"u26-q4":
			var strike26 := roundf(rng.range_float(30.0, 90.0) * 100.0) / 100.0
			var premium26 := roundf(rng.range_float(1.0, 5.0) * 100.0) / 100.0
			return {"params": {"strike": strike26, "premium": premium26},
				"paramKinds": {"strike": "money", "premium": "money"},
				"answer": SmaFormat.round_to((strike26 - premium26) * 100.0, 2),
				"tolerance": 0.02, "answerFormat": "money"}
		"u27-q4":
			var width27 := float(roundf(rng.range_float(2.0, 8.0)) * 5.0)
			var debit27 := roundf(rng.range_float(1.0, 3.0) * 100.0) / 100.0
			return {"params": {"width": width27, "debit": debit27},
				"paramKinds": {"width": "number", "debit": "money"},
				"answer": SmaFormat.round_to((width27 - debit27) * 100.0, 2),
				"tolerance": 0.05, "answerFormat": "money"}
		"u28-q4":
			var strike28 := roundf(rng.range_float(20.0, 70.0) * 100.0) / 100.0
			var call_premium28 := roundf(rng.range_float(1.0, 4.0) * 100.0) / 100.0
			var put_premium28 := roundf(rng.range_float(1.0, 4.0) * 100.0) / 100.0
			return {"params": {"strike": strike28, "callPremium": call_premium28,
					"putPremium": put_premium28},
				"paramKinds": {"strike": "money", "callPremium": "money",
					"putPremium": "money"},
				"answer": SmaFormat.round_to(
					strike28 + call_premium28 + put_premium28, 2),
				"tolerance": 0.02, "answerFormat": "money"}
		"u29-q4":
			var entry29 := roundf(rng.range_float(30.0, 80.0) * 100.0) / 100.0
			var exit29 := roundf((entry29 + rng.range_float(-8.0, 8.0)) * 100.0) / 100.0
			var qty29 := float(roundf(rng.range_float(1.0, 4.0)))
			return {"params": {"entry": entry29, "exit": exit29, "qty": qty29},
				"paramKinds": {"entry": "money", "exit": "money", "qty": "integer"},
				"answer": SmaFormat.round_to((exit29 - entry29) * qty29 * 100.0, 2),
				"tolerance": 0.05, "answerFormat": "money"}
		"u30-q4":
			var price30 := roundf(rng.range_float(20.0, 80.0) * 100.0) / 100.0
			var shares30 := float(roundf(rng.range_float(2.0, 8.0))) * 100.0
			return {"params": {"price": price30, "shares": shares30},
				"paramKinds": {"price": "money", "shares": "integer"},
				"answer": shares30 / 100.0, "tolerance": 0.0, "answerFormat": "integer"}
		"u31-q4":
			var equity31 := float(roundf(rng.range_float(5000.0, 20000.0) / 100.0) * 100.0)
			var leverage31 := roundf(rng.range_float(2.0, 5.0) * 10.0) / 10.0
			var shock31 := float(roundf(rng.range_float(10.0, 30.0)))
			return {"params": {"equity": equity31, "leverage": leverage31, "shock": shock31},
				"paramKinds": {"equity": "money", "leverage": "number", "shock": "percent"},
				"answer": SmaFormat.round_to(equity31 * leverage31 * shock31 / 100.0, 2),
				"tolerance": 0.0, "answerFormat": "money"}
		"u32-q4":
			var account32 := float(roundf(rng.range_float(10000.0, 50000.0) / 100.0) * 100.0)
			var risk32 := roundf(rng.range_float(1.0, 3.0) * 10.0) / 10.0
			var entry32 := roundf(rng.range_float(20.0, 80.0) * 100.0) / 100.0
			var stop32 := roundf((entry32 - rng.range_float(2.0, 8.0)) * 100.0) / 100.0
			var per_share32 := maxf(0.01, entry32 - stop32)
			return {"params": {"account": account32, "risk": risk32,
					"entry": entry32, "stop": stop32},
				"paramKinds": {"account": "money", "risk": "percent",
					"entry": "money", "stop": "money"},
				"answer": floorf(account32 * risk32 / 100.0 / per_share32),
				"tolerance": 0.0, "answerFormat": "integer"}
	return {"params": {}, "paramKinds": {}, "answer": 0, "tolerance": 0.0,
		"answerFormat": "number"}


static func formatted_params(question: Dictionary) -> Dictionary:
	var out := {}
	var params: Dictionary = question.get("params", {})
	var kinds: Dictionary = question.get("paramKinds", {})
	for key in params.keys():
		var value := float(params[key])
		var kind := String(kinds.get(key, "number"))
		if kind == "money":
			out[key] = SmaFormat.money(value)
		elif kind == "integer":
			out[key] = SmaFormat.num(value, 0)
		else:
			out[key] = SmaFormat.num(value, 2)
	return out


static func grade_quiz(session: Dictionary, answers: Dictionary) -> Dictionary:
	var details: Array = []
	var correct_count := 0
	for question in session.get("questions", []):
		var question_id := String(question["id"])
		var given: Variant = answers.get(question_id, null)
		var correct := false
		var expected: Variant = question.get("correctIds", [])
		if String(question["type"]) == "numeric":
			var parsed := float(given) if given != null and str(given) != "" else NAN
			expected = question.get("answer", 0.0)
			correct = is_finite(parsed) \
				and absf(parsed - float(expected)) <= float(question.get("tolerance", 0.01))
		elif String(question["type"]) == "multi":
			var selected: Array = given if typeof(given) == TYPE_ARRAY else []
			correct = _same_set(selected, question.get("correctIds", []))
		else:
			expected = question.get("correctIds", [])
			correct = given != null and str(given) == str(expected[0] if not expected.is_empty() else "")
		if correct:
			correct_count += 1
		details.append({"id": question_id, "type": String(question["type"]),
			"correct": correct, "given": given, "expected": expected,
			"explainKey": String(question.get("explainKey", "")),
			"promptKey": String(question.get("promptKey", "")),
			"options": question.get("options", []), "params": question.get("params", {}),
			"paramKinds": question.get("paramKinds", {})})
	var total := int(session.get("questions", []).size())
	var score := int(round(float(correct_count) / float(total) * 100.0)) if total > 0 else 0
	return {"score": score, "correctCount": correct_count, "total": total,
		"passed": score >= int(session.get("passScore", PASS_SCORE)),
		"perfect": score == 100, "details": details}


static func _same_set(left: Array, right: Array) -> bool:
	if left.size() != right.size():
		return false
	var a := left.duplicate()
	var b := right.duplicate()
	a.sort()
	b.sort()
	for index in a.size():
		if str(a[index]) != str(b[index]):
			return false
	return true


# ---------------------------------------------------------------------------
# Achievements and unlocks
# ---------------------------------------------------------------------------

static func evaluate_achievements(state: Dictionary, snapshot: Dictionary) -> Array:
	var unlocked: Array = []
	var checks := {
		"observer": state["inspectedTickers"].size() >= 2,
		"firstTrade": snapshot.get("trades", []).size() > 0,
		"firstPractice": _any_practice_done(state),
		"academyInitiate": is_unit_complete(state, "u1"),
		"quizAce": _has_perfect_quiz(state),
		"limitMaster": _has_filled_limit(snapshot.get("orders", [])),
		"bilingual": bool(state["languageSwitched"]),
		"glossaryExplorer": state["glossaryOpened"].size() >= 3,
		"stageOneGraduate": _all_stage_one_complete(state),
	}
	for achievement_id in checks.keys():
		if bool(checks[achievement_id]) and not state["achievements"].has(achievement_id):
			state["achievements"].append(achievement_id)
			unlocked.append(achievement_id)
	return unlocked


static func _any_practice_done(state: Dictionary) -> bool:
	for progress in state["units"].values():
		if bool(progress.get("practiceDone", false)):
			return true
	return false


static func _has_perfect_quiz(state: Dictionary) -> bool:
	for progress in state["units"].values():
		if progress.get("quizBest") != null and int(progress["quizBest"]) == 100:
			return true
	return false


static func _has_filled_limit(orders: Array) -> bool:
	for order in orders:
		if String(order.get("status", "")) == "filled" and String(order.get("type", "")) == "limit":
			return true
	return false


static func _all_stage_one_complete(state: Dictionary) -> bool:
	for unit_id in ["u1", "u2", "u3", "u4"]:
		if not is_unit_complete(state, unit_id):
			return false
	return true


static func is_tool_unlocked(state: Dictionary, tool_id: String) -> bool:
	var rule: Dictionary = TOOL_RULES.get(tool_id, {})
	if rule.is_empty():
		return true
	var required_unit := String(rule.get("unitId", ""))
	# Tools whose lessons are not ported yet stay available instead of becoming
	# permanently dead UI.
	if unit(required_unit).is_empty():
		return true
	if rule.has("sectionId"):
		return is_section_read(state, required_unit, String(rule["sectionId"]))
	return is_unit_complete(state, required_unit)


static func achievement_title_key(achievement_id: String) -> String:
	return "achievement.%s.title" % achievement_id


static func achievement_desc_key(achievement_id: String) -> String:
	return "achievement.%s.desc" % achievement_id
