extends "res://tests/test_base.gd"


class FakeHost:
	var cash := 100000.0
	var day := 0
	var trades := 0
	var cash_effects: Array = []
	var messages: Array = []

	func get_cash() -> float:
		return cash

	func get_equity() -> float:
		return cash

	func get_position_qty(_ticker: String) -> int:
		return 0

	func get_trade_count() -> int:
		return trades

	func get_day() -> int:
		return day

	func story_add_cash(amount: float, memo: String) -> void:
		cash += amount
		cash_effects.append([amount, memo])

	func toast(message: String) -> void:
		messages.append(message)

	func localize(value: Variant) -> String:
		if typeof(value) == TYPE_DICTIONARY:
			var table: Dictionary = value
			return String(table.get("zh_CN", table.get("en", "")))
		return String(value)


func _make_service(host: FakeHost) -> SmaStoryService:
	var service := SmaStoryService.new()
	service.setup(host)
	check(service.load_content(), "story content loads")
	return service


func _advance_to_choice(service: SmaStoryService) -> Dictionary:
	for i in 12:
		if not service.is_active():
			break
		var view: Dictionary = service.current_view()
		if String(view.get("type", "")) == "choice":
			return view
		service.advance()
	return service.current_view()


func run() -> void:
	describe("story-load")
	var host := FakeHost.new()
	var service := _make_service(host)
	eq(service.stories.size(), 3, "three stories registered")
	eq(service.triggers.size(), 3, "three trigger definitions registered")

	describe("story-opening")
	service.handle_event("game_new")
	check(service.is_active(), "new game starts the opening")
	var view := service.current_view()
	check(String(view.get("text", "")).contains("远望"), "opening text resolves zh_CN")
	eq(String(view.get("speaker", "")).contains("林岚"), true, "speaker resolves")
	view = _advance_to_choice(service)
	eq(String(view.get("type", "")), "choice", "opening reaches a choice")
	eq(view["choices"].size(), 2, "opening offers two choices")
	check(service.choose(0), "first choice accepted")
	eq(String(service.flags.get("path", "")), "value", "choice sets the path flag")
	for i in 8:
		if not service.is_active():
			break
		service.advance()
	check(not service.is_active(), "opening finishes")

	describe("story-trigger-once")
	service.handle_event("trade_filled", {"ticker": "APLA"})
	check(service.is_active(), "first fill triggers first_trade")
	eq(service.active_id, "first_trade", "correct story started")
	view = _advance_to_choice(service)
	eq(view["choices"].size(), 2, "value path shows its conditional choice plus the basic one")
	check(service.choose(0), "value choice accepted")
	for i in 8:
		if not service.is_active():
			break
		service.advance()
	service.handle_event("trade_filled", {"ticker": "APLA"})
	check(not service.is_active(), "once trigger does not replay")

	describe("story-conditions")
	var host2 := FakeHost.new()
	var service2 := _make_service(host2)
	service2.flags["path"] = "momentum"
	service2.start_story("first_trade")
	var momentum_view := _advance_to_choice(service2)
	eq(momentum_view["choices"].size(), 2, "momentum path also has two visible choices")
	eq(int(momentum_view["choices"][0]["index"]), 1, "value choice is filtered out")

	describe("story-day-condition")
	var host3 := FakeHost.new()
	var service3 := _make_service(host3)
	service3.handle_event("day_closed", {"day": 0})
	check(not service3.is_active(), "day trigger waits for day 1")
	host3.day = 1
	service3.handle_event("day_closed", {"day": 1})
	check(service3.is_active(), "day trigger fires on day 1")
	eq(service3.active_id, "day_one", "day-one story started")

	describe("story-effects")
	var host4 := FakeHost.new()
	var service4 := _make_service(host4)
	service4.stories["effect_test"] = {
		"id": "effect_test",
		"title": {"zh_CN": "效果测试", "en": "Effect test"},
		"start": "choice",
		"nodes": {
			"choice": {
				"type": "choice",
				"text": {"zh_CN": "接受", "en": "Accept"},
				"choices": [{
					"text": {"zh_CN": "领取补贴", "en": "Take the grant"},
					"next": "end",
					"effects": [
						{"set_flag": "paid", "value": true},
						{"add_cash": 250.0, "memo": "grant"},
						{"toast": {"zh_CN": "补贴到账", "en": "Grant received"}},
					],
				}],
			},
			"end": {"type": "end"},
		},
	}
	service4.start_story("effect_test")
	check(service4.choose(0), "effect choice accepted")
	eq(bool(service4.flags.get("paid", false)), true, "set_flag effect applied")
	approx(host4.cash, 100250.0, 0.001, "add_cash effect applied")
	eq(host4.messages.size(), 1, "toast effect forwarded to host")

	describe("story-persistence")
	var saved := service.to_dict()
	var host5 := FakeHost.new()
	var service5 := _make_service(host5)
	service5.from_dict(saved)
	eq(String(service5.flags.get("path", "")), "value", "flags survive restore")
	check(bool(service5.seen.get("opening", false)), "seen stories survive restore")
	eq(service5.stories.size(), 3, "stories are re-registered on load")

	describe("story-resume")
	var host6 := FakeHost.new()
	var service6 := _make_service(host6)
	service6.start_story("opening")
	service6.advance()
	var node_before := String(service6.current_view().get("node_id", ""))
	var host7 := FakeHost.new()
	var service7 := _make_service(host7)
	service7.from_dict(service6.to_dict())
	check(service7.is_active(), "active story survives restore")
	eq(String(service7.current_view().get("node_id", "")), node_before,
		"story resumes at the same node")
