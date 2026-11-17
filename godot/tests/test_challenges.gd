## Challenge lifecycle and metric rules.
extends "res://tests/test_base.gd"


func _academy_with(unit_ids: Array) -> Dictionary:
	var state := SmaAcademy.create_state()
	for unit_id in unit_ids:
		SmaAcademy.ensure_unit(state, String(unit_id))["completed"] = true
	return state


func run() -> void:
	describe("challenge-catalog")
	eq(SmaChallenges.DEFS.size(), 6, "six challenge definitions")
	eq(SmaChallenges.by_id("hedger").get("unlockUnit", ""), "u30", "hedger unlocks at u30")
	eq(SmaChallenges.by_id("missing").is_empty(), true, "unknown challenge returns empty")

	describe("challenge-locking")
	var blocked := SmaChallenges.create_state()
	var academy := _academy_with(["u3"])
	eq(bool(SmaChallenges.start(blocked, academy, "riskManager", 0, 100000.0).get("ok", false)),
		false, "locked challenge cannot start")
	var started := SmaChallenges.start(blocked, academy, "firstProfit", 2, 100000.0)
	eq(bool(started.get("ok", false)), true, "unlocked challenge starts")
	eq(int(blocked["active"]["startDay"]), 2, "start day recorded")
	approx(float(blocked["active"]["startEquity"]), 100000.0, 0.001, "start equity recorded")
	eq(bool(SmaChallenges.start(blocked, academy, "firstProfit", 3, 100000.0).get("ok", false)),
		false, "only one active challenge at a time")

	describe("challenge-metrics")
	var exchange := SmaExchange.new("challenge-test")
	var state := SmaChallenges.create_state()
	SmaChallenges.start(state, academy, "firstProfit", int(exchange.state["dayIndex"]),
		exchange.equity())
	var buy := exchange.submit_order({"ticker": "APLA", "side": "buy", "type": "market",
		"qty": 10})
	eq(bool(buy.get("ok", false)), true, "challenge trade accepted")
	var sell := exchange.submit_order({"ticker": "APLA", "side": "sell", "type": "market",
		"qty": 10})
	eq(bool(sell.get("ok", false)), true, "closing trade accepted")
	var metrics := SmaChallenges.metrics(state, exchange)
	eq(int(metrics["trades"]), 2, "both stock fills counted")
	eq(int(metrics["allRound"]), 0, "stock-only run is not all-round")

	describe("challenge-completion")
	state["active"]["startEquity"] = SmaFormat.round_to(exchange.equity() * 0.9, 2)
	var done := SmaChallenges.check(state, academy, exchange)
	eq(String(done.get("status", "")), "completed", "target and trade count complete the run")
	eq(state["active"].is_empty(), true, "active run cleared after completion")
	eq(state["completed"].has("firstProfit"), true, "completed challenge recorded")
	check(int(academy["xp"]) > 0, "completion awards XP")

	describe("challenge-timeout")
	var timeout_state := SmaChallenges.create_state()
	SmaChallenges.start(timeout_state, academy, "firstProfit", 0, 100000.0)
	exchange.state["dayIndex"] = 30
	var timeout := SmaChallenges.check(timeout_state, academy, exchange)
	eq(String(timeout.get("status", "")), "failed", "deadline fails the run")
	eq(timeout_state["failed"].has("firstProfit"), true, "failed challenge recorded")

	describe("challenge-structure")
	var hedge_state := SmaChallenges.create_state()
	var hedge_academy := _academy_with(["u30"])
	SmaChallenges.start(hedge_state, hedge_academy, "hedger", 0, 100000.0)
	exchange.state["account"]["positions"]["APLA"] = {"qty": 100, "avgCost": 100.0}
	exchange.state["account"]["futures"] = [{"ticker": "APLA", "side": "short", "qty": 1}]
	eq(int(SmaChallenges.metrics(hedge_state, exchange)["hedge"]), 1,
		"long stock plus short future is a hedge")

	var income_state := SmaChallenges.create_state()
	SmaChallenges.start(income_state, exchange_academy(), "incomeDesk", 0, 100000.0)
	exchange.state["account"]["options"] = [{
		"type": "call", "ticker": "APLA", "qty": -1, "strike": 200.0, "expiryDay": 9,
	}]
	eq(int(SmaChallenges.metrics(income_state, exchange)["income"]), 1,
		"covered call counts as income")
	exchange.state["account"]["options"] = [
		{"type": "call", "ticker": "APLA", "qty": 1, "strike": 200.0, "expiryDay": 9},
		{"type": "put", "ticker": "APLA", "qty": 1, "strike": 150.0, "expiryDay": 9},
	]
	eq(int(SmaChallenges.metrics(income_state, exchange)["volatility"]), 1,
		"same-expiry call and put count as a volatility position")


func exchange_academy() -> Dictionary:
	return _academy_with(["u3", "u15", "u30", "u32", "u26", "u28"])
