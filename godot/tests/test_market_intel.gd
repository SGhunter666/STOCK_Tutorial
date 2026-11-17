extends "res://tests/test_base.gd"


func _news_state() -> Dictionary:
	var companies := {}
	for ticker in ["APLA", "NVDO", "ZENX"]:
		var company := SmaCompanyCatalog.get_company(ticker)
		companies[ticker] = {
			"last": float(company.get("price", 100.0)),
			"prevClose": float(company.get("price", 100.0)),
			"open": float(company.get("price", 100.0)),
			"high": float(company.get("price", 100.0)),
			"low": float(company.get("price", 100.0)),
			"company": company,
		}
	return {"dayIndex": 7, "companies": companies, "news": [], "newsSeq": 1}


func run() -> void:
	describe("macro-calendar")
	var calendar := SmaMacro.calendar(100, "intel-seed")
	check(calendar.size() >= 6, "calendar returns recent and upcoming events")
	var released := 0
	var upcoming := 0
	for event in calendar:
		if bool(event["released"]):
			released += 1
		else:
			upcoming += 1
		check(String(event["type"]) != "", "calendar event has a type")
		check(is_finite(float(event["forecast"])), "calendar event has a forecast")
	check(released > 0, "calendar includes released events")
	check(upcoming > 0, "calendar includes upcoming events")
	var same_calendar := SmaMacro.calendar(100, "intel-seed")
	eq(calendar.size(), same_calendar.size(), "calendar is deterministic")

	describe("macro-global-markets")
	var markets := SmaMacro.global_markets(1020.0, 1.5, 20, "intel-seed")
	eq(markets.size(), 4, "four global regions are returned")
	eq(String(markets[0]["id"]), "us", "the US row comes first")
	approx(float(markets[0]["coupling"]), 1.0, 0.001, "US coupling is one")
	check(float(markets[1]["coupling"]) < 1.0, "non-US coupling is below one")
	check(float(markets[1]["level"]) > 0.0, "global market levels are positive")

	describe("news-engine")
	var emitted: Array = []
	var used_seed := ""
	for index in 50:
		var candidate := _news_state()
		var rng := SmaRng.new("news-test-%d" % index)
		var result := SmaNews.maybe_emit(candidate, rng)
		if not result.is_empty():
			emitted = result
			used_seed = "news-test-%d" % index
			break
	check(not emitted.is_empty(), "news engine emits events within fifty seeds")
	for event in emitted:
		check(String(event["template"]) != "", "news event has a template")
		check(String(event["kind"]) in ["macro", "company"], "news kind is valid")
	var state_a := _news_state()
	var state_b := _news_state()
	var result_a := SmaNews.maybe_emit(state_a, SmaRng.new(used_seed))
	var result_b := SmaNews.maybe_emit(state_b, SmaRng.new(used_seed))
	eq(result_a.size(), result_b.size(), "news output is deterministic")
	for index in result_a.size():
		eq(String(result_a[index]["template"]), String(result_b[index]["template"]),
			"news template is deterministic")
	eq(state_a["news"].size(), result_a.size(), "news feed stores emitted events")

	describe("market-index")
	var exchange := SmaExchange.new("intel-test", 100000.0)
	approx(exchange.market_index(), 1000.0, 1.0, "market index starts at 1000")
	approx(exchange.market_index_change(), 0.0, 5.0,
		"market index change is small on day zero")
