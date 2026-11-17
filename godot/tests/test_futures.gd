extends "res://tests/test_base.gd"


func run() -> void:
	describe("futures-pricing")
	approx(SmaFutures.futures_price(100.0, 0), 100.0, 0.01, "zero days equals spot")
	approx(SmaFutures.futures_price(100.0, 30), 100.33, 0.01, "30-day carry is priced in")
	approx(SmaFutures.futures_price(100.0, 90), 100.99, 0.01, "90-day carry is priced in")
	check(SmaFutures.futures_price(100.0, 30) < SmaFutures.futures_price(100.0, 90),
		"longer expiry carries a higher futures price")

	describe("futures-chain")
	var chain := SmaFutures.build_chain("APLA", {"last": 100.0}, 5)
	eq(chain["expiries"].size(), 3, "three expiries are generated")
	eq(int(chain["expiries"][0]["expiryDay"]), 35, "expiry day is offset from the current day")
	ge(float(chain["expiries"][0]["basis"]), 0.0, "basis is positive when carry is positive")
	approx(float(chain["expiries"][0]["margin"]),
		float(chain["expiries"][0]["price"]) * 100.0 * 0.15, 0.02,
		"margin is 15% of notional")
	var contract := SmaFutures.find_contract(chain, 30)
	check(not contract.is_empty(), "contract lookup by expiry succeeds")

	describe("futures-account")
	var account := SmaFutures.create_account_state()
	account["cash"] = 100000.0
	account["fees"] = 0.0
	var opened := SmaFutures.open_future(account, contract, "long", 1, 2.0, 0, 0)
	check(bool(opened.get("ok", false)), "opening a future succeeds")
	eq(account["futures"].size(), 1, "one futures position is created")
	eq(int(account["futures"][0]["qty"]), 1, "position quantity is recorded")
	eq(String(account["futures"][0]["side"]), "long", "position side is long")
	approx(float(account["cash"]), 99998.0, 0.01, "only the fee is deducted at open")
	approx(SmaFutures.futures_margin(account), float(contract["margin"]), 0.01,
		"position reserves the contract margin")
	eq(String(account["futuresTrades"][0]["action"]), "open", "open trade is recorded")

	describe("futures-marking")
	var mark_account := SmaFutures.create_account_state()
	mark_account["cash"] = 100000.0
	mark_account["futures"] = [{
		"key": "APLA:30:long", "ticker": "APLA", "expiryDay": 30, "side": "long",
		"signed": 1, "qty": 2, "entryPrice": 100.0, "currentPrice": 100.0,
		"settlementPrice": 100.0, "marginPerContract": 1500.0, "openedDay": 0,
		"fees": 0.0,
	}]
	var current := SmaFutures.futures_price(110.0, 30)
	var expected := (current - 100.0) * 2.0 * 100.0
	approx(SmaFutures.unrealized_pnl(mark_account, {"APLA": 110.0}, 0), expected, 0.02,
		"unrealised P&L uses the futures mark")
	var variation := SmaFutures.apply_variation(mark_account, {"APLA": 110.0}, 0)
	approx(variation, expected, 0.02, "variation equals the mark-to-market change")
	approx(float(mark_account["cash"]), 100000.0 + expected, 0.02,
		"variation is credited to cash")
	approx(float(mark_account["futures"][0]["settlementPrice"]), current, 0.01,
		"settlement price resets after variation")
	approx(SmaFutures.unrealized_pnl(mark_account, {"APLA": 110.0}, 0), 0.0, 0.02,
		"unrealised P&L resets after variation")

	describe("futures-close")
	var close_account := SmaFutures.create_account_state()
	close_account["cash"] = 100000.0
	close_account["futures"] = [{
		"key": "APLA:30:long", "ticker": "APLA", "expiryDay": 30, "side": "long",
		"signed": 1, "qty": 2, "entryPrice": 100.0, "currentPrice": 100.0,
		"settlementPrice": 100.0, "marginPerContract": 1500.0, "openedDay": 0,
		"fees": 0.0,
	}]
	var close_price := SmaFutures.futures_price(105.0, 30)
	var closed := SmaFutures.close_future(close_account, "APLA:30:long", 2, close_price,
		3.0, 1, 0)
	check(bool(closed.get("ok", false)), "closing a future succeeds")
	eq(close_account["futures"].size(), 0, "closed position is removed")
	var expected_close := (close_price - 100.0) * 2.0 * 100.0 - 3.0
	approx(float(closed["realized"]), expected_close, 0.02,
		"realised P&L subtracts the fee")
	approx(float(close_account["cash"]), 100000.0 + expected_close, 0.02,
		"cash receives the full variation minus the fee")

	describe("futures-short")
	var short_account := SmaFutures.create_account_state()
	short_account["cash"] = 100000.0
	var short_chain := SmaFutures.build_chain("APLA", {"last": 100.0}, 0)
	var short_contract: Dictionary = short_chain["expiries"][0]
	SmaFutures.open_future(short_account, short_contract, "short", 1, 0.0, 0, 0)
	var short_pnl := SmaFutures.unrealized_pnl(short_account, {"APLA": 90.0}, 0)
	check(short_pnl > 0.0, "a short future profits when spot falls")

	describe("futures-settlement")
	var settle_account := SmaFutures.create_account_state()
	settle_account["cash"] = 100000.0
	settle_account["futures"] = [{
		"key": "APLA:5:long", "ticker": "APLA", "expiryDay": 5, "side": "long",
		"signed": 1, "qty": 1, "entryPrice": 100.0, "currentPrice": 100.0,
		"settlementPrice": 100.0, "marginPerContract": 1500.0, "openedDay": 0,
		"fees": 1.0,
	}]
	var settlements := SmaFutures.settle_expired(settle_account, {"APLA": 110.0}, 5)
	eq(settlements.size(), 1, "expiring contract is settled")
	approx(float(settlements[0]["variation"]), 1000.0, 0.02,
		"settlement pays the final variation")
	approx(float(settlements[0]["realized"]), 999.0, 0.02,
		"realised P&L includes the entry fee")
	approx(float(settle_account["cash"]), 101000.0, 0.02, "cash receives the variation")
	eq(settle_account["futures"].size(), 0, "settled contract is removed")
	eq(String(settle_account["futuresTrades"][0]["action"]), "expire",
		"settlement is recorded as expiry")

	describe("futures-exchange")
	var exchange := SmaExchange.new("futures-test", 100000.0)
	var exchange_chain := exchange.futures_chain("APLA")
	check(not exchange_chain.is_empty(), "exchange builds a futures chain")
	var exchange_contract := SmaFutures.find_contract(exchange_chain, 30)
	var order := exchange.open_future("APLA", 30, "short", 1)
	check(bool(order.get("ok", false)), "exchange accepts a short future")
	eq(exchange.futures_rows().size(), 1, "exchange exposes futures rows")
	ge(exchange.futures_margin(), 0.0, "exchange reports reserved margin")
	check(exchange.available_futures_cash() < exchange.available_cash(),
		"futures margin reduces buying power")
	var fee := exchange.futures_fee(exchange_contract, 1)
	approx(exchange.equity(), 100000.0 - fee, 0.1,
		"futures mark and fee reconcile in equity")
	var key := String(exchange.state["account"]["futures"][0]["key"])
	var close := exchange.close_future(key, 1)
	check(bool(close.get("ok", false)), "exchange closes the future")
	eq(exchange.state["account"]["futures"].size(), 0, "closed future is removed")

	describe("futures-margin-check")
	var poor := SmaExchange.new("futures-poor", 100.0)
	var rejected := poor.open_future("APLA", 30, "long", 1)
	eq(bool(rejected.get("ok", false)), false, "margin is required to open a future")
	eq(String(rejected.get("error", "")), "error.insufficientFuturesMargin",
		"margin rejection uses the futures margin error")
