extends "res://tests/test_base.gd"


func _answer_for(question: Dictionary) -> Variant:
	if String(question["type"]) == "numeric":
		return float(question.get("answer", 0.0))
	if String(question["type"]) == "multi":
		return question.get("correctIds", [])
	var ids: Array = question.get("correctIds", [])
	return ids[0] if not ids.is_empty() else ""


func run() -> void:
	describe("academy-catalog")
	var catalog := SmaAcademy.catalog()
	eq(catalog.get("units", []).size(), 38, "all eight stages and six branches are ported")
	eq(catalog.get("glossary", []).size(), 85, "glossary carries all terms")
	var total_questions := 0
	for unit_id in ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8",
			"u9", "u10", "u11", "u12", "u13", "u14", "u15", "u16",
			"u17", "u18", "u19", "u20", "u21", "u22", "u23", "u24",
			"u25", "u26", "u27", "u28", "u29", "u30", "u31", "u32",
			"b1", "b2", "b3", "b4", "b5", "b6"]:
		total_questions += catalog.get("quizzes", {}).get(unit_id, []).size()
	eq(total_questions, 174, "thirty-eight units carry one hundred seventy-four questions")

	describe("academy-state")
	var state := SmaAcademy.create_state()
	check(SmaAcademy.is_unit_unlocked(state, "u1"), "u1 starts unlocked")
	check(not SmaAcademy.is_unit_unlocked(state, "u2"), "u2 waits for u1")
	eq(SmaAcademy.progress_rows(state, SmaAcademy.unit("u1"))["read"], 0, "no sections read yet")

	describe("academy-sections")
	var unit := SmaAcademy.unit("u1")
	for section in unit.get("sections", []):
		var result := SmaAcademy.mark_section_read(state, "u1", String(section["id"]), 0)
		check(bool(result.get("ok", false)), "section read accepted")
	var progress := SmaAcademy.progress_rows(state, unit)
	eq(progress["read"], 4, "all four sections read")
	eq(progress["completed"], false, "reading alone does not complete a unit")
	check(int(state["xp"]) > 0, "sections award XP")

	describe("academy-practice")
	SmaAcademy.record_inspection(state, "APLA")
	SmaAcademy.record_inspection(state, "NVDO")
	eq(state["inspectedTickers"].size(), 2, "inspections are deduplicated and recorded")
	var completed := SmaAcademy.sync_practice(state, {"trades": [], "orders": []}, 0)
	var u1_completed := false
	for entry in completed:
		if String(entry["unitId"]) == "u1":
			u1_completed = true
	check(u1_completed, "inspection practice completes u1")
	check(bool(SmaAcademy.ensure_unit(state, "u1")["practiceDone"]), "practice flag set")

	describe("academy-quiz")
	var session := SmaAcademy.build_quiz("u1", 1)
	eq(session["questions"].size(), 6, "quiz session has six questions")
	eq(session["questions"][0]["options"].size() >= 2, true, "single-choice options are present")
	var answers := {}
	for question in session["questions"]:
		answers[String(question["id"])] = _answer_for(question)
	var grade := SmaAcademy.grade_quiz(session, answers)
	eq(grade["score"], 100, "perfect answers score 100")
	eq(grade["passed"], true, "quiz passes")
	var record := SmaAcademy.record_quiz(state, "u1", int(grade["score"]), 0)
	eq(record["completed"], true, "unit completes after read + practice + quiz")
	eq(SmaAcademy.progress_rows(state, unit)["completed"], true, "progress reports completion")
	eq(SmaAcademy.overall_progress(state)["completed"], 1, "overall progress counts the unit")
	eq(SmaAcademy.overall_progress(state)["total"], 32, "overall progress covers every ported stage")

	describe("academy-numeric")
	var q3: Dictionary = {}
	for question in SmaAcademy.build_quiz("u1", 1)["questions"]:
		if String(question["id"]) == "u1-q3":
			q3 = question
	check(not q3.is_empty(), "numeric question exists")
	check(is_finite(float(q3.get("answer", NAN))), "numeric answer generated")
	check(float(q3["tolerance"]) >= 0.5, "numeric tolerance is sensible")
	var typed := SmaAcademy.formatted_params(q3)
	check(typed.has("price") and typed.has("shares"), "numeric prompt params formatted")

	describe("academy-unlocks")
	check(not SmaAcademy.is_tool_unlocked(state, "order.limit"), "limit orders locked before u4 s3")
	SmaAcademy.mark_section_read(state, "u4", "s3", 0)
	check(SmaAcademy.is_tool_unlocked(state, "order.limit"), "reading u4 s3 unlocks limit orders")

	describe("academy-achievements")
	var achievements := SmaAcademy.evaluate_achievements(state, {"trades": [], "orders": []})
	check(achievements.has("observer"), "observer achievement unlocked")
	check(achievements.has("academyInitiate"), "academy initiate achievement unlocked")
	check(achievements.has("quizAce"), "quiz ace achievement unlocked")

	describe("academy-persistence")
	var serialized: Variant = JSON.parse_string(JSON.stringify(state))
	var restored := SmaAcademy.normalize_state(serialized)
	check(SmaAcademy.is_unit_complete(restored, "u1"), "completion survives JSON")
	eq(int(restored["xp"]), int(state["xp"]), "XP survives JSON")
	eq(restored["inspectedTickers"].size(), 2, "inspections survive JSON")

	describe("academy-limit-practice")
	var practice_state := SmaAcademy.create_state()
	var orders := [{
		"status": "filled", "type": "limit", "side": "buy",
		"refPrice": 100.0, "limitPrice": 99.5,
	}]
	var practice := SmaAcademy.evaluate_practice(practice_state, SmaAcademy.unit("u4"),
		{"trades": [], "orders": orders})
	eq(practice["done"], true, "filled limit below reference satisfies the task")

	describe("academy-stage-two")
	var stage_two := SmaAcademy.create_state()
	check(not SmaAcademy.is_unit_unlocked(stage_two, "u5"), "u5 waits for stage one")
	SmaAcademy.ensure_unit(stage_two, "u4")["completed"] = true
	check(SmaAcademy.is_unit_unlocked(stage_two, "u5"), "completing u4 unlocks u5")
	for unit_id in ["u5", "u6", "u7", "u8"]:
		eq(SmaAcademy.unit(unit_id).get("stage", ""), "stage2", "%s belongs to stage two" % unit_id)

	describe("academy-dividend-practice")
	var dividend_state := SmaAcademy.create_state()
	var dividend_tickers: Array[String] = []
	for ticker in SmaCompanyCatalog.load_companies().keys():
		var company: Dictionary = SmaCompanyCatalog.get_company(String(ticker))
		if float(company.get("financials", {}).get("dividendPerShare", 0.0)) > 0.0:
			dividend_tickers.append(String(ticker))
		if dividend_tickers.size() >= 2:
			break
	dividend_state["inspectedTickers"] = dividend_tickers
	var dividend_task := SmaAcademy.evaluate_practice(dividend_state, SmaAcademy.unit("u5"),
		{"trades": [], "orders": []})
	eq(dividend_task["done"], true, "inspecting two dividend payers completes u5 practice")

	describe("academy-style-practice")
	var style_state := SmaAcademy.create_state()
	style_state["inspectedTickers"] = ["APLA", "NVDO", "QVAL"]
	var style_task := SmaAcademy.evaluate_practice(style_state, SmaAcademy.unit("u6"),
		{"trades": [], "orders": []})
	eq(style_task["done"], true, "three distinct styles complete u6 practice")

	describe("academy-diversification-practice")
	var diversify_state := SmaAcademy.create_state()
	var positions := {}
	var seen_sectors := {}
	for ticker in SmaCompanyCatalog.load_companies().keys():
		var company: Dictionary = SmaCompanyCatalog.get_company(String(ticker))
		var sector := String(company.get("sector", ""))
		if seen_sectors.has(sector):
			continue
		seen_sectors[sector] = true
		positions[ticker] = {"qty": 10, "avgCost": 1.0}
		if positions.size() >= 3:
			break
	var diversify_task := SmaAcademy.evaluate_practice(diversify_state, SmaAcademy.unit("u7"),
		{"positions": positions, "trades": [], "orders": []})
	eq(diversify_task["done"], true, "three sectors complete u7 practice")

	describe("academy-hold-practice")
	var hold_state := SmaAcademy.create_state()
	var hold_task := SmaAcademy.evaluate_practice(hold_state, SmaAcademy.unit("u8"), {
		"positions": {"APLA": {"qty": 10, "avgCost": 100.0}},
		"trades": [{"ticker": "APLA", "action": "openLong", "day": 0}],
		"day": 15, "orders": [],
	})
	eq(hold_task["done"], true, "holding for fifteen days completes u8 practice")

	describe("academy-stage-two-numeric")
	for unit_id in ["u5", "u7", "u8"]:
		var quiz := SmaAcademy.build_quiz(unit_id, 1)
		var numeric_found := false
		for question in quiz["questions"]:
			if String(question["type"]) == "numeric":
				numeric_found = true
				check(is_finite(float(question.get("answer", NAN))), "numeric answer generated for %s" % unit_id)
		check(numeric_found, "%s includes a numeric question" % unit_id)
		var quiz_answers := {}
		for question in quiz["questions"]:
			quiz_answers[String(question["id"])] = _answer_for(question)
		eq(SmaAcademy.grade_quiz(quiz, quiz_answers)["score"], 100,
			"%s numeric quiz can be graded" % unit_id)

	describe("academy-stage-three")
	var stage_three := SmaAcademy.create_state()
	check(not SmaAcademy.is_unit_unlocked(stage_three, "u9"), "u9 waits for stage two")
	for unit_id in ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"]:
		SmaAcademy.ensure_unit(stage_three, unit_id)["completed"] = true
	check(SmaAcademy.is_unit_unlocked(stage_three, "u9"), "completing u8 unlocks u9")
	for unit_id in ["u9", "u10", "u11", "u12"]:
		eq(SmaAcademy.unit(unit_id).get("stage", ""), "stage3",
			"%s belongs to stage three" % unit_id)
	check(not SmaAcademy.is_unit_unlocked(stage_three, "u13"), "stage four stays locked")

	describe("academy-demo-practice")
	var demo_state := SmaAcademy.create_state()
	eq(SmaAcademy.evaluate_practice(demo_state, SmaAcademy.unit("u9"), {})["done"], false,
		"demo practice starts incomplete")
	check(SmaAcademy.record_demo_completed(demo_state, "candle"), "candle demo recorded")
	check(not SmaAcademy.record_demo_completed(demo_state, "candle"),
		"demo completion is deduplicated")
	eq(SmaAcademy.evaluate_practice(demo_state, SmaAcademy.unit("u9"), {})["done"], true,
		"recorded demo completes u9 practice")
	eq(SmaAcademy.evaluate_practice(demo_state, SmaAcademy.unit("u10"), {})["done"], false,
		"a different demo does not complete u10")
	SmaAcademy.record_demo_completed(demo_state, "indicators")
	eq(SmaAcademy.evaluate_practice(demo_state, SmaAcademy.unit("u10"), {})["done"], true,
		"indicators demo completes u10 practice")
	SmaAcademy.record_demo_completed(demo_state, "dcf")
	eq(SmaAcademy.evaluate_practice(demo_state, SmaAcademy.unit("u12"), {})["done"], true,
		"dcf demo completes u12 practice")

	describe("academy-financials-practice")
	var financial_state := SmaAcademy.create_state()
	eq(SmaAcademy.evaluate_practice(financial_state, SmaAcademy.unit("u11"), {})["done"],
		false, "financials practice starts incomplete")
	check(SmaAcademy.record_financials_viewed(financial_state, "apla"),
		"financials view recorded and normalized")
	check(not SmaAcademy.record_financials_viewed(financial_state, "APLA"),
		"financials views are deduplicated")
	eq(SmaAcademy.evaluate_practice(financial_state, SmaAcademy.unit("u11"), {})["current"],
		1, "one statement view is counted")
	SmaAcademy.record_financials_viewed(financial_state, "NVDO")
	eq(SmaAcademy.evaluate_practice(financial_state, SmaAcademy.unit("u11"), {})["done"],
		true, "two companies complete u11 practice")

	describe("academy-stage-three-numeric")
	for unit_id in ["u9", "u10", "u11", "u12"]:
		var quiz := SmaAcademy.build_quiz(unit_id, 1)
		var numeric_found := false
		for question in quiz["questions"]:
			if String(question["type"]) == "numeric":
				numeric_found = true
				check(is_finite(float(question.get("answer", NAN))),
					"numeric answer generated for %s" % unit_id)
				check(float(question.get("tolerance", 0.0)) > 0.0,
					"numeric tolerance set for %s" % unit_id)
				check(not SmaAcademy.formatted_params(question).is_empty(),
					"numeric prompt params formatted for %s" % unit_id)
		check(numeric_found, "%s includes a numeric question" % unit_id)
		var stage_answers := {}
		for question in quiz["questions"]:
			stage_answers[String(question["id"])] = _answer_for(question)
		eq(SmaAcademy.grade_quiz(quiz, stage_answers)["score"], 100,
			"%s numeric quiz can be graded" % unit_id)

	describe("academy-stage-three-persistence")
	var stage_state := SmaAcademy.create_state()
	SmaAcademy.record_demo_completed(stage_state, "candle")
	SmaAcademy.record_financials_viewed(stage_state, "NVDO")
	var stage_serialized: Variant = JSON.parse_string(JSON.stringify(stage_state))
	var stage_restored := SmaAcademy.normalize_state(stage_serialized)
	check(bool(stage_restored["demosCompleted"].get("candle", false)),
		"demo completion survives JSON")
	check(stage_restored["financialsViewed"].has("NVDO"),
		"financials views survive JSON")

	describe("academy-stage-four")
	var stage_four := SmaAcademy.create_state()
	check(not SmaAcademy.is_unit_unlocked(stage_four, "u13"), "u13 waits for stage three")
	for unit_id in ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8",
			"u9", "u10", "u11", "u12"]:
		SmaAcademy.ensure_unit(stage_four, unit_id)["completed"] = true
	check(SmaAcademy.is_unit_unlocked(stage_four, "u13"), "completing u12 unlocks u13")
	for unit_id in ["u13", "u14", "u15", "u16"]:
		eq(SmaAcademy.unit(unit_id).get("stage", ""), "stage4",
			"%s belongs to stage four" % unit_id)
	check(not SmaAcademy.is_unit_unlocked(stage_four, "u17"), "stage five stays locked")

	describe("academy-stage-four-demos")
	for unit_id in ["u13", "u14", "u15", "u16"]:
		var unit_entry := SmaAcademy.unit(unit_id)
		var task: Dictionary = unit_entry.get("practice", {})
		eq(String(task.get("check", "")), "demo", "%s uses a demo practice" % unit_id)
		eq(SmaAcademy.evaluate_practice(stage_four, unit_entry, {})["done"], false,
			"%s demo starts incomplete" % unit_id)
		check(SmaAcademy.record_demo_completed(stage_four, String(task.get("demoId", ""))),
			"%s demo can be recorded" % unit_id)
		eq(SmaAcademy.evaluate_practice(stage_four, unit_entry, {})["done"], true,
			"%s demo completes its practice" % unit_id)

	describe("academy-stage-four-numeric")
	for unit_id in ["u14", "u15"]:
		var quiz := SmaAcademy.build_quiz(unit_id, 1)
		var numeric_found := false
		for question in quiz["questions"]:
			if String(question["type"]) == "numeric":
				numeric_found = true
				check(is_finite(float(question.get("answer", NAN))),
					"numeric answer generated for %s" % unit_id)
				check(not SmaAcademy.formatted_params(question).is_empty(),
					"numeric prompt params formatted for %s" % unit_id)
		check(numeric_found, "%s includes a numeric question" % unit_id)
		var stage_four_answers := {}
		for question in quiz["questions"]:
			stage_four_answers[String(question["id"])] = _answer_for(question)
		eq(SmaAcademy.grade_quiz(quiz, stage_four_answers)["score"], 100,
			"%s numeric quiz can be graded" % unit_id)
	for unit_id in ["u13", "u16"]:
		var quiz := SmaAcademy.build_quiz(unit_id, 1)
		var stage_four_answers := {}
		for question in quiz["questions"]:
			stage_four_answers[String(question["id"])] = _answer_for(question)
		eq(SmaAcademy.grade_quiz(quiz, stage_four_answers)["score"], 100,
			"%s quiz can be graded" % unit_id)

	describe("academy-stage-five")
	var stage_five := SmaAcademy.create_state()
	check(not SmaAcademy.is_unit_unlocked(stage_five, "u17"), "u17 waits for stage four")
	for unit_id in ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8",
			"u9", "u10", "u11", "u12", "u13", "u14", "u15", "u16"]:
		SmaAcademy.ensure_unit(stage_five, unit_id)["completed"] = true
	check(SmaAcademy.is_unit_unlocked(stage_five, "u17"), "completing u16 unlocks u17")
	for unit_id in ["u17", "u18", "u19", "u20"]:
		eq(SmaAcademy.unit(unit_id).get("stage", ""), "stage5",
			"%s belongs to stage five" % unit_id)
	check(not SmaAcademy.is_unit_unlocked(stage_five, "u21"), "stage six stays locked")

	describe("academy-short-practice")
	var short_state := SmaAcademy.create_state()
	var short_task := SmaAcademy.evaluate_practice(short_state, SmaAcademy.unit("u17"),
		{"trades": [{"action": "openShort"}], "orders": []})
	eq(short_task["done"], false, "opening a short is not enough")
	eq(short_task["current"], 1, "opening a short counts once")
	short_task = SmaAcademy.evaluate_practice(short_state, SmaAcademy.unit("u17"),
		{"trades": [{"action": "openShort"}, {"action": "closeShort"}], "orders": []})
	eq(short_task["done"], true, "short round trip completes u17 practice")
	eq(short_task["current"], 2, "round trip counts both legs")

	describe("academy-stop-practice")
	var stop_state := SmaAcademy.create_state()
	var stop_task := SmaAcademy.evaluate_practice(stop_state, SmaAcademy.unit("u19"),
		{"trades": [], "orders": [{
			"status": "filled", "type": "market", "triggeredFrom": "stop",
		}]})
	eq(stop_task["done"], true, "a triggered and filled stop completes u19 practice")
	stop_task = SmaAcademy.evaluate_practice(stop_state, SmaAcademy.unit("u19"),
		{"trades": [], "orders": [{
			"status": "open", "type": "stop", "triggeredFrom": "",
		}]})
	eq(stop_task["done"], false, "a resting stop does not complete u19 practice")

	describe("academy-stage-five-demos")
	for demo_id in ["margin", "orderBook"]:
		check(SmaAcademy.record_demo_completed(stage_five, demo_id),
			"%s demo can be recorded" % demo_id)
	for unit_id in ["u18", "u20"]:
		eq(SmaAcademy.evaluate_practice(stage_five, SmaAcademy.unit(unit_id), {})["done"],
			true, "%s demo practice completes" % unit_id)
	eq(String(SmaAcademy.unit("u18").get("practice", {}).get("demoId", "")), "margin",
		"u18 uses the margin demo")
	eq(String(SmaAcademy.unit("u20").get("practice", {}).get("demoId", "")), "orderBook",
		"u20 uses the order-book demo")

	describe("academy-stage-five-numeric")
	for unit_id in ["u17", "u18", "u19", "u20"]:
		var quiz := SmaAcademy.build_quiz(unit_id, 1)
		var numeric_found := false
		for question in quiz["questions"]:
			if String(question["type"]) == "numeric":
				numeric_found = true
				check(is_finite(float(question.get("answer", NAN))),
					"numeric answer generated for %s" % unit_id)
				check(not SmaAcademy.formatted_params(question).is_empty(),
					"numeric prompt params formatted for %s" % unit_id)
		check(numeric_found, "%s includes a numeric question" % unit_id)
		var stage_five_answers := {}
		for question in quiz["questions"]:
			stage_five_answers[String(question["id"])] = _answer_for(question)
		eq(SmaAcademy.grade_quiz(quiz, stage_five_answers)["score"], 100,
			"%s numeric quiz can be graded" % unit_id)

	describe("academy-stage-six")
	var stage_six := SmaAcademy.create_state()
	check(not SmaAcademy.is_unit_unlocked(stage_six, "u21"), "u21 waits for stage five")
	for unit_id in ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8",
			"u9", "u10", "u11", "u12", "u13", "u14", "u15", "u16",
			"u17", "u18", "u19", "u20"]:
		SmaAcademy.ensure_unit(stage_six, unit_id)["completed"] = true
	check(SmaAcademy.is_unit_unlocked(stage_six, "u21"), "completing u20 unlocks u21")
	for unit_id in ["u21", "u22", "u23", "u24"]:
		eq(SmaAcademy.unit(unit_id).get("stage", ""), "stage6",
			"%s belongs to stage six" % unit_id)
	check(not SmaAcademy.is_unit_unlocked(stage_six, "u25"), "stage seven stays locked")
	check(not SmaAcademy.is_tool_unlocked(stage_six, "options.trade"),
		"options trading is locked before u21 s1")
	SmaAcademy.mark_section_read(stage_six, "u21", "s1", 0)
	check(SmaAcademy.is_tool_unlocked(stage_six, "options.trade"),
		"reading u21 s1 unlocks options trading")

	describe("academy-option-practice")
	var option_snapshot := {"trades": [], "orders": [], "optionTrades": []}
	eq(SmaAcademy.evaluate_practice(stage_six, SmaAcademy.unit("u21"), option_snapshot)["done"],
		false, "u21 starts without an option purchase")
	option_snapshot["optionTrades"] = [{
		"side": "buy", "optionType": "call", "qty": 1,
	}]
	eq(SmaAcademy.evaluate_practice(stage_six, SmaAcademy.unit("u21"), option_snapshot)["done"],
		true, "buying any option completes u21 practice")
	eq(SmaAcademy.evaluate_practice(stage_six, SmaAcademy.unit("u22"), option_snapshot)["done"],
		true, "buying a call completes u22 practice")
	eq(SmaAcademy.evaluate_practice(stage_six, SmaAcademy.unit("u23"), option_snapshot)["done"],
		false, "a call does not complete the put practice")
	option_snapshot["optionTrades"].append({"side": "buy", "optionType": "put", "qty": 1})
	eq(SmaAcademy.evaluate_practice(stage_six, SmaAcademy.unit("u23"), option_snapshot)["done"],
		true, "buying a put completes u23 practice")

	describe("academy-greeks-demo")
	check(SmaAcademy.record_demo_completed(stage_six, "greeks"), "greeks demo can be recorded")
	eq(SmaAcademy.evaluate_practice(stage_six, SmaAcademy.unit("u24"), {})["done"], true,
		"greeks demo completes u24 practice")

	describe("academy-stage-six-numeric")
	for unit_id in ["u21", "u22", "u23", "u24"]:
		var quiz := SmaAcademy.build_quiz(unit_id, 1)
		var numeric_found := false
		for question in quiz["questions"]:
			if String(question["type"]) == "numeric":
				numeric_found = true
				check(is_finite(float(question.get("answer", NAN))),
					"numeric answer generated for %s" % unit_id)
				check(not SmaAcademy.formatted_params(question).is_empty(),
					"numeric prompt params formatted for %s" % unit_id)
		check(numeric_found, "%s includes a numeric question" % unit_id)
		var stage_six_answers := {}
		for question in quiz["questions"]:
			stage_six_answers[String(question["id"])] = _answer_for(question)
		eq(SmaAcademy.grade_quiz(quiz, stage_six_answers)["score"], 100,
			"%s numeric quiz can be graded" % unit_id)

	describe("academy-stage-seven")
	var stage_seven := SmaAcademy.create_state()
	for unit_id in ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8",
			"u9", "u10", "u11", "u12", "u13", "u14", "u15", "u16",
			"u17", "u18", "u19", "u20", "u21", "u22", "u23", "u24"]:
		SmaAcademy.ensure_unit(stage_seven, unit_id)["completed"] = true
	check(SmaAcademy.is_unit_unlocked(stage_seven, "u25"), "completing u24 unlocks u25")
	for unit_id in ["u25", "u26", "u27", "u28"]:
		eq(SmaAcademy.unit(unit_id).get("stage", ""), "stage7",
			"%s belongs to stage seven" % unit_id)
	check(not SmaAcademy.is_tool_unlocked(stage_seven, "options.sell"),
		"selling options is locked before u25 s1")
	SmaAcademy.mark_section_read(stage_seven, "u25", "s1", 0)
	check(SmaAcademy.is_tool_unlocked(stage_seven, "options.sell"),
		"reading u25 s1 unlocks option selling")

	describe("academy-option-sell-practice")
	var sell_snapshot := {"trades": [], "orders": [], "optionTrades": [], "options": []}
	eq(SmaAcademy.evaluate_practice(stage_seven, SmaAcademy.unit("u25"),
		sell_snapshot)["done"], false, "u25 starts without a sell")
	sell_snapshot["optionTrades"] = [{"side": "sell", "optionType": "put", "qty": 1}]
	eq(SmaAcademy.evaluate_practice(stage_seven, SmaAcademy.unit("u25"),
		sell_snapshot)["done"], true, "selling any option completes u25 practice")

	describe("academy-income-strategy-practice")
	var income_snapshot := {
		"trades": [], "orders": [], "optionTrades": [],
		"options": [{"type": "put", "strike": 40.0, "qty": -1, "expiryDay": 30}],
		"positions": {}, "cash": 5000.0,
	}
	eq(SmaAcademy.evaluate_practice(stage_seven, SmaAcademy.unit("u26"),
		income_snapshot)["done"], true, "a fully cash-secured short put completes u26")
	income_snapshot["cash"] = 1000.0
	eq(SmaAcademy.evaluate_practice(stage_seven, SmaAcademy.unit("u26"),
		income_snapshot)["done"], false, "a short put without full cash cover fails")
	income_snapshot["options"] = [{
		"type": "call", "strike": 55.0, "qty": -1, "ticker": "APLA", "expiryDay": 30,
	}]
	income_snapshot["cash"] = 5000.0
	eq(SmaAcademy.evaluate_practice(stage_seven, SmaAcademy.unit("u26"),
		income_snapshot)["done"], false, "a naked short call fails the income practice")
	income_snapshot["positions"] = {"APLA": {"qty": 100}}
	eq(SmaAcademy.evaluate_practice(stage_seven, SmaAcademy.unit("u26"),
		income_snapshot)["done"], true, "100 shares plus a short call is covered")

	describe("academy-vertical-spread-practice")
	var spread_snapshot := {"trades": [], "orders": [], "optionTrades": [], "options": [
		{"type": "call", "strike": 100.0, "qty": 1, "expiryDay": 30},
		{"type": "call", "strike": 110.0, "qty": -1, "expiryDay": 30},
	]}
	eq(SmaAcademy.evaluate_practice(stage_seven, SmaAcademy.unit("u27"),
		spread_snapshot)["done"], true, "a same-expiry call spread completes u27")
	spread_snapshot["options"] = [
		{"type": "call", "strike": 100.0, "qty": 1, "expiryDay": 30},
		{"type": "call", "strike": 110.0, "qty": -1, "expiryDay": 60},
	]
	eq(SmaAcademy.evaluate_practice(stage_seven, SmaAcademy.unit("u27"),
		spread_snapshot)["done"], false, "legs with different expiries are not a spread")

	describe("academy-volatility-long-practice")
	var vol_snapshot := {"trades": [], "orders": [], "optionTrades": [], "options": [
		{"type": "call", "strike": 100.0, "qty": 1, "expiryDay": 30},
		{"type": "put", "strike": 100.0, "qty": 1, "expiryDay": 30},
	]}
	eq(SmaAcademy.evaluate_practice(stage_seven, SmaAcademy.unit("u28"),
		vol_snapshot)["done"], true, "a same-expiry long call and put completes u28")
	vol_snapshot["options"] = [
		{"type": "call", "strike": 100.0, "qty": 1, "expiryDay": 30},
		{"type": "put", "strike": 100.0, "qty": 1, "expiryDay": 60},
	]
	eq(SmaAcademy.evaluate_practice(stage_seven, SmaAcademy.unit("u28"),
		vol_snapshot)["done"], false, "different expiries do not form a straddle")

	describe("academy-stage-seven-numeric")
	for unit_id in ["u25", "u26", "u27", "u28"]:
		var quiz := SmaAcademy.build_quiz(unit_id, 1)
		var numeric_found := false
		for question in quiz["questions"]:
			if String(question["type"]) == "numeric":
				numeric_found = true
				check(is_finite(float(question.get("answer", NAN))),
					"numeric answer generated for %s" % unit_id)
				check(not SmaAcademy.formatted_params(question).is_empty(),
					"numeric prompt params formatted for %s" % unit_id)
		check(numeric_found, "%s includes a numeric question" % unit_id)
		var stage_seven_answers := {}
		for question in quiz["questions"]:
			stage_seven_answers[String(question["id"])] = _answer_for(question)
		eq(SmaAcademy.grade_quiz(quiz, stage_seven_answers)["score"], 100,
			"%s numeric quiz can be graded" % unit_id)

	describe("academy-stage-eight")
	var stage_eight := SmaAcademy.create_state()
	for unit_id in ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8",
			"u9", "u10", "u11", "u12", "u13", "u14", "u15", "u16",
			"u17", "u18", "u19", "u20", "u21", "u22", "u23", "u24",
			"u25", "u26", "u27", "u28"]:
		SmaAcademy.ensure_unit(stage_eight, unit_id)["completed"] = true
	check(SmaAcademy.is_unit_unlocked(stage_eight, "u29"), "completing u28 unlocks u29")
	for unit_id in ["u29", "u30", "u31", "u32"]:
		eq(SmaAcademy.unit(unit_id).get("stage", ""), "stage8",
			"%s belongs to stage eight" % unit_id)
	check(not SmaAcademy.is_tool_unlocked(stage_eight, "trade.futures"),
		"futures trading is locked before u29 s1")
	SmaAcademy.mark_section_read(stage_eight, "u29", "s1", 0)
	check(SmaAcademy.is_tool_unlocked(stage_eight, "trade.futures"),
		"reading u29 s1 unlocks futures trading")

	describe("academy-futures-practice")
	var futures_snapshot := {"trades": [], "orders": [], "futuresTrades": [], "futures": []}
	eq(SmaAcademy.evaluate_practice(stage_eight, SmaAcademy.unit("u29"),
		futures_snapshot)["done"], false, "u29 starts without a futures trade")
	futures_snapshot["futuresTrades"] = [{"action": "open", "side": "long", "qty": 1}]
	eq(SmaAcademy.evaluate_practice(stage_eight, SmaAcademy.unit("u29"),
		futures_snapshot)["done"], true, "opening a future completes u29 practice")

	describe("academy-hedge-practice")
	var hedge_snapshot := {
		"trades": [], "orders": [], "futuresTrades": [], "positions": {},
		"futures": [{"side": "short", "qty": 1}],
	}
	eq(SmaAcademy.evaluate_practice(stage_eight, SmaAcademy.unit("u30"),
		hedge_snapshot)["done"], false, "a short future without stock is not a hedge")
	hedge_snapshot["positions"] = {"APLA": {"qty": 100}}
	eq(SmaAcademy.evaluate_practice(stage_eight, SmaAcademy.unit("u30"),
		hedge_snapshot)["done"], true, "long stock plus a short future completes u30")

	describe("academy-stress-demo")
	check(SmaAcademy.record_demo_completed(stage_eight, "stressTest"),
		"stress test demo can be recorded")
	eq(SmaAcademy.evaluate_practice(stage_eight, SmaAcademy.unit("u31"), {})["done"],
		true, "stress test demo completes u31 practice")

	describe("academy-graduation-practice")
	var graduation_snapshot := {
		"trades": [{"action": "openLong"}], "orders": [], "futuresTrades": [],
		"optionTrades": [],
	}
	eq(SmaAcademy.evaluate_practice(stage_eight, SmaAcademy.unit("u32"),
		graduation_snapshot)["done"], false, "stock alone does not graduate")
	graduation_snapshot["optionTrades"] = [{"side": "buy"}]
	eq(SmaAcademy.evaluate_practice(stage_eight, SmaAcademy.unit("u32"),
		graduation_snapshot)["done"], false, "stock and options alone do not graduate")
	graduation_snapshot["futuresTrades"] = [{"action": "open"}]
	var graduation := SmaAcademy.evaluate_practice(stage_eight, SmaAcademy.unit("u32"),
		graduation_snapshot)
	eq(graduation["done"], true, "all three tools complete the graduation challenge")
	eq(graduation["current"], 3, "graduation reports three tools")

	describe("academy-stage-eight-numeric")
	for unit_id in ["u29", "u30", "u31", "u32"]:
		var quiz := SmaAcademy.build_quiz(unit_id, 1)
		var numeric_found := false
		for question in quiz["questions"]:
			if String(question["type"]) == "numeric":
				numeric_found = true
				check(is_finite(float(question.get("answer", NAN))),
					"numeric answer generated for %s" % unit_id)
				check(not SmaAcademy.formatted_params(question).is_empty(),
					"numeric prompt params formatted for %s" % unit_id)
		check(numeric_found, "%s includes a numeric question" % unit_id)
		var stage_eight_answers := {}
		for question in quiz["questions"]:
			stage_eight_answers[String(question["id"])] = _answer_for(question)
		eq(SmaAcademy.grade_quiz(quiz, stage_eight_answers)["score"], 100,
			"%s numeric quiz can be graded" % unit_id)

	describe("academy-branches")
	eq(SmaAcademy.branch_units().size(), 6, "six professional branches are exported")
	var branch_state := SmaAcademy.create_state()
	for unit_id in ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8",
			"u9", "u10", "u11", "u12", "u13", "u14", "u15", "u16",
			"u17", "u18", "u19", "u20", "u21", "u22", "u23", "u24",
			"u25", "u26", "u27", "u28", "u29", "u30", "u31", "u32"]:
		SmaAcademy.ensure_unit(branch_state, unit_id)["completed"] = true
	check(SmaAcademy.is_unit_unlocked(branch_state, "b1"),
		"completing u32 unlocks branch b1")
	for unit_id in ["b1", "b2", "b3", "b4", "b5", "b6"]:
		var branch_entry := SmaAcademy.unit(unit_id)
		eq(branch_entry.get("stage", ""), "branches", "%s belongs to the branches" % unit_id)
		eq(branch_entry.get("optional", false), true, "%s is optional" % unit_id)
		eq(branch_entry.get("prerequisites", []), ["u32"], "%s waits for u32" % unit_id)
	eq(SmaAcademy.branch_for_unit("b1").get("nameKey", ""), "branch.asset.name",
		"branch metadata is available by unit id")
	eq(SmaAcademy.overall_progress(branch_state)["total"], 32,
		"optional branches do not inflate core progress")

	describe("academy-branch-quiz")
	var branch_quiz := SmaAcademy.build_quiz("b1", 1)
	eq(branch_quiz["questions"].size(), 6, "branch quizzes carry six questions")
	var branch_answers := {}
	for question in branch_quiz["questions"]:
		branch_answers[String(question["id"])] = _answer_for(question)
	eq(SmaAcademy.grade_quiz(branch_quiz, branch_answers)["score"], 100,
		"branch quiz can be graded")

	describe("academy-branch-practice")
	var sector_positions := {}
	var sectors := {}
	for ticker in SmaCompanyCatalog.load_companies().keys():
		var company := SmaCompanyCatalog.get_company(String(ticker))
		var sector := String(company.get("sector", ""))
		if sector == "" or sectors.has(sector):
			continue
		sectors[sector] = true
		sector_positions[ticker] = {"qty": 100}
		if sectors.size() == 3:
			break
	eq(SmaAcademy.evaluate_practice(branch_state, SmaAcademy.unit("b1"),
		{"positions": sector_positions})["done"], true,
		"three sectors complete the asset-management practice")
	for demo_id in ["risk", "strategyPayoff", "dcf", "macro", "orderBook"]:
		check(SmaAcademy.record_demo_completed(branch_state, demo_id),
			"%s demo can be recorded" % demo_id)
	for unit_id in ["b2", "b3", "b4", "b5", "b6"]:
		eq(SmaAcademy.evaluate_practice(branch_state, SmaAcademy.unit(unit_id), {})["done"],
			true, "%s demo practice completes" % unit_id)
