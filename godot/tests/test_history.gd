extends "res://tests/test_base.gd"


func run() -> void:
	describe("history-catalog")
	var service := SmaHistoryService.new()
	eq(service.scenarios().size(), 4, "four historical scenarios")
	eq(service.scenario("2008-crisis").get("events", []).size(), 12, "2008 has curated events")

	describe("history-dataset")
	var dataset := service.load_dataset("2008-crisis")
	check(not dataset.is_empty(), "2008 dataset loads")
	eq(dataset.get("tickers", []).size(), 12, "2008 universe has twelve tickers")
	eq(SmaHistoryService.bar_count(dataset), 504, "2008 has 504 daily bars")
	var long_dataset := service.load_dataset("2015-long")
	eq(long_dataset.get("tickers", []).size(), 75, "long-history universe has 75 tickers")
	eq(SmaHistoryService.bar_count(long_dataset), 2975, "long-history has 2975 bars")
	var covid_dataset := service.load_dataset("2020-covid")
	eq(covid_dataset.get("tickers", []).size(), 115, "sector universe has 115 tickers")
	var symbol := String(dataset["tickers"][0]["symbol"])
	var bars := SmaHistoryService.bars_for(dataset, symbol)
	var bar: Array = bars[0]
	eq(String(bar[0]), "2007-07-02", "first trading date")

	describe("history-intraday")
	var path := SmaHistoryService.intraday_path(bar, symbol)
	eq(path.size(), 8, "eight ticks per day")
	approx(float(path[0]), float(bar[1]), 0.0001, "tick 0 is the open")
	approx(float(path[7]), float(bar[4]), 0.0001, "last tick is the close")
	check(float(path[2]) >= float(bar[3]) and float(path[2]) <= float(bar[2]), "tick 2 stays in range")
	check(float(path[5]) >= float(bar[3]) and float(path[5]) <= float(bar[2]), "tick 5 stays in range")
	for price in path:
		check(float(price) >= float(bar[3]) and float(price) <= float(bar[2]), "path respects daily range")
	var path_again := SmaHistoryService.intraday_path(bar, symbol)
	for index in 8:
		approx(float(path[index]), float(path_again[index]), 0.0, "intraday path is deterministic")

	describe("history-quotes")
	var first_quote := SmaHistoryService.quote_at_tick(dataset, symbol, 0, 0)
	approx(float(first_quote["last"]), float(bar[1]), 0.0001, "tick quote starts at the open")
	var last_quote := SmaHistoryService.quote_at_tick(dataset, symbol, 0, 7)
	approx(float(last_quote["last"]), float(bar[4]), 0.0001, "tick quote ends at the close")
	check(float(last_quote["volume"]) <= float(bar[5]), "intraday volume never exceeds daily volume")

	describe("history-run")
	var run := service.create_run("2008-crisis")
	eq(int(run["dayIndex"]), 20, "run starts after warm-up")
	eq(int(run["startIndex"]), 20, "benchmark starts at the warm-up index")
	approx(float(run["account"]["cash"]), 10000.0, 0.001, "history account starts at 10k")
	var buy := service.trade("2008-crisis", dataset, {"symbol": symbol, "side": "buy", "qty": 10, "tick": 0})
	check(bool(buy.get("ok", false)), "history buy accepted")
	var account: Dictionary = service.run("2008-crisis")["account"]
	eq(int(account["positions"][symbol]["qty"]), 10, "history position recorded")
	check(float(account["cash"]) < 10000.0, "history cash reduced")
	var sell := service.trade("2008-crisis", dataset, {"symbol": symbol, "side": "sell", "qty": 4, "tick": 0})
	check(bool(sell.get("ok", false)), "history sell accepted")
	eq(int(service.run("2008-crisis")["account"]["positions"][symbol]["qty"]), 6, "history position reduced")

	describe("history-advance")
	var before_day := int(service.run("2008-crisis")["dayIndex"])
	var day_closed := false
	for tick in 8:
		var result := service.advance_tick("2008-crisis", dataset)
		day_closed = bool(result["dayClosed"])
	eq(day_closed, true, "eighth tick closes the day")
	eq(int(service.run("2008-crisis")["dayIndex"]), before_day + 1, "day advances")
	eq(int(service.run("2008-crisis")["tick"]), 0, "tick resets")

	describe("history-candles")
	var quotes := SmaHistoryService.quote_at_tick(dataset, symbol,
		int(service.run("2008-crisis")["dayIndex"]), 0)
	var daily := SmaHistoryService.history_candles(dataset, symbol,
		int(service.run("2008-crisis")["dayIndex"]), 0, "1d", float(quotes["last"]))
	check(daily["candles"].size() >= 20, "daily candles include warm-up history")
	var last_daily: Dictionary = daily["candles"][-1]
	eq(String(last_daily["d"]), String(quotes["date"]), "last candle is the current day")
	var intraday := SmaHistoryService.history_candles(dataset, symbol,
		int(service.run("2008-crisis")["dayIndex"]), 0, "5m", float(quotes["last"]))
	eq(intraday["candles"].size(), 1, "tick zero exposes only the first 5m bar")
	var hourly := SmaHistoryService.history_candles(dataset, symbol,
		int(service.run("2008-crisis")["dayIndex"]), 7, "1h", float(quotes["last"]))
	check(hourly["candles"].size() >= 1, "hourly candles aggregate")

	describe("history-events")
	var event_result := service.advance_to_event("2008-crisis", dataset)
	check(bool(event_result.get("reachedEnd", true)) == false, "next event exists")
	var date := SmaHistoryService.current_date(dataset, int(service.run("2008-crisis")["dayIndex"]))
	check(date >= "2007-08-09", "advanced to the next event date")

	describe("history-summary")
	var summary := service.summary("2008-crisis", dataset)
	check(is_finite(float(summary["returnPct"])), "return is finite")
	check(is_finite(float(summary["benchmarkPct"])), "benchmark return is finite")
	ge(float(summary["maxDrawdown"]), 0.0, "drawdown is non-negative")
	ge(float(summary["trades"]), 2.0, "summary counts trades")

	describe("history-persistence")
	var saved := service.to_dict()
	var restored := SmaHistoryService.new()
	restored.from_dict(JSON.parse_string(JSON.stringify(saved)))
	check(restored.run("2008-crisis") != null, "history run survives JSON")
	eq(int(restored.run("2008-crisis")["dayIndex"]),
		int(service.run("2008-crisis")["dayIndex"]), "history day survives JSON")
	eq(int(restored.run("2008-crisis")["account"]["positions"][symbol]["qty"]), 6,
		"history position survives JSON")
