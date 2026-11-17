extends "res://tests/test_base.gd"


func run() -> void:
	describe("live-feed-normalize")
	var flat := SmaLiveFeed.normalize({
		"AURA": 12.34,
		"NOVA": {"last": 8.5, "changePct": -1.2},
	}, 1700000000)
	check(bool(flat["ok"]), "flat quote map is accepted")
	eq(flat["quotes"].size(), 2, "each valid entry becomes a quote")
	eq(String(flat["quotes"][0]["ticker"]), "AURA", "ticker is kept")
	approx(float(flat["quotes"][0]["last"]), 12.34, 0.001, "number maps to last")
	check(flat["quotes"][0]["changePct"] == null, "numeric entries have no change")
	approx(float(flat["quotes"][1]["changePct"]), -1.2, 0.001, "object change is kept")
	eq(int(flat["updatedAt"]), 1700000000, "fallback timestamp is used")

	var wrapped := SmaLiveFeed.normalize({
		"updatedAt": "2026-11-03T09:31:00Z",
		"quotes": {"aapl$": 10.0, "MSFT": {"price": 20.0, "change": 2.0}},
	}, 0)
	check(bool(wrapped["ok"]), "quotes wrapper is accepted")
	eq(String(wrapped["quotes"][0]["ticker"]), "AAPL", "ticker is sanitised")
	approx(float(wrapped["quotes"][1]["last"]), 20.0, 0.001, "price alias is accepted")
	approx(float(wrapped["quotes"][1]["changePct"]), 2.0, 0.001, "change alias is accepted")
	check(int(wrapped["updatedAt"]) > 0, "ISO timestamp is parsed")

	var listed := SmaLiveFeed.normalize({"quotes": [
		{"ticker": "AURA", "last": 12.0},
		{"ticker": "", "last": 1.0},
		{"ticker": "BAD", "last": -1.0},
	]})
	eq(listed["quotes"].size(), 1, "invalid rows are dropped")
	check(bool(SmaLiveFeed.normalize({"data": {"AURA": 15.0}})["ok"]),
		"data wrapper is accepted")
	check(bool(SmaLiveFeed.normalize([{"ticker": "AURA", "close": 11.0}])["ok"]),
		"array payload is accepted")

	describe("live-feed-errors")
	eq(String(SmaLiveFeed.normalize(null)["error"]), "liveFeed.errorEmpty",
		"null payload is rejected")
	eq(String(SmaLiveFeed.normalize({})["error"]), "liveFeed.errorQuotes",
		"empty payload is rejected")
	eq(String(SmaLiveFeed.normalize({"AURA": 0.0})["error"]), "liveFeed.errorQuotes",
		"non-positive prices are rejected")
	var many := {}
	for index in 120:
		many["T%d" % index] = 10.0
	eq(SmaLiveFeed.normalize(many)["quotes"].size(), SmaLiveFeed.MAX_QUOTES,
		"quote count is capped")
