extends "res://tests/test_base.gd"


func run() -> void:
	describe("save-json-roundtrip")
	var exchange := SmaExchange.new("save-seed", 100000.0)
	exchange.submit_order({"ticker": "GOGL", "side": "buy", "type": "market", "qty": 12})
	exchange.advance_seconds(25)
	exchange.set_option_style("american")
	var payload := exchange.to_dict()
	var text := JSON.stringify(payload)
	var parsed: Variant = JSON.parse_string(text)
	check(typeof(parsed) == TYPE_DICTIONARY, "payload survives JSON")
	var restored := SmaExchange.from_dict(parsed)
	check(restored != null, "restored exchange is valid")
	eq(int(restored.state["account"]["positions"]["GOGL"]["qty"]), 12, "position restored from JSON")
	approx(restored.equity(), exchange.equity(), 0.01, "equity restored from JSON")
	eq(int(restored.state["dayIndex"]), int(exchange.state["dayIndex"]), "day restored")
	eq(int(restored.state["second"]), int(exchange.state["second"]), "second restored")
	approx(float(restored.quote("GOGL")["last"]), float(exchange.quote("GOGL")["last"]), 0.0001,
		"quotes derive from restored prices")
	eq(restored.option_style(), "american", "option settlement style restored")

	describe("save-orders")
	var exchange2 := SmaExchange.new("save-orders", 100000.0)
	var last := float(exchange2.quote("VISO")["last"])
	var limit := exchange2.submit_order({
		"ticker": "VISO", "side": "buy", "type": "limit", "qty": 7,
		"limitPrice": last * 0.6,
	})
	check(bool(limit["ok"]), "resting order created")
	var restored2 := SmaExchange.from_dict(JSON.parse_string(JSON.stringify(exchange2.to_dict())))
	eq(restored2.open_order_rows("player").size(), 1, "working order restored")
	var book := restored2.get_book("VISO", 30)
	var has_resting := false
	for bid in book["bids"]:
		if absf(float(bid["price"]) - float(limit["order"]["limitPrice"])) < 0.011:
			has_resting = true
	check(has_resting, "resting order reinserted into the book")

	describe("save-corruption")
	var bad := SmaExchange.from_dict({"version": 99, "companies": {}})
	check(bad == null, "unsupported save version is rejected")
	var bad2 := SmaExchange.from_dict({"version": 1})
	check(bad2 == null, "missing companies are rejected")

	describe("save-file-service")
	var test_path := "user://saves/test-save.json"
	SmaSaveService.clear(test_path)
	var ok := SmaSaveService.write({"version": 1, "hello": "world"}, test_path)
	check(ok, "save service writes a file")
	var loaded := SmaSaveService.read(test_path)
	eq(loaded.get("hello", ""), "world", "save service reads it back")
	SmaSaveService.clear(test_path)
	check(not SmaSaveService.exists(test_path), "save service clears the slot")
