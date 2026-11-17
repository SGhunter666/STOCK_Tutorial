## Career screen: rank ladder, promotion requirements, research tasks, report
## submission, performance reviews, certificates and salary status.
class_name SmaCareerScreen
extends SmaScreen

var _body: VBoxContainer
var _drafts: Dictionary = {}


func _build() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	var root := SmaKit.vbox(10)
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(root)
	var scroll := SmaKit.scroll()
	root.add_child(scroll)
	_body = SmaKit.vbox(12)
	scroll.add_child(_body)


func refresh(_reason: String = "") -> void:
	if not built:
		return
	SmaKit.clear_children(_body)
	if game == null or not game.started:
		return
	var data: Dictionary = game.career_progress()
	_render_header(data)
	_render_stats(data)
	_render_current(data)
	_render_tasks(data)
	_render_reports(data)
	_render_evaluations(data)
	_render_certificates(data)
	_render_ladder(data)
	_body.add_child(SmaKit.muted(I18n.t("career.note"), 10))


func _render_header(data: Dictionary) -> void:
	var header := SmaKit.hbox(10)
	var titles := SmaKit.vbox(2)
	titles.add_child(SmaKit.label(I18n.t("career.title"), 20))
	var subtitle := SmaKit.muted(I18n.t("career.subtitle"), 12)
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	titles.add_child(subtitle)
	header.add_child(titles)
	header.add_child(SmaKit.hspacer())
	header.add_child(SmaKit.label(I18n.t(String(data["rank"]["titleKey"])), 12,
		SmaUiTheme.ACCENT))
	_body.add_child(header)


func _render_stats(data: Dictionary) -> void:
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_child(_stat("career.currentRank", I18n.t(String(data["rank"]["titleKey"])),
		I18n.t("career.rankLabel", {"number": int(data["rank"]["number"])})))
	grid.add_child(_stat("career.salaryLabel",
		SmaFormat.money(float(data["salary"])) if float(data["salary"]) > 0.0
			else I18n.t("career.noSalary"),
		I18n.t("career.salaryIn", {"days": int(data["daysToSalary"])})
			if int(data["daysToSalary"]) >= 0 else I18n.t("career.noSalarySub")))
	grid.add_child(_stat("career.careerIncome", SmaFormat.money(float(data["careerIncome"])),
		I18n.t("career.careerIncomeSub")))
	grid.add_child(_stat("career.xpLabel", SmaFormat.num(float(game.academy.get("xp", 0)), 0),
		I18n.t("career.xpSub")))
	_body.add_child(grid)


func _stat(label_key: String, value: String, sub: String) -> PanelContainer:
	var card := SmaKit.card(10)
	var box := SmaKit.vbox(2)
	card.add_child(box)
	box.add_child(SmaKit.caption(I18n.t(label_key)))
	box.add_child(SmaKit.label(value, 15))
	box.add_child(SmaKit.muted(sub, 10))
	return card


func _render_current(data: Dictionary) -> void:
	var rank: Dictionary = data["rank"]
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(7)
	card.add_child(box)
	var head := SmaKit.hbox(8)
	head.add_child(SmaKit.label(I18n.t("career.currentTitle"), 15))
	head.add_child(SmaKit.hspacer())
	var next: Dictionary = data["next"]
	head.add_child(SmaKit.muted(I18n.t("career.nextRankLabel") + ": " + (
		I18n.t(String(next["titleKey"])) if not next.is_empty()
			else I18n.t("career.maxRank")), 11))
	box.add_child(head)
	var description := SmaKit.muted(I18n.t(String(rank["descKey"])), 11)
	description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(description)

	var requirements: Array = data["requirements"]
	if requirements.is_empty():
		box.add_child(SmaKit.muted(I18n.t("career.maxRankText"), 11))
	for requirement in requirements:
		var row := SmaKit.vbox(2)
		var line := SmaKit.hbox(8)
		var done := bool(requirement["done"])
		line.add_child(SmaKit.label("✓" if done else "○", 12,
			SmaUiTheme.POSITIVE if done else SmaUiTheme.DIM))
		line.add_child(SmaKit.label(_requirement_label(requirement), 12,
			SmaUiTheme.TEXT if done else SmaUiTheme.MUTED))
		line.add_child(SmaKit.hspacer())
		line.add_child(SmaKit.muted(_requirement_value(requirement), 11))
		row.add_child(line)
		var bar := ProgressBar.new()
		bar.max_value = 100.0
		bar.value = float(requirement["pct"])
		bar.show_percentage = false
		bar.custom_minimum_size.y = 4
		row.add_child(bar)
		box.add_child(row)

	var actions := SmaKit.hbox(8)
	if not next.is_empty():
		var button := SmaKit.button(I18n.t("career.promote", {
			"rank": I18n.t(String(next["titleKey"])),
		}), _promote, true)
		button.disabled = not bool(data["ready"])
		actions.add_child(button)
	else:
		actions.add_child(SmaKit.label(I18n.t("career.maxRankReached"), 11,
			SmaUiTheme.POSITIVE))
	box.add_child(actions)
	box.add_child(SmaKit.muted(I18n.t("career.promoteHint"), 10))
	_body.add_child(card)


func _requirement_label(requirement: Dictionary) -> String:
	var kind := String(requirement["kind"])
	var raw: Dictionary = requirement["requirement"]
	match kind:
		"unit":
			var unit := SmaCareer.requirement_unit(raw)
			return I18n.t("career.req.unit", {"unit": I18n.t(String(unit.get("titleKey", "")))})
		"demo":
			return I18n.t("career.req.demo", {"demo": I18n.t("demo.%s.title" % String(raw.get("demoId", "")))})
		"challenge":
			var challenge := SmaCareer.requirement_challenge(raw)
			return I18n.t("career.req.challenge", {
				"challenge": I18n.t(String(challenge.get("titleKey", ""))),
			})
		"equity":
			return I18n.t("career.req.equity", {
				"value": SmaFormat.money(float(raw.get("target", 0.0))),
			})
		_:
			return I18n.t("career.req.%s" % kind, {"target": int(requirement["target"])})


func _requirement_value(requirement: Dictionary) -> String:
	var kind := String(requirement["kind"])
	var current := minf(float(requirement["rawCurrent"]), float(requirement["target"]))
	var target := float(requirement["target"])
	if kind == "equity":
		return "%s / %s" % [SmaFormat.money(current), SmaFormat.money(target)]
	return I18n.t("career.progressValue", {
		"current": SmaFormat.num(current, 0), "target": SmaFormat.num(target, 0),
	})


func _promote() -> void:
	game.promote_career()
	refresh()


func _render_tasks(data: Dictionary) -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(7)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("career.tasksTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("career.tasksSubtitle", {
		"active": int(data["activeTasks"]), "available": int(data["availableTasks"]),
	}), 11))
	var tasks: Array = data["tasks"].duplicate(true)
	tasks.reverse()
	if tasks.is_empty():
		box.add_child(SmaKit.muted(I18n.t("career.tasksEmpty"), 12))
	for task in tasks.slice(0, 6):
		box.add_child(_task_entry(task))
	_body.add_child(card)


func _task_entry(task: Dictionary) -> PanelContainer:
	var status := String(task["status"])
	var card := SmaKit.card(9)
	var box := SmaKit.vbox(4)
	card.add_child(box)
	var head := SmaKit.hbox(8)
	var titles := SmaKit.vbox(1)
	titles.add_child(SmaKit.label(I18n.t(String(task["titleKey"])), 13))
	titles.add_child(SmaKit.muted(I18n.t(String(task["descKey"]), {
		"ticker": String(task["ticker"]),
	}), 11))
	head.add_child(titles)
	head.add_child(SmaKit.hspacer())
	head.add_child(SmaKit.label(I18n.t("career.task.status.%s" % status), 11,
		SmaUiTheme.MUTED))
	box.add_child(head)
	box.add_child(SmaKit.muted(I18n.t("career.task.deadline", {
		"day": SmaCalendar.iso_date(int(task["deadlineDay"])),
	}) + " · " + I18n.t("career.task.rewardXp", {"xp": int(task["rewardXp"])})
		+ " · " + I18n.t("career.task.rewardCash", {
			"cash": SmaFormat.money(float(task["rewardCash"])),
		}), 10))
	if status == "available":
		box.add_child(SmaKit.button(I18n.t("career.task.accept"),
			_accept_task.bind(String(task["id"])), true))
	elif status == "active":
		box.add_child(_report_form(task))
	elif status == "completed" and task.get("reportId", null) != null:
		var report := _find_report(String(task["reportId"]))
		if not report.is_empty():
			box.add_child(SmaKit.label(I18n.t("career.task.completedScore", {
				"grade": String(report["grade"]), "score": int(report["score"]),
			}), 11, SmaUiTheme.POSITIVE))
	return card


func _find_report(report_id: String) -> Dictionary:
	for report in game.career.get("reports", []):
		if String(report.get("id", "")) == report_id:
			return report
	return {}


func _accept_task(task_id: String) -> void:
	game.accept_research_task(task_id)
	refresh()


func _report_form(task: Dictionary) -> VBoxContainer:
	var box := SmaKit.vbox(5)
	var task_id := String(task["id"])
	var draft: Dictionary = _drafts.get(task_id, {})
	var context_data: Dictionary = game.career_report_context(task_id)
	var last := float(context_data.get("last", 0.0))
	if draft.is_empty():
		draft = {
			"thesis": 0, "conviction": 2, "target": maxf(0.01, last * 1.05),
			"summary": "",
		}
		_drafts[task_id] = draft

	var row := SmaKit.hbox(10)
	var thesis_box := SmaKit.vbox(1)
	thesis_box.add_child(SmaKit.caption(I18n.t("career.report.thesis")))
	var thesis := OptionButton.new()
	for key in ["bull", "bear", "neutral"]:
		thesis.add_item(I18n.t("career.report.%s" % key))
	thesis.selected = int(draft["thesis"])
	thesis_box.add_child(thesis)
	row.add_child(thesis_box)

	var conviction_box := SmaKit.vbox(1)
	conviction_box.add_child(SmaKit.caption(I18n.t("career.report.conviction")))
	var conviction := OptionButton.new()
	for value in [1, 2, 3, 4, 5]:
		conviction.add_item(I18n.t("career.report.convictionValue", {"value": value}))
	conviction.selected = int(draft["conviction"]) - 1
	conviction_box.add_child(conviction)
	row.add_child(conviction_box)

	var target_box := SmaKit.vbox(1)
	target_box.add_child(SmaKit.caption(I18n.t("career.report.target")))
	var target := SpinBox.new()
	target.min_value = 0.01
	target.max_value = 1000000
	target.step = 0.01
	target.value = float(draft["target"])
	target.custom_minimum_size.x = 130
	target_box.add_child(target)
	row.add_child(target_box)
	box.add_child(row)

	box.add_child(SmaKit.caption(I18n.t("career.report.summary")))
	var summary := TextEdit.new()
	summary.custom_minimum_size.y = 80
	summary.text = String(draft["summary"])
	summary.placeholder_text = I18n.t("career.report.summaryHint")
	box.add_child(summary)
	box.add_child(SmaKit.muted(I18n.t("career.report.summaryNote", {"min": 40}), 10))

	var actions := SmaKit.hbox(8)
	var submit := SmaKit.button(I18n.t("career.report.submit"), Callable(), true)
	submit.pressed.connect(func():
		_drafts[task_id] = {
			"thesis": thesis.selected,
			"conviction": conviction.selected + 1,
			"target": target.value,
			"summary": summary.text,
		}
		game.submit_investment_report({
			"taskId": task_id,
			"thesis": ["bull", "bear", "neutral"][thesis.selected],
			"conviction": conviction.selected + 1,
			"targetPrice": target.value,
			"summary": summary.text,
		})
		refresh())
	actions.add_child(submit)
	box.add_child(actions)
	return box


func _render_reports(data: Dictionary) -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("career.reportsTitle"), 15))
	var reports: Array = data["reports"]
	box.add_child(SmaKit.muted(I18n.t("career.reportsSubtitle", {
		"passed": int(data["passedReports"]), "total": reports.size(),
	}), 11))
	if reports.is_empty():
		box.add_child(SmaKit.muted(I18n.t("career.reportsEmpty"), 12))
	else:
		box.add_child(SmaKit.header_row(
			["career.report.day", "career.report.ticker", "career.report.thesis",
				"career.report.target", "career.report.grade", "career.report.score"],
			[1.0, 0.8, 0.9, 1.0, 0.7, 0.7],
			[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_LEFT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT]))
		for report in reports.slice(0, 8):
			box.add_child(SmaKit.data_row([
				SmaCalendar.iso_date(int(report["day"])), String(report["ticker"]),
				I18n.t("career.report.%s" % String(report["thesis"])),
				SmaFormat.money(float(report["targetPrice"])), String(report["grade"]),
				SmaFormat.num(float(report["score"]), 0),
			], [1.0, 0.8, 0.9, 1.0, 0.7, 0.7]))
	_body.add_child(card)


func _render_evaluations(data: Dictionary) -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("career.evalsTitle"), 15))
	var evaluations: Array = data["evaluations"]
	if evaluations.is_empty():
		box.add_child(SmaKit.muted(I18n.t("career.evalsEmpty"), 12))
	else:
		box.add_child(SmaKit.header_row(
			["career.eval.day", "career.eval.return", "career.eval.drawdown",
				"career.eval.reports", "career.report.grade", "career.report.score"],
			[1.0, 0.9, 0.9, 0.8, 0.7, 0.7],
			[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT]))
		for evaluation in evaluations.slice(0, 6):
			var return_pct := float(evaluation["returnPct"])
			box.add_child(SmaKit.data_row([
				SmaCalendar.iso_date(int(evaluation["day"])),
				SmaFormat.pct(return_pct, 2),
				SmaFormat.pct_plain(float(evaluation["drawdownPct"]), 2),
				SmaFormat.num(float(evaluation["reports"]), 0),
				String(evaluation["grade"]), SmaFormat.num(float(evaluation["score"]), 0),
			], [1.0, 0.9, 0.9, 0.8, 0.7, 0.7],
			[SmaUiTheme.TEXT, SmaKit.value_color(return_pct), SmaUiTheme.NEGATIVE,
				SmaUiTheme.TEXT, SmaUiTheme.TEXT, SmaUiTheme.TEXT],
			[HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_RIGHT, HORIZONTAL_ALIGNMENT_RIGHT,
				HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_RIGHT]))
	_body.add_child(card)


func _render_certificates(data: Dictionary) -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("career.certsTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("career.certsSubtitle"), 11))
	for certificate in data["certificates"]:
		var earned := bool(certificate["earned"])
		var line := SmaKit.hbox(8)
		line.add_child(SmaKit.label("✓" if earned else "○", 12,
			SmaUiTheme.POSITIVE if earned else SmaUiTheme.DIM))
		line.add_child(SmaKit.label(I18n.t(String(certificate["titleKey"])), 12))
		line.add_child(SmaKit.hspacer())
		line.add_child(SmaKit.muted(
			I18n.t("career.cert.earned") if earned else I18n.t("career.progressValue", {
				"current": int(certificate["current"]), "target": int(certificate["target"]),
			}), 10))
		box.add_child(line)
	_body.add_child(card)


func _render_ladder(data: Dictionary) -> void:
	var card := SmaKit.card(12)
	var box := SmaKit.vbox(5)
	card.add_child(box)
	box.add_child(SmaKit.label(I18n.t("career.ladderTitle"), 15))
	box.add_child(SmaKit.muted(I18n.t("career.ladderSubtitle"), 11))
	var current := int(data["rank"]["number"])
	for rank in SmaCareer.RANKS:
		var number := int(rank["number"])
		var line := SmaKit.hbox(8)
		var color := SmaUiTheme.ACCENT if number == current else (
			SmaUiTheme.POSITIVE if number < current else SmaUiTheme.DIM)
		line.add_child(SmaKit.label("%d" % number, 12, color))
		line.add_child(SmaKit.label(I18n.t(String(rank["titleKey"])), 12,
			SmaUiTheme.TEXT if number <= current else SmaUiTheme.MUTED))
		line.add_child(SmaKit.hspacer())
		line.add_child(SmaKit.muted(I18n.t("career.salaryValue", {
			"amount": SmaFormat.money(float(rank["salary"])),
			"days": SmaCareer.SALARY_INTERVAL,
		}) if float(rank["salary"]) > 0.0 else I18n.t("career.noSalary"), 10))
		box.add_child(line)
	_body.add_child(card)
