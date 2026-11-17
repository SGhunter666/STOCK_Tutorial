extends "res://tests/test_base.gd"


func run() -> void:
	describe("macro-determinism")
	var macro := SmaMacro.world(10, "multiasset-seed")
	var same := SmaMacro.world(10, "multiasset-seed")
	eq(macro["regime"], same["regime"], "macro regime is deterministic")
	approx(float(macro["yield2"]), float(same["yield2"]), 0.0001,
		"short yield is deterministic")
	check(float(macro["yield10"]) > float(macro["yield2"]), "ten-year yield exceeds two-year")
	check(String(SmaMacro.regime_key("expansion")).begins_with("macro.regime."),
		"regime key is namespaced")
	check(float(macro["riskAppetite"]) >= 0.0 and float(macro["riskAppetite"]) <= 100.0,
		"risk appetite is bounded")

	describe("bonds")
	var bond := SmaBonds.bond_def("gov2")
	check(not bond.is_empty(), "bond definition is available")
	var price := SmaBonds.bond_price(bond, macro)
	check(price > 0.0, "bond price is positive")
	var low_yield := macro.duplicate(true)
	low_yield["yield2"] = float(macro["yield2"]) - 1.0
	check(SmaBonds.bond_price(bond, low_yield) > price,
		"lower yields raise bond prices")
	var bond_account := {"cash": 100000.0, "bonds": [], "fees": 0.0}
	var bought := SmaBonds.buy(bond_account, bond, macro, 2, 1.0, 0)
	check(bool(bought.get("ok", false)), "bond purchase succeeds")
	eq(bond_account["bonds"].size(), 1, "bond position is created")
	eq(int(bond_account["bonds"][0]["qty"]), 2, "bond quantity is recorded")
	approx(float(bond_account["cash"]), 100000.0 - price * 2.0 - 1.0, 0.05,
		"bond purchase deducts price and fee")
	var bond_rows := SmaBonds.quote_rows(macro)
	eq(bond_rows.size(), SmaBonds.DEFS.size(), "all bonds are quoted")
	var sold := SmaBonds.sell(bond_account, "gov2", macro, 1, 0.5)
	check(bool(sold.get("ok", false)), "bond sale succeeds")
	eq(int(bond_account["bonds"][0]["qty"]), 1, "partial bond sale leaves a position")
	var coupon_account := {"cash": 0.0, "bonds": [{
		"id": "gov2", "qty": 1, "costBasis": 1000.0, "entryPrice": 1000.0,
		"currentPrice": 1000.0, "purchaseDay": 0, "lastCouponDay": 0,
		"couponRate": 4.0,
	}]}
	var coupon := SmaBonds.apply_coupons(coupon_account, 63)
	approx(coupon, 10.0, 0.01, "quarterly coupon is paid after 63 sessions")
	eq(int(coupon_account["bonds"][0]["lastCouponDay"]), 63, "coupon day is recorded")

	describe("fx")
	var rates := SmaFx.rates(5, "multiasset-seed", macro)
	var same_rates := SmaFx.rates(5, "multiasset-seed", macro)
	approx(float(rates["EURUSD"]), float(same_rates["EURUSD"]), 0.00001,
		"FX rates are deterministic")
	var fx_account := {"cash": 100000.0, "fx": [], "fees": 0.0}
	var fx_bought := SmaFx.buy(fx_account, "EURUSD", rates, 1000, 1.0, 5)
	check(bool(fx_bought.get("ok", false)), "FX purchase succeeds")
	eq(int(fx_account["fx"][0]["units"]), 1000, "FX units are recorded")
	approx(SmaFx.fx_value(fx_account, rates), 1000.0 * float(rates["EURUSD"]), 0.02,
		"FX value uses the current rate")
	var fx_sold := SmaFx.sell(fx_account, "EURUSD", rates, 400, 0.5)
	check(bool(fx_sold.get("ok", false)), "FX sale succeeds")
	eq(int(fx_account["fx"][0]["units"]), 600, "partial FX sale leaves units")

	describe("commodities")
	var previous_macro := SmaMacro.world(4, "multiasset-seed")
	var commodity_rows := SmaCommodities.quotes(5, "multiasset-seed", macro, previous_macro)
	eq(commodity_rows.size(), SmaCommodities.DEFS.size(), "all commodities are quoted")
	var commodity_account := {"cash": 100000.0, "commodities": [], "fees": 0.0}
	var gold_price := float(commodity_rows[0]["price"])
	var commodity_bought := SmaCommodities.buy(commodity_account, "gold", gold_price,
		2, 1.0, 5)
	check(bool(commodity_bought.get("ok", false)), "commodity purchase succeeds")
	eq(int(commodity_account["commodities"][0]["qty"]), 2, "commodity quantity is recorded")
	var commodity_sold := SmaCommodities.sell(commodity_account, "gold", gold_price, 1, 0.5)
	check(bool(commodity_sold.get("ok", false)), "commodity sale succeeds")
	eq(int(commodity_account["commodities"][0]["qty"]), 1, "partial sale leaves quantity")

	describe("crypto")
	var crypto_rows := SmaCrypto.quotes(5, "multiasset-seed", macro, previous_macro)
	eq(crypto_rows.size(), SmaCrypto.DEFS.size(), "all crypto assets are quoted")
	var crypto_account := {"cash": 100000.0, "crypto": [], "fees": 0.0}
	var btc_price := float(crypto_rows[0]["price"])
	var crypto_bought := SmaCrypto.buy(crypto_account, "BTC", btc_price, 0.01, 1.0, 5)
	check(bool(crypto_bought.get("ok", false)), "crypto purchase succeeds")
	approx(float(crypto_account["crypto"][0]["units"]), 0.01, 0.000001,
		"fractional crypto units are recorded")
	var crypto_sold := SmaCrypto.sell(crypto_account, "BTC", btc_price, 0.004, 0.5)
	check(bool(crypto_sold.get("ok", false)), "crypto sale succeeds")
	approx(float(crypto_account["crypto"][0]["units"]), 0.006, 0.000001,
		"partial crypto sale leaves units")

	describe("multiasset-exchange")
	var exchange := SmaExchange.new("multiasset-test", 100000.0)
	var exchange_bonds := exchange.bond_quotes()
	eq(exchange_bonds.size(), SmaBonds.DEFS.size(), "exchange exposes bond quotes")
	check(bool(exchange.buy_bond("gov2", 1).get("ok", false)), "exchange buys a bond")
	check(bool(exchange.buy_fx("EURUSD", 1000).get("ok", false)), "exchange buys FX")
	check(bool(exchange.buy_commodity("gold", 1).get("ok", false)),
		"exchange buys a commodity")
	check(bool(exchange.buy_crypto("BTC", 0.01).get("ok", false)),
		"exchange buys crypto")
	eq(exchange.bond_rows().size(), 1, "bond position is exposed")
	eq(exchange.fx_rows().size(), 1, "FX position is exposed")
	eq(exchange.commodity_rows().size(), 1, "commodity position is exposed")
	eq(exchange.crypto_rows().size(), 1, "crypto position is exposed")
	approx(exchange.equity(), 100000.0, 0.5,
		"multi-asset purchases preserve equity apart from fees")
	eq(exchange.macro_world().has("yield10"), true, "exchange exposes the macro picture")
