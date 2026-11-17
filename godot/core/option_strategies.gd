## Predefined multi-leg option strategies used by the strategy lab, the options
## desk and the payoff demo. Legs resolve against the deterministic chain so the
## UI, practice checks and payoff chart all use the same contracts.
class_name SmaOptionStrategies
extends RefCounted

const DEFS := [
	{
		"id": "coveredCall",
		"nameKey": "strategies.coveredCall.name",
		"descKey": "strategies.coveredCall.desc",
		"riskKey": "strategies.coveredCall.risk",
		"requires": "shares",
	},
	{
		"id": "cashSecuredPut",
		"nameKey": "strategies.cashSecuredPut.name",
		"descKey": "strategies.cashSecuredPut.desc",
		"riskKey": "strategies.cashSecuredPut.risk",
		"requires": "cash",
	},
	{
		"id": "bullCallSpread",
		"nameKey": "strategies.bullCallSpread.name",
		"descKey": "strategies.bullCallSpread.desc",
		"riskKey": "strategies.bullCallSpread.risk",
		"requires": "debit",
	},
	{
		"id": "bearPutSpread",
		"nameKey": "strategies.bearPutSpread.name",
		"descKey": "strategies.bearPutSpread.desc",
		"riskKey": "strategies.bearPutSpread.risk",
		"requires": "debit",
	},
	{
		"id": "longStraddle",
		"nameKey": "strategies.longStraddle.name",
		"descKey": "strategies.longStraddle.desc",
		"riskKey": "strategies.longStraddle.risk",
		"requires": "debit",
	},
	{
		"id": "longStrangle",
		"nameKey": "strategies.longStrangle.name",
		"descKey": "strategies.longStrangle.desc",
		"riskKey": "strategies.longStrangle.risk",
		"requires": "debit",
	},
]


static func definition(strategy_id: String) -> Dictionary:
	for entry in DEFS:
		if String(entry["id"]) == strategy_id:
			return entry
	return {}


static func _atm_index(chain: Dictionary) -> int:
	var strikes: Array = chain.get("strikes", [])
	if strikes.is_empty():
		return -1
	var spot := float(chain.get("spot", 0.0))
	var best := 0
	for index in range(1, strikes.size()):
		if absf(float(strikes[index]) - spot) < absf(float(strikes[best]) - spot):
			best = index
	return best


static func _leg(chain: Dictionary, expiry_day: int, option_type: String,
		strike_index: int, qty: int) -> Dictionary:
	var strikes: Array = chain.get("strikes", [])
	if strike_index < 0 or strike_index >= strikes.size():
		return {}
	var strike := float(strikes[strike_index])
	var contract := SmaOptions.find_contract(chain, option_type, strike, expiry_day)
	if contract.is_empty():
		return {}
	return {"contract": contract, "side": "buy", "qty": qty}


## Resolve a preset into concrete legs. Returns an empty dictionary when the
## chain is too short for the required strikes.
static func build(strategy_id: String, chain: Dictionary, expiry_days: int,
		qty: int = 1) -> Dictionary:
	var def := definition(strategy_id)
	if def.is_empty() or chain.is_empty():
		return {}
	var strikes: Array = chain.get("strikes", [])
	var expiries: Array = chain.get("expiries", [])
	if strikes.size() < 5 or expiries.is_empty():
		return {}
	var expiry: Dictionary = {}
	for entry in expiries:
		if int(entry.get("days", 0)) == expiry_days:
			expiry = entry
			break
	if expiry.is_empty():
		expiry = expiries[0]
	var expiry_day := int(expiry.get("expiryDay", 0))
	var quantity := maxi(1, int(qty))
	var index := _atm_index(chain)
	var legs: Array = []
	var stock_legs := 0
	match strategy_id:
		"coveredCall":
			var call := _leg(chain, expiry_day, "call", index + 1, quantity)
			if call.is_empty():
				return {}
			call["side"] = "sell"
			legs.append(call)
			stock_legs = SmaOptions.CONTRACT_SIZE * quantity
		"cashSecuredPut":
			var put := _leg(chain, expiry_day, "put", index - 1, quantity)
			if put.is_empty():
				return {}
			put["side"] = "sell"
			legs.append(put)
		"bullCallSpread":
			var lower := _leg(chain, expiry_day, "call", index, quantity)
			var upper := _leg(chain, expiry_day, "call", index + 2, quantity)
			if lower.is_empty() or upper.is_empty():
				return {}
			upper["side"] = "sell"
			legs.append(lower)
			legs.append(upper)
		"bearPutSpread":
			var put_upper := _leg(chain, expiry_day, "put", index, quantity)
			var put_lower := _leg(chain, expiry_day, "put", index - 2, quantity)
			if put_upper.is_empty() or put_lower.is_empty():
				return {}
			put_lower["side"] = "sell"
			legs.append(put_upper)
			legs.append(put_lower)
		"longStraddle":
			var atm_call := _leg(chain, expiry_day, "call", index, quantity)
			var atm_put := _leg(chain, expiry_day, "put", index, quantity)
			if atm_call.is_empty() or atm_put.is_empty():
				return {}
			legs.append(atm_call)
			legs.append(atm_put)
		"longStrangle":
			var otm_call := _leg(chain, expiry_day, "call", index + 2, quantity)
			var otm_put := _leg(chain, expiry_day, "put", index - 2, quantity)
			if otm_call.is_empty() or otm_put.is_empty():
				return {}
			legs.append(otm_call)
			legs.append(otm_put)
		_:
			return {}
	var strategy := {
		"id": strategy_id,
		"def": def,
		"legs": legs,
		"stockLegs": stock_legs,
		"expiryDay": expiry_day,
		"expiryDays": expiry_days,
		"qty": quantity,
	}
	strategy.merge(_economics(strategy, chain))
	return strategy


static func _economics(strategy: Dictionary, chain: Dictionary) -> Dictionary:
	var debit := 0.0
	var credit := 0.0
	for leg in strategy.get("legs", []):
		var contract: Dictionary = leg["contract"]
		var premium := float(contract.get("premium", 0.0)) \
			* SmaOptions.CONTRACT_SIZE * int(leg.get("qty", 1))
		if String(leg.get("side", "buy")) == "buy":
			debit += premium
		else:
			credit += premium
	var quantity := int(strategy.get("qty", 1))
	var net_cost := SmaFormat.round_to(debit - credit, 2)
	var max_loss := maxf(0.0, net_cost)
	var max_profit: Variant = null
	var strategy_id := String(strategy.get("id", ""))
	if strategy_id == "cashSecuredPut":
		var put: Dictionary = strategy["legs"][0]["contract"]
		var put_premium := float(put.get("premium", 0.0))
		max_loss = SmaFormat.round_to(maxf(0.0, float(put["strike"]) - put_premium)
			* SmaOptions.CONTRACT_SIZE * quantity, 2)
		max_profit = SmaFormat.round_to(put_premium * SmaOptions.CONTRACT_SIZE * quantity, 2)
	elif strategy_id == "coveredCall":
		var call: Dictionary = strategy["legs"][0]["contract"]
		var call_premium := float(call.get("premium", 0.0))
		var spot := float(chain.get("spot", 0.0))
		max_profit = SmaFormat.round_to((float(call["strike"]) - spot + call_premium)
			* SmaOptions.CONTRACT_SIZE * quantity, 2)
		max_loss = SmaFormat.round_to((spot - call_premium)
			* SmaOptions.CONTRACT_SIZE * quantity, 2)
	elif strategy_id == "bullCallSpread" or strategy_id == "bearPutSpread":
		var first: Dictionary = strategy["legs"][0]["contract"]
		var second: Dictionary = strategy["legs"][1]["contract"]
		var width := absf(float(first["strike"]) - float(second["strike"]))
		max_profit = SmaFormat.round_to(width * SmaOptions.CONTRACT_SIZE * quantity
			- net_cost, 2)
	elif strategy_id == "longStraddle" or strategy_id == "longStrangle":
		max_profit = null
	return {
		"debit": SmaFormat.round_to(debit, 2),
		"credit": SmaFormat.round_to(credit, 2),
		"netCost": net_cost,
		"maxLoss": max_loss,
		"maxProfit": max_profit,
	}


## P&L of the whole strategy at an expiry price.
static func payoff(strategy: Dictionary, spot: float) -> float:
	var pnl := 0.0
	for leg in strategy.get("legs", []):
		var contract: Dictionary = leg["contract"]
		var strike := float(contract.get("strike", 0.0))
		var premium := float(contract.get("premium", 0.0))
		var intrinsic := maxf(0.0, spot - strike) \
			if String(contract.get("type", "call")) == "call" \
			else maxf(0.0, strike - spot)
		var sign := 1.0 if String(leg.get("side", "buy")) == "buy" else -1.0
		pnl += sign * (intrinsic - premium) * SmaOptions.CONTRACT_SIZE \
			* int(leg.get("qty", 1))
	var stock_legs := int(strategy.get("stockLegs", 0))
	if stock_legs != 0 and not strategy.get("legs", []).is_empty():
		var entry: Dictionary = strategy["legs"][0]["contract"]
		pnl += (spot - float(entry.get("spot", spot))) * float(stock_legs)
	return SmaFormat.round_to(pnl, 2)
