## Career mode: eight ranks, promotion requirements, research tasks, graded
## investment reports, periodic performance reviews, certificates and a monthly
## salary. Every requirement is evaluated from real progress, trades and equity;
## the module itself is UI-free and serializable.
class_name SmaCareer
extends RefCounted

const SALARY_INTERVAL := 21
const EVAL_INTERVAL := 21
const REPORT_MIN_SCORE := 60
const REPORT_THESES := ["bull", "bear", "neutral"]
const TASK_LIMIT := 2
const MAX_TASKS := 40
const MAX_REPORTS := 40
const MAX_EVALUATIONS := 24
const MAX_CERTIFICATES := 12

const TASK_DEFS := [
	{"kind": "equity", "titleKey": "career.task.equity.title",
		"descKey": "career.task.equity.desc", "deadlineDays": 12,
		"rewardXp": 100, "rewardCash": 120.0},
	{"kind": "sector", "titleKey": "career.task.sector.title",
		"descKey": "career.task.sector.desc", "deadlineDays": 15,
		"rewardXp": 130, "rewardCash": 160.0},
	{"kind": "risk", "titleKey": "career.task.risk.title",
		"descKey": "career.task.risk.desc", "deadlineDays": 10,
		"rewardXp": 90, "rewardCash": 100.0},
]

const CERTIFICATES := [
	{"id": "foundation", "titleKey": "career.cert.foundation.title",
		"descKey": "career.cert.foundation.desc", "kind": "units",
		"unitIds": ["u1", "u2", "u3", "u4"], "target": 4},
	{"id": "technical", "titleKey": "career.cert.technical.title",
		"descKey": "career.cert.technical.desc", "kind": "units",
		"unitIds": ["u16", "u17", "u19"], "target": 3},
	{"id": "analyst", "titleKey": "career.cert.analyst.title",
		"descKey": "career.cert.analyst.desc", "kind": "reports",
		"target": 3, "minScore": 70},
	{"id": "manager", "titleKey": "career.cert.manager.title",
		"descKey": "career.cert.manager.desc", "kind": "evaluations",
		"target": 2, "minScore": 70},
	{"id": "founder", "titleKey": "career.cert.founder.title",
		"descKey": "career.cert.founder.desc", "kind": "rank", "target": 6},
]

const RANKS := [
	{"number": 1, "id": "retail", "titleKey": "career.rank.retail.title",
		"descKey": "career.rank.retail.desc", "salary": 0.0, "xp": 0,
		"requirements": [
			{"kind": "unit", "unitId": "u4", "target": 1},
			{"kind": "trades", "target": 1},
			{"kind": "inspected", "target": 3},
		]},
	{"number": 2, "id": "trader", "titleKey": "career.rank.trader.title",
		"descKey": "career.rank.trader.desc", "salary": 200.0, "xp": 100,
		"requirements": [
			{"kind": "unit", "unitId": "u8", "target": 1},
			{"kind": "trades", "target": 10},
			{"kind": "equity", "target": 11000.0},
		]},
	{"number": 3, "id": "research", "titleKey": "career.rank.research.title",
		"descKey": "career.rank.research.desc", "salary": 400.0, "xp": 150,
		"requirements": [
			{"kind": "unit", "unitId": "u12", "target": 1},
			{"kind": "demo", "demoId": "financials", "target": 1},
			{"kind": "demo", "demoId": "dcf", "target": 1},
			{"kind": "inspected", "target": 8},
			{"kind": "reports", "target": 1},
		]},
	{"number": 4, "id": "quant", "titleKey": "career.rank.quant.title",
		"descKey": "career.rank.quant.desc", "salary": 700.0, "xp": 200,
		"requirements": [
			{"kind": "unit", "unitId": "u16", "target": 1},
			{"kind": "demo", "demoId": "risk", "target": 1},
			{"kind": "trades", "target": 20},
			{"kind": "xp", "target": 1200},
			{"kind": "reports", "target": 3},
		]},
	{"number": 5, "id": "pm", "titleKey": "career.rank.pm.title",
		"descKey": "career.rank.pm.desc", "salary": 1200.0, "xp": 250,
		"requirements": [
			{"kind": "unit", "unitId": "u30", "target": 1},
			{"kind": "options", "target": 1},
			{"kind": "futures", "target": 1},
			{"kind": "challenge", "challengeId": "hedger", "target": 1},
			{"kind": "evaluations", "target": 1},
		]},
	{"number": 6, "id": "hedge", "titleKey": "career.rank.hedge.title",
		"descKey": "career.rank.hedge.desc", "salary": 2000.0, "xp": 300,
		"requirements": [
			{"kind": "unit", "unitId": "u32", "target": 1},
			{"kind": "branches", "target": 1},
			{"kind": "challenges", "target": 3},
			{"kind": "equity", "target": 30000.0},
		]},
	{"number": 7, "id": "founder", "titleKey": "career.rank.founder.title",
		"descKey": "career.rank.founder.desc", "salary": 3500.0, "xp": 400,
		"requirements": [
			{"kind": "branches", "target": 3},
			{"kind": "challenges", "target": 5},
			{"kind": "equity", "target": 60000.0},
			{"kind": "xp", "target": 4500},
			{"kind": "certificates", "target": 3},
		]},
	{"number": 8, "id": "ceo", "titleKey": "career.rank.ceo.title",
		"descKey": "career.rank.ceo.desc", "salary": 6000.0, "xp": 500,
		"requirements": []},
]


static func create_state(day: int = 0) -> Dictionary:
	return {
		"rank": 1, "promotedAtDay": day, "salaryPaidDay": day, "lastEvalDay": day,
		"taskSeq": 1, "reportSeq": 1, "evalSeq": 1,
		"tasks": [], "reports": [], "evaluations": [], "certificates": [],
		"history": [{"rank": 1, "day": day}],
	}


static func rank_def(number: int) -> Dictionary:
	for rank in RANKS:
		if int(rank["number"]) == number:
			return rank
	return RANKS[0]


static func _grade(score: int) -> String:
	if score >= 85:
		return "A"
	if score >= 70:
		return "B"
	if score >= 60:
		return "C"
	return "D"


static func _clamp(value: float, minimum: float, maximum: float, fallback: float) -> float:
	if not is_finite(value):
		return fallback
	return clampf(value, minimum, maximum)


static func _normalize_task(task: Dictionary, index: int, current_day: int) -> Dictionary:
	var definition: Dictionary = TASK_DEFS[0]
	for entry in TASK_DEFS:
		if String(entry["kind"]) == String(task.get("kind", "")):
			definition = entry
			break
	var status := String(task.get("status", "available"))
	if not ["available", "active", "completed", "expired"].has(status):
		status = "available"
	var day := int(task.get("day", 0))
	return {
		"id": String(task.get("id", "task-%d" % (index + 1))),
		"kind": String(definition["kind"]),
		"titleKey": String(definition["titleKey"]),
		"descKey": String(definition["descKey"]),
		"ticker": String(task.get("ticker", "APLA")),
		"day": day,
		"deadlineDay": int(task.get("deadlineDay", day + int(definition["deadlineDays"]))),
		"status": status,
		"acceptedDay": task.get("acceptedDay", null),
		"completedDay": task.get("completedDay", null),
		"reportId": task.get("reportId", null),
		"rewardXp": int(task.get("rewardXp", definition["rewardXp"])),
		"rewardCash": float(task.get("rewardCash", definition["rewardCash"])),
	}


static func _normalize_report(report: Dictionary, index: int) -> Dictionary:
	var score := int(_clamp(float(report.get("score", 0.0)), 0.0, 100.0, 0.0))
	return {
		"id": String(report.get("id", "report-%d" % (index + 1))),
		"taskId": String(report.get("taskId", "")),
		"ticker": String(report.get("ticker", "APLA")),
		"thesis": String(report.get("thesis", "neutral")),
		"conviction": int(_clamp(float(report.get("conviction", 3)), 1.0, 5.0, 3.0)),
		"targetPrice": float(report.get("targetPrice", 0.0)),
		"summary": String(report.get("summary", "")),
		"day": int(report.get("day", 0)),
		"score": score,
		"grade": String(report.get("grade", _grade(score))),
	}


static func _normalize_evaluation(evaluation: Dictionary, index: int) -> Dictionary:
	var score := int(_clamp(float(evaluation.get("score", 0.0)), 0.0, 100.0, 0.0))
	return {
		"id": String(evaluation.get("id", "eval-%d" % (index + 1))),
		"day": int(evaluation.get("day", 0)),
		"fromDay": int(evaluation.get("fromDay", 0)),
		"equityStart": float(evaluation.get("equityStart", 0.0)),
		"equityEnd": float(evaluation.get("equityEnd", 0.0)),
		"returnPct": float(evaluation.get("returnPct", 0.0)),
		"drawdownPct": float(evaluation.get("drawdownPct", 0.0)),
		"reports": int(evaluation.get("reports", 0)),
		"avgReportScore": float(evaluation.get("avgReportScore", 0.0)),
		"score": score,
		"grade": String(evaluation.get("grade", _grade(score))),
		"xp": int(evaluation.get("xp", 0)),
	}


static func normalize_state(saved: Variant, day: int = 0) -> Dictionary:
	var state := create_state(day)
	if typeof(saved) != TYPE_DICTIONARY:
		return state
	var data: Dictionary = saved
	var current_day := maxi(0, day)
	var rank := clampi(int(data.get("rank", 1)), 1, RANKS.size())
	state["rank"] = rank
	state["promotedAtDay"] = int(data.get("promotedAtDay", current_day))
	state["salaryPaidDay"] = int(data.get("salaryPaidDay", current_day))
	state["lastEvalDay"] = int(data.get("lastEvalDay", current_day))
	var history: Variant = data.get("history", [])
	state["history"] = history if typeof(history) == TYPE_ARRAY and not history.is_empty() \
		else [{"rank": rank, "day": current_day}]

	var tasks: Array = []
	var raw_tasks: Variant = data.get("tasks", [])
	if typeof(raw_tasks) == TYPE_ARRAY:
		for index in raw_tasks.size():
			if typeof(raw_tasks[index]) == TYPE_DICTIONARY:
				tasks.append(_normalize_task(raw_tasks[index], index, current_day))
	state["tasks"] = tasks.slice(maxi(0, tasks.size() - MAX_TASKS))
	var reports: Array = []
	var raw_reports: Variant = data.get("reports", [])
	if typeof(raw_reports) == TYPE_ARRAY:
		for index in raw_reports.size():
			if typeof(raw_reports[index]) == TYPE_DICTIONARY:
				reports.append(_normalize_report(raw_reports[index], index))
	state["reports"] = reports.slice(maxi(0, reports.size() - MAX_REPORTS))
	var evaluations: Array = []
	var raw_evaluations: Variant = data.get("evaluations", [])
	if typeof(raw_evaluations) == TYPE_ARRAY:
		for index in raw_evaluations.size():
			if typeof(raw_evaluations[index]) == TYPE_DICTIONARY:
				evaluations.append(_normalize_evaluation(raw_evaluations[index], index))
	state["evaluations"] = evaluations.slice(maxi(0, evaluations.size() - MAX_EVALUATIONS))
	var certificates: Array = []
	var raw_certificates: Variant = data.get("certificates", [])
	if typeof(raw_certificates) == TYPE_ARRAY:
		for entry in raw_certificates:
			if typeof(entry) == TYPE_DICTIONARY and entry.get("id", "") != "":
				certificates.append({"id": String(entry["id"]),
					"day": int(entry.get("day", current_day))})
	state["certificates"] = certificates.slice(maxi(0, certificates.size() - MAX_CERTIFICATES))
	state["taskSeq"] = maxi(int(data.get("taskSeq", 1)), tasks.size() + 1)
	state["reportSeq"] = maxi(int(data.get("reportSeq", 1)), reports.size() + 1)
	state["evalSeq"] = maxi(int(data.get("evalSeq", 1)), evaluations.size() + 1)
	return state


static func _completed_branches(academy: Dictionary) -> int:
	var count := 0
	for entry in SmaAcademy.branch_units():
		if SmaAcademy.is_unit_complete(academy, String(entry["id"])):
			count += 1
	return count


static func _completed_core_units(academy: Dictionary) -> int:
	var count := 0
	for entry in SmaAcademy.units():
		var unit_id := String(entry["id"])
		if unit_id.begins_with("u") and SmaAcademy.is_unit_complete(academy, unit_id):
			count += 1
	return count


static func _count_passed_reports(career: Dictionary) -> int:
	var count := 0
	for report in career.get("reports", []):
		if int(report.get("score", 0)) >= REPORT_MIN_SCORE:
			count += 1
	return count


static func _requirement_progress(requirement: Dictionary, career: Dictionary,
		ctx: Dictionary) -> Dictionary:
	var kind := String(requirement["kind"])
	var target := float(requirement.get("target", 1))
	var current := 0.0
	match kind:
		"unit":
			current = 1.0 if SmaAcademy.is_unit_complete(ctx["academy"],
				String(requirement.get("unitId", ""))) else 0.0
		"units":
			current = float(_completed_core_units(ctx["academy"]))
		"trades":
			current = float(ctx.get("trades", 0))
		"inspected":
			current = float(ctx["academy"].get("inspectedTickers", []).size())
		"demo":
			current = 1.0 if bool(ctx["academy"].get("demosCompleted", {}).get(
				String(requirement.get("demoId", "")), false)) else 0.0
		"equity":
			current = float(ctx.get("equity", 0.0))
		"options":
			current = float(ctx.get("optionTrades", 0))
		"futures":
			current = float(ctx.get("futuresTrades", 0))
		"challenge":
			current = 1.0 if ctx.get("challengesCompleted", []).has(
				String(requirement.get("challengeId", ""))) else 0.0
		"challenges":
			current = float(ctx.get("challengesCompleted", []).size())
		"branch":
			current = 1.0 if SmaAcademy.is_unit_complete(ctx["academy"],
				_branch_unit_for(String(requirement.get("branchId", "")))) else 0.0
		"branches":
			current = float(_completed_branches(ctx["academy"]))
		"xp":
			current = float(ctx["academy"].get("xp", 0))
		"reports":
			current = float(_count_passed_reports(career))
		"reportScore":
			var best := 0
			for report in career.get("reports", []):
				best = maxi(best, int(report.get("score", 0)))
			current = float(best)
		"evaluations":
			var passed := 0
			for evaluation in career.get("evaluations", []):
				if int(evaluation.get("score", 0)) >= 55:
					passed += 1
			current = float(passed)
		"certificates":
			current = float(career.get("certificates", []).size())
	return {
		"kind": kind, "target": target, "current": minf(current, target),
		"rawCurrent": current, "done": current >= target,
		"pct": minf(100.0, current / target * 100.0) if target > 0.0 else 0.0,
		"requirement": requirement,
	}


static func _branch_unit_for(branch_id: String) -> String:
	for entry in SmaAcademy.branch_units():
		if String(entry.get("branchId", "")) == branch_id:
			return String(entry["id"])
	return ""


static func progress(career: Dictionary, ctx: Dictionary) -> Dictionary:
	var rank := rank_def(int(career.get("rank", 1)))
	var next := rank_def(int(rank["number"]) + 1) if int(rank["number"]) < RANKS.size() else {}
	var requirements: Array = []
	for requirement in rank["requirements"]:
		requirements.append(_requirement_progress(requirement, career, ctx))
	var ready := not next.is_empty()
	for entry in requirements:
		if not bool(entry["done"]):
			ready = false
			break
	var salary := float(rank["salary"])
	var next_salary_day := int(career["salaryPaidDay"]) + SALARY_INTERVAL if salary > 0.0 else -1
	var active_tasks := 0
	var available_tasks := 0
	for task in career.get("tasks", []):
		if String(task["status"]) == "active":
			active_tasks += 1
		elif String(task["status"]) == "available":
			available_tasks += 1
	return {
		"rank": rank, "next": next, "requirements": requirements, "ready": ready,
		"salary": salary, "nextSalaryDay": next_salary_day,
		"daysToSalary": maxi(0, next_salary_day - int(ctx.get("day", 0))) \
			if next_salary_day >= 0 else -1,
		"tasks": career.get("tasks", []),
		"activeTasks": active_tasks, "availableTasks": available_tasks,
		"reports": career.get("reports", []),
		"evaluations": career.get("evaluations", []),
		"certificates": certificate_progress(career, ctx),
		"passedReports": _count_passed_reports(career),
		"careerIncome": float(ctx.get("careerIncome", 0.0)),
	}


static func certificate_progress(career: Dictionary, ctx: Dictionary) -> Array:
	var rows: Array = []
	var earned_ids: Array = []
	for entry in career.get("certificates", []):
		earned_ids.append(String(entry["id"]))
	for certificate in CERTIFICATES:
		var current := 0.0
		var kind := String(certificate["kind"])
		if kind == "units":
			for unit_id in certificate["unitIds"]:
				if SmaAcademy.is_unit_complete(ctx["academy"], String(unit_id)):
					current += 1.0
		elif kind == "reports":
			for report in career.get("reports", []):
				if int(report.get("score", 0)) >= int(certificate.get("minScore", 0)):
					current += 1.0
		elif kind == "evaluations":
			for evaluation in career.get("evaluations", []):
				if int(evaluation.get("score", 0)) >= int(certificate.get("minScore", 0)):
					current += 1.0
		elif kind == "rank":
			current = float(career.get("rank", 1))
		var target := float(certificate.get("target", 1))
		var earned := earned_ids.has(String(certificate["id"]))
		rows.append({
			"id": String(certificate["id"]),
			"titleKey": String(certificate["titleKey"]),
			"descKey": String(certificate["descKey"]),
			"current": minf(current, target), "rawCurrent": current, "target": target,
			"earned": earned, "done": current >= target,
			"pct": minf(100.0, current / target * 100.0) if target > 0.0 else 0.0,
		})
	return rows


static func sync_certificates(career: Dictionary, ctx: Dictionary, day: int) -> Dictionary:
	var rows := certificate_progress(career, ctx)
	var newly: Array = []
	for certificate in rows:
		if bool(certificate["done"]) and not bool(certificate["earned"]):
			newly.append({"id": String(certificate["id"]), "day": day})
	if newly.is_empty():
		return {"career": career, "newlyEarned": []}
	var certificates: Array = career.get("certificates", []).duplicate(true)
	certificates.append_array(newly)
	career["certificates"] = certificates.slice(maxi(0, certificates.size() - MAX_CERTIFICATES))
	return {"career": career, "newlyEarned": newly}


## Refreshes available research tasks once the player reaches rank 2.
static func refresh_tasks(career: Dictionary, day: int, tickers: Array) -> Dictionary:
	if int(career.get("rank", 1)) < 2:
		return career
	var tasks: Array = career.get("tasks", []).duplicate(true)
	for task in tasks:
		var status := String(task["status"])
		if (status == "available" or status == "active") and day > int(task["deadlineDay"]):
			task["status"] = "expired"
	var available := 0
	for task in tasks:
		if String(task["status"]) == "available":
			available += 1
	var seq := int(career.get("taskSeq", 1))
	var guard := 0
	while available < TASK_LIMIT and seq <= int(career.get("taskSeq", 1)) + 8 and guard < 16:
		guard += 1
		var definition: Dictionary = TASK_DEFS[(seq - 1) % TASK_DEFS.size()]
		var ticker := "APLA"
		if not tickers.is_empty():
			ticker = String(tickers[(seq - 1) % tickers.size()])
		tasks.append({
			"id": "task-%d" % seq, "kind": String(definition["kind"]),
			"titleKey": String(definition["titleKey"]),
			"descKey": String(definition["descKey"]), "ticker": ticker,
			"day": day, "deadlineDay": day + int(definition["deadlineDays"]),
			"status": "available", "acceptedDay": null, "completedDay": null,
			"reportId": null, "rewardXp": int(definition["rewardXp"]),
			"rewardCash": float(definition["rewardCash"]),
		})
		seq += 1
		available += 1
	career["tasks"] = tasks.slice(maxi(0, tasks.size() - MAX_TASKS))
	career["taskSeq"] = seq
	return career


static func accept_task(career: Dictionary, task_id: String, day: int) -> Dictionary:
	var tasks: Array = career.get("tasks", [])
	var active := 0
	for task in tasks:
		if String(task["status"]) == "active":
			active += 1
	if active >= TASK_LIMIT:
		return {"ok": false, "error": "career.task.errorActive"}
	for index in tasks.size():
		var task: Dictionary = tasks[index]
		if String(task["id"]) != task_id:
			continue
		if String(task["status"]) != "available":
			return {"ok": false, "error": "career.task.errorUnavailable"}
		var next := task.duplicate(true)
		next["status"] = "active"
		next["acceptedDay"] = day
		tasks[index] = next
		return {"ok": true, "task": next}
	return {"ok": false, "error": "career.task.errorUnavailable"}


## Trend of the last 20 daily closes, used to grade thesis quality.
static func trend_for(candles: Array) -> String:
	if candles.size() < 12:
		return "unknown"
	var last := float(candles[-1].get("c", 0.0))
	var window_start := maxi(0, candles.size() - 20)
	var total := 0.0
	for index in range(window_start, candles.size()):
		total += float(candles[index].get("c", 0.0))
	var average := total / float(candles.size() - window_start)
	if average <= 0.0:
		return "unknown"
	var deviation := (last - average) / average
	if deviation > 0.01:
		return "up"
	if deviation < -0.01:
		return "down"
	return "flat"


static func grade_report(input: Dictionary, ctx: Dictionary) -> Dictionary:
	var summary := String(input.get("summary", "")).strip_edges()
	var last := float(input.get("last", 0.0))
	var target := float(input.get("targetPrice", 0.0))
	var trend := String(input.get("trend", "unknown"))
	var inspected := bool(input.get("inspected", false))
	var financials_done := bool(input.get("financialsDone", false))
	var score := 20
	if summary.length() >= 240:
		score += 30
	elif summary.length() >= 140:
		score += 24
	elif summary.length() >= 80:
		score += 16
	elif summary.length() >= 40:
		score += 8
	score += 15 if inspected else 5
	if last > 0.0 and target > 0.0:
		var deviation := absf(target - last) / last
		if deviation <= 0.15:
			score += 15
		elif deviation <= 0.3:
			score += 10
		elif deviation <= 0.5:
			score += 5
		else:
			score += 2
	var thesis := String(input.get("thesis", "neutral"))
	var thesis_matches := (thesis == "bull" and trend == "up") \
		or (thesis == "bear" and trend == "down") \
		or (thesis == "neutral" and (trend == "flat" or trend == "unknown"))
	var conviction := int(_clamp(float(input.get("conviction", 3)), 1.0, 5.0, 3.0))
	if thesis_matches:
		score += 15
	elif conviction <= 2:
		score += 8
	else:
		score += 4
	if financials_done:
		score += 5
	if summary.length() >= 40 and _has_digit(summary):
		score += 10
	var final_score := clampi(score, 0, 100)
	return {"score": final_score, "grade": _grade(final_score), "trend": trend}


static func _has_digit(text: String) -> bool:
	for character in text:
		if character >= "0" and character <= "9":
			return true
	return false


static func submit_report(career: Dictionary, input: Dictionary, ctx: Dictionary,
		day: int) -> Dictionary:
	var tasks: Array = career.get("tasks", [])
	var task_index := -1
	for index in tasks.size():
		if String(tasks[index]["id"]) == String(input.get("taskId", "")):
			task_index = index
			break
	if task_index < 0:
		return {"ok": false, "error": "career.report.errorTask"}
	var task: Dictionary = tasks[task_index]
	if String(task["status"]) != "active":
		return {"ok": false, "error": "career.report.errorTaskState"}
	var summary := String(input.get("summary", "")).strip_edges()
	if summary.length() < 40:
		return {"ok": false, "error": "career.report.errorSummary"}
	var target_price := float(input.get("targetPrice", 0.0))
	if not is_finite(target_price) or target_price <= 0.0:
		return {"ok": false, "error": "career.report.errorTarget"}
	var thesis := String(input.get("thesis", ""))
	if not REPORT_THESES.has(thesis):
		return {"ok": false, "error": "career.report.errorThesis"}
	var conviction := float(input.get("conviction", 0))
	if not is_finite(conviction) or conviction < 1.0 or conviction > 5.0:
		return {"ok": false, "error": "career.report.errorConviction"}
	var graded := grade_report({
		"summary": summary, "targetPrice": target_price, "thesis": thesis,
		"conviction": conviction, "last": float(ctx.get("last", 0.0)),
		"trend": String(ctx.get("trend", "unknown")),
		"inspected": bool(ctx.get("inspected", false)),
		"financialsDone": bool(ctx.get("financialsDone", false)),
	}, ctx)
	var report := {
		"id": "report-%d" % int(career.get("reportSeq", 1)),
		"taskId": String(task["id"]), "ticker": String(task["ticker"]),
		"thesis": thesis, "conviction": int(roundf(conviction)),
		"targetPrice": SmaFormat.round_to(target_price, 2),
		"summary": summary.substr(0, 2000), "day": day,
		"score": int(graded["score"]), "grade": String(graded["grade"]),
	}
	var passed := int(graded["score"]) >= REPORT_MIN_SCORE
	var cash := 0.0
	if passed:
		cash = SmaFormat.round_to(float(task["rewardCash"]) \
			* float(graded["score"]) / 100.0, 2)
	var bonus_xp := 0
	if String(graded["grade"]) == "A":
		bonus_xp = 40
	elif String(graded["grade"]) == "B":
		bonus_xp = 20
	elif String(graded["grade"]) == "C":
		bonus_xp = 10
	var xp_gained := 0
	if passed:
		xp_gained = SmaAcademy.award_xp(ctx["academy"], "career:report:%s" % report["id"],
			int(task["rewardXp"]) + bonus_xp)
	var records: Array = career.get("reports", []).duplicate(true)
	records.push_front(report)
	career["reports"] = records.slice(0, MAX_REPORTS)
	career["reportSeq"] = int(career.get("reportSeq", 1)) + 1
	var updated := task.duplicate(true)
	updated["status"] = "completed"
	updated["completedDay"] = day
	updated["reportId"] = String(report["id"])
	tasks[task_index] = updated
	career["tasks"] = tasks
	return {"ok": true, "report": report, "task": updated, "xp": xp_gained,
		"cash": cash, "passed": passed}


static func evaluate(career: Dictionary, ctx: Dictionary, day: int) -> Dictionary:
	if int(career.get("rank", 1)) < 2:
		return {"due": false, "evaluation": {}, "xp": 0}
	if day < int(career["lastEvalDay"]) + EVAL_INTERVAL:
		return {"due": false, "evaluation": {}, "xp": 0}
	var from_day := int(career["lastEvalDay"])
	var history: Array = ctx.get("equityHistory", [])
	var values: Array = []
	for entry in history:
		var entry_day := int(entry.get("day", -1))
		if entry_day >= from_day and entry_day <= day:
			values.append(float(entry.get("equity", 0.0)))
	var start: float = float(values[0]) if not values.is_empty() \
		else float(ctx.get("initialCash", 0.0))
	var finish: float = float(values[-1]) if not values.is_empty() \
		else float(ctx.get("equity", 0.0))
	var return_pct: float = (finish - start) / start * 100.0 if start > 0.0 else 0.0
	var peak: float = start
	var worst := 0.0
	for value in values:
		peak = maxf(peak, value)
		if peak > 0.0:
			worst = minf(worst, (value - peak) / peak)
	var drawdown_pct := absf(worst * 100.0)
	var reports := 0
	var passed_reports := 0
	var score_sum := 0.0
	for report in career.get("reports", []):
		var report_day := int(report.get("day", -1))
		if report_day < from_day or report_day > day:
			continue
		reports += 1
		score_sum += float(report.get("score", 0))
		if int(report.get("score", 0)) >= REPORT_MIN_SCORE:
			passed_reports += 1
	var avg_report := score_sum / float(reports) if reports > 0 else 0.0
	var score := 55.0
	score += clampf(return_pct * 2.0, -25.0, 25.0)
	score -= minf(25.0, drawdown_pct * 1.5)
	score += minf(15.0, float(reports) * 5.0)
	if avg_report >= 60.0:
		score += minf(10.0, (avg_report - 60.0) / 4.0)
	var final_score := clampi(int(roundf(score)), 0, 100)
	var grade := _grade(final_score)
	var xp_table := {"A": 120, "B": 80, "C": 40, "D": 15}
	var xp_gained := SmaAcademy.award_xp(ctx["academy"],
		"career:eval:%d" % int(career.get("evalSeq", 1)), int(xp_table[grade]))
	var evaluation := {
		"id": "eval-%d" % int(career.get("evalSeq", 1)), "day": day,
		"fromDay": from_day, "equityStart": SmaFormat.round_to(start, 2),
		"equityEnd": SmaFormat.round_to(finish, 2),
		"returnPct": SmaFormat.round_to(return_pct, 2),
		"drawdownPct": SmaFormat.round_to(drawdown_pct, 2),
		"reports": passed_reports, "avgReportScore": SmaFormat.round_to(avg_report, 1),
		"score": final_score, "grade": grade, "xp": xp_gained,
	}
	var evaluations: Array = career.get("evaluations", []).duplicate(true)
	evaluations.push_front(evaluation)
	career["evaluations"] = evaluations.slice(0, MAX_EVALUATIONS)
	career["lastEvalDay"] = day
	career["evalSeq"] = int(career.get("evalSeq", 1)) + 1
	return {"due": true, "evaluation": evaluation, "xp": xp_gained}


static func promote(career: Dictionary, ctx: Dictionary, day: int) -> Dictionary:
	var data := progress(career, ctx)
	if data["next"].is_empty():
		return {"ok": false, "error": "career.errorMaxRank"}
	if not bool(data["ready"]):
		return {"ok": false, "error": "career.errorNotReady"}
	var next_rank: Dictionary = data["next"]
	career["rank"] = int(next_rank["number"])
	career["promotedAtDay"] = day
	var history: Array = career.get("history", []).duplicate(true)
	history.append({"rank": int(next_rank["number"]), "day": day})
	career["history"] = history.slice(maxi(0, history.size() - 16))
	var xp_gained := SmaAcademy.award_xp(ctx["academy"],
		"career:rank:%d" % int(next_rank["number"]), int(next_rank["xp"]))
	refresh_tasks(career, day, ctx.get("tickers", []))
	var synced := sync_certificates(career, ctx, day)
	return {"ok": true, "rank": next_rank, "xp": xp_gained,
		"certificates": synced["newlyEarned"]}


static func apply_salary(account: Dictionary, career: Dictionary, day: int) -> Dictionary:
	var rank := rank_def(int(career.get("rank", 1)))
	var salary := float(rank["salary"])
	if salary <= 0.0:
		return {"paid": false, "amount": 0.0}
	if day < int(career.get("salaryPaidDay", 0)) + SALARY_INTERVAL:
		return {"paid": false, "amount": 0.0}
	career["salaryPaidDay"] = int(career.get("salaryPaidDay", 0)) + SALARY_INTERVAL
	account["cash"] = SmaFormat.round_to(float(account.get("cash", 0.0)) + salary, 2)
	account["careerIncome"] = SmaFormat.round_to(
		float(account.get("careerIncome", 0.0)) + salary, 2)
	return {"paid": true, "amount": salary}


static func requirement_unit(requirement: Dictionary) -> Dictionary:
	if requirement.has("unitId"):
		return SmaAcademy.unit(String(requirement["unitId"]))
	return {}


static func requirement_challenge(requirement: Dictionary) -> Dictionary:
	if requirement.has("challengeId"):
		return SmaChallenges.by_id(String(requirement["challengeId"]))
	return {}
