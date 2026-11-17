extends "res://tests/test_base.gd"


func run() -> void:
	describe("order-book-basics")
	var book := SmaOrderBook.new("TEST")
	book.set_market_maker(99.99, 100.01, 100.0)
	approx(float(book.best_bid()), 99.99, 0.0001, "best bid")
	approx(float(book.best_ask()), 100.01, 0.0001, "best ask")
	var snapshot := book.snapshot(6)
	eq(snapshot["bids"].size(), 6, "six bid levels")
	eq(snapshot["asks"].size(), 6, "six ask levels")
	approx(float(snapshot["asks"][0]["price"]), 100.01, 0.0001, "ask ladder starts at best ask")

	describe("order-book-partial")
	var market_buy := {"id": "B1", "side": "buy", "type": "market", "qty": 150, "remaining": 150}
	var result := book.match_order(market_buy)
	eq(result["fills"].size(), 2, "market order sweeps two levels")
	eq(result["fills"][0]["qty"], 100, "first level fills its full size")
	eq(result["fills"][1]["qty"], 50, "second level fills the remainder")
	eq(result["remaining"], 0, "market buy fully filled")

	describe("order-book-limit")
	var book2 := SmaOrderBook.new("TEST")
	book2.set_market_maker(99.99, 100.01, 100.0)
	var limit_buy := {"id": "B2", "side": "buy", "type": "limit", "limitPrice": 99.5, "remaining": 40}
	var limit_result := book2.match_order(limit_buy)
	eq(limit_result["fills"].size(), 0, "limit below the ask does not fill")
	eq(limit_result["remaining"], 40, "limit remainder is preserved")
	book2.add_resting({"id": "S1", "side": "sell", "price": 99.9, "remaining": 30})
	approx(float(book2.best_ask()), 99.9, 0.0001, "resting order improves best ask")
	var cross := {"id": "B3", "side": "buy", "type": "market", "remaining": 50}
	var cross_result := book2.match_order(cross)
	approx(float(cross_result["fills"][0]["price"]), 99.9, 0.0001, "price priority")
	eq(cross_result["fills"][0]["qty"], 30, "resting size fills first")

	describe("order-book-resting-match")
	var book3 := SmaOrderBook.new("TEST")
	book3.set_market_maker(99.99, 100.01, 100.0)
	book3.add_resting({"id": "B4", "side": "buy", "price": 100.02, "remaining": 10})
	var resting_fills := book3.match_resting()
	eq(resting_fills.size(), 1, "crossing resting order is matched")
	eq(resting_fills[0]["fills"].size(), 1, "resting order produced a fill")
