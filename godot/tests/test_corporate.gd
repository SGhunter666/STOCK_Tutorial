## Corporate-action calendar, splits, halts, rights and delisting.
extends "res://tests/test_base.gd"


func _end_session(exchange: SmaExchange) -> void:
	exchange.state["second"] = SmaExchange.SESSION_SECONDS - 1
	exchange.advance_second()


func run() -> void:
	describe("corporate-quarter-open")
	var exchange := SmaExchange.new("corporate-test")
	exchange.state["account"]["positions"]["NCRT"] = {"qty": 10, "avgCost": 88.0}
	exchange.state["account"]["positions"]["NGLB"] = {"qty": 100, "avgCost": 18.0}
	exchange.state["dayIndex"] = 125
	var price_before := float(exchange.state["companies"]["NCRT"]["last"])
	_end_session(exchange)
	eq(int(exchange.state["dayIndex"]), 126, "quarter boundary reached")
	var cs: Dictionary = exchange.state["companies"]["NCRT"]
	approx(float(cs["splitFactor"]), 2.0, 0.0001, "NCRT split applied")
	approx(float(cs["last"]), price_before / 2.0, 0.02, "split halves the price")
	eq(int(exchange.state["account"]["positions"]["NCRT"]["qty"]), 20,
		"position quantity doubles")
	approx(float(exchange.state["account"]["positions"]["NCRT"]["avgCost"]), 44.0, 0.01,
		"average cost halves")
	var action_types: Array = []
	for action in exchange.state["corporateActions"]:
		action_types.append(String(action["type"]))
	check(action_types.has("split"), "split recorded")

	# Halt, capital, rights and structural actions use offsets inside a quarter.
	exchange.state["dayIndex"] = 136
	SmaCorporate.apply_session_open(exchange.state)
	describe("corporate-halt")
	var halted: Dictionary = exchange.state["companies"]["VCFD"]
	check(halted["haltedUntilDay"] != null, "VCFD halt window set")
	eq(exchange.is_trading_halted("VCFD"), true, "halted ticker is not tradable")
	var rejected := exchange.submit_order({"ticker": "VCFD", "side": "buy",
		"type": "market", "qty": 1})
	eq(bool(rejected.get("ok", false)), false, "orders blocked during a halt")

	exchange.state["dayIndex"] = 146
	SmaCorporate.apply_session_open(exchange.state)
	exchange.state["dayIndex"] = 151
	SmaCorporate.apply_session_open(exchange.state)

	describe("corporate-rights")
	var offerings: Array = exchange.rights_offerings()
	eq(offerings.size(), 1, "one rights offering open")
	if not offerings.is_empty():
		var offering: Dictionary = offerings[0]
		eq(String(offering["ticker"]), "NGLB", "rights attached to NGLB")
		eq(int(offering["entitled"]), 20, "entitlement is proportional to holdings")
		var cash_before := float(exchange.state["account"]["cash"])
		var subscribed := exchange.subscribe_rights(String(offering["id"]))
		eq(bool(subscribed.get("ok", false)), true, "rights subscription accepted")
		eq(int(exchange.state["account"]["positions"]["NGLB"]["qty"]), 120,
			"rights shares added")
		check(float(exchange.state["account"]["cash"]) < cash_before,
			"subscription paid in cash")

	exchange.state["dayIndex"] = 171
	SmaCorporate.apply_session_open(exchange.state)
	action_types.clear()
	for action in exchange.state["corporateActions"]:
		action_types.append(String(action["type"]))
	check(action_types.has("merger"), "merger recorded")
	check(action_types.has("halt"), "halt recorded")
	check(action_types.has("rights"), "rights issue recorded")
	check(action_types.has("offering"), "secondary offering recorded")

	describe("corporate-persistence")
	var restored := SmaExchange.from_dict(exchange.to_dict())
	check(restored != null, "corporate state restores")
	eq(restored.state["corporateActions"].size(),
		exchange.state["corporateActions"].size(), "corporate actions persisted")
	check(restored.state["rightsOfferings"].size() > 0, "rights offerings persisted")

	describe("corporate-delisting")
	var delist_exchange := SmaExchange.new("delist-test")
	delist_exchange.state["account"]["positions"]["TDFU"] = {"qty": 10, "avgCost": 5.0}
	delist_exchange.state["dayIndex"] = 306
	_end_session(delist_exchange)
	eq(bool(delist_exchange.state["companies"]["TDFU"]["delisted"]), true,
		"TDFU delisted at the scheduled quarter")
	eq(delist_exchange.state["account"]["positions"].has("TDFU"), false,
		"delisted position liquidated")
	eq(delist_exchange.is_trading_halted("TDFU"), true, "delisted ticker cannot trade")
