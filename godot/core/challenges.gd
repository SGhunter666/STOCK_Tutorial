## Goal-based trading challenges. A challenge is a bounded run on the shared
## account: a return target, a drawdown limit, a trade count and optional
## structural checks (hedge, income, volatility, all-round). No separate ledger
## is introduced; every check reads the same exchange state as the trading desk.
class_name SmaChallenges
extends RefCounted

const DEFS := [
	{
		"id": "firstProfit", "titleKey": "challenges.firstProfit.title",
		"descKey": "challenges.firstProfit.desc", "xp": 120, "days": 15,
		"unlockUnit": "u3",
		"checks": [{"kind": "return", "target": 3.0}, {"kind": "trades", "target": 2}],
	},
	{
		"id": "riskManager", "titleKey": "challenges.riskManager.title",
		"descKey": "challenges.riskManager.desc", "xp": 180, "days": 30,
		"unlockUnit": "u15",
		"checks": [
			{"kind": "return", "target": 2.0}, {"kind": "drawdownMax", "target": 6.0},
			{"kind": "trades", "target": 8},
		],
	},
	{
		"id": "hedger", "titleKey": "challenges.hedger.title",
		"descKey": "challenges.hedger.desc", "xp": 220, "days": 20,
		"unlockUnit": "u30",
		"checks": [{"kind": "hedge"}],
	},
	{
		"id": "incomeDesk", "titleKey": "challenges.incomeDesk.title",
		"descKey": "challenges.incomeDesk.desc", "xp": 240, "days": 20,
		"unlockUnit": "u26",
		"checks": [{"kind": "income"}],
	},
	{
		"id": "volatilityDesk", "titleKey": "challenges.volatilityDesk.title",
		"descKey": "challenges.volatilityDesk.desc", "xp": 260, "days": 25,
		"unlockUnit": "u28",
		"checks": [{"kind": "volatility"}],
	},
	{
		"id": "allRound", "titleKey": "challenges.allRound.title",
		"descKey": "challenges.allRound.desc", "xp": 320, "days": 40,
		"unlockUnit": "u32",
		"checks": [{"kind": "return", "target": 5.0}, {"kind": "allRound"}],
	},
]


static func create_state() -> Dictionary:
	return {"active": {}, "completed": [], "failed": []}


static func normalize_state(saved: Variant) -> Dictionary:
	var state := create_state()
	if typeof(saved) != TYPE_DICTIONARY:
		return state
	var active: Variant = saved.get("active", {})
	if typeof(active) == TYPE_DICTIONARY and not active.is_empty():
		var definition := by_id(String(active.get("id", "")))
		if not definition.is_empty():
			state["active"] = {
				"id": String(definition["id"]),
				"startDay": int(active.get("startDay", 0)),
				"startEquity": float(active.get("startEquity", 0.0)),
				"startTrades": int(active.get("startTrades", 0)),
				"startOptions": int(active.get("startOptions", 0)),
				"startFutures": int(active.get("startFutures", 0)),
			}
	for key in ["completed", "failed"]:
		var source: Variant = saved.get(key, [])
		if typeof(source) == TYPE_ARRAY:
			var cleaned: Array = []
			for entry in source:
				if not by_id(String(entry)).is_empty() and not cleaned.has(String(entry)):
					cleaned.append(String(entry))
			state[key] = cleaned
	return state


static func by_id(challenge_id: String) -> Dictionary:
	for definition in DEFS:
		if String(definition["id"]) == challenge_id:
			return definition
	return {}


static func is_unlocked(academy: Dictionary, definition: Dictionary) -> bool:
	if definition.is_empty():
		return false
	return SmaAcademy.is_unit_complete(academy, String(definition["unlockUnit"]))


static func active_definition(state: Dictionary) -> Dictionary:
	var active: Dictionary = state.get("active", {})
	return by_id(String(active.get("id", "")))


static func start(state: Dictionary, academy: Dictionary, challenge_id: String,
		day: int, equity_value: float) -> Dictionary:
	var definition := by_id(challenge_id)
	if definition.is_empty():
		return {"ok": false, "error": "challenges.errorUnknown"}
	if not state.get("active", {}).is_empty():
		return {"ok": false, "error": "challenges.errorActive"}
	if not is_unlocked(academy, definition):
		return {"ok": false, "error": "challenges.errorLocked"}
	if equity_value <= 0.0:
		return {"ok": false, "error": "challenges.errorEquity"}
	state["active"] = {
		"id": challenge_id,
		"startDay": day,
		"startEquity": SmaFormat.round_to(equity_value, 2),
		"startTrades": 0,
		"startOptions": 0,
		"startFutures": 0,
	}
	return {"ok": true, "definition": definition}


static func abandon(state: Dictionary) -> Dictionary:
	if state.get("active", {}).is_empty():
		return {"ok": false, "error": "challenges.errorNone"}
	var challenge_id := String(state["active"].get("id", ""))
	state["active"] = {}
	return {"ok": true, "id": challenge_id}


## Counts only trades booked after the challenge started. The account keeps the
## day on every trade, so pruning older rows cannot inflate a run.
static func _count_since(trades: Array, start_day: int) -> int:
	var count := 0
	for trade in trades:
		if int(trade.get("day", -1)) >= start_day:
			count += 1
	return count


static func _count_option_trades(account: Dictionary, start_day: int) -> int:
	return _count_since(account.get("optionTrades", []), start_day)


static func _count_futures_trades(account: Dictionary, start_day: int) -> int:
	return _count_since(account.get("futuresTrades", []), start_day)


static func _has_hedge(account: Dictionary) -> bool:
	var long_stock := false
	for position in account.get("positions", {}).values():
		if int(position.get("qty", 0)) > 0:
			long_stock = true
			break
	if not long_stock:
		return false
	for position in account.get("futures", []):
		if String(position.get("side", "")) == "short":
			return true
	return false


static func _has_income(account: Dictionary) -> bool:
	for position in account.get("options", []):
		var qty := int(position.get("qty", 0))
		if qty >= 0:
			continue
		var option_type := String(position.get("type", ""))
		var ticker := String(position.get("ticker", ""))
		var strike := float(position.get("strike", 0.0))
		if option_type == "call":
			var shares := int(account.get("positions", {}).get(ticker, {}).get("qty", 0))
			if shares >= -qty * 100:
				return true
		elif option_type == "put":
			if float(account.get("cash", 0.0)) >= strike * 100.0 * float(-qty):
				return true
	return false


static func _has_volatility(account: Dictionary) -> bool:
	var by_expiry := {}
	for position in account.get("options", []):
		if int(position.get("qty", 0)) <= 0:
			continue
		var expiry := int(position.get("expiryDay", 0))
		if not by_expiry.has(expiry):
			by_expiry[expiry] = {}
		by_expiry[expiry][String(position.get("type", ""))] = true
	for types in by_expiry.values():
		if bool(types.get("call", false)) and bool(types.get("put", false)):
			return true
	return false


static func _drawdown_since(exchange: SmaExchange, start_day: int, current: float) -> float:
	var history: Array = exchange.state["account"].get("equityHistory", [])
	var peak := -INF
	var worst := 0.0
	for entry in history:
		if int(entry.get("day", -1)) < start_day:
			continue
		peak = maxf(peak, float(entry.get("equity", 0.0)))
		if peak > 0.0:
			worst = maxf(worst, (peak - float(entry.get("equity", 0.0))) / peak * 100.0)
	peak = maxf(peak, current)
	if peak > 0.0:
		worst = maxf(worst, (peak - current) / peak * 100.0)
	return SmaFormat.round_to(worst, 4)


static func metrics(state: Dictionary, exchange: SmaExchange) -> Dictionary:
	var active: Dictionary = state.get("active", {})
	if active.is_empty():
		return {}
	var start_day := int(active.get("startDay", 0))
	var current := exchange.equity()
	var start_equity := float(active.get("startEquity", current))
	var account: Dictionary = exchange.state["account"]
	var return_pct := (current - start_equity) / start_equity * 100.0 if start_equity > 0.0 else 0.0
	var stock_trades := _count_since(account.get("trades", []), start_day)
	var option_trades := _count_option_trades(account, start_day)
	var futures_trades := _count_futures_trades(account, start_day)
	return {
		"equity": current,
		"return": SmaFormat.round_to(return_pct, 4),
		"drawdownMax": _drawdown_since(exchange, start_day, current),
		"trades": stock_trades,
		"optionTrades": option_trades,
		"futuresTrades": futures_trades,
		"hedge": 1 if _has_hedge(account) else 0,
		"income": 1 if _has_income(account) else 0,
		"volatility": 1 if _has_volatility(account) else 0,
		"allRound": 1 if stock_trades > 0 and option_trades > 0 and futures_trades > 0 else 0,
	}


static func _check_value(values: Dictionary, check: Dictionary) -> bool:
	var kind := String(check["kind"])
	var value := float(values.get(kind, 0.0))
	if not check.has("target"):
		return value > 0.0
	var target := float(check["target"])
	if kind == "drawdownMax":
		return value <= target
	return value >= target


static func progress(state: Dictionary, exchange: SmaExchange) -> Dictionary:
	var definition := active_definition(state)
	if definition.is_empty():
		return {}
	var values := metrics(state, exchange)
	var active: Dictionary = state["active"]
	var checks: Array = []
	var done_count := 0
	for check in definition["checks"]:
		var done := _check_value(values, check)
		if done:
			done_count += 1
		checks.append({
			"kind": String(check["kind"]),
			"target": float(check.get("target", 0.0)),
			"current": float(values.get(String(check["kind"]), 0.0)),
			"done": done,
		})
	var elapsed := int(exchange.state["dayIndex"]) - int(active.get("startDay", 0))
	return {
		"definition": definition,
		"values": values,
		"checks": checks,
		"remaining": maxi(0, int(definition["days"]) - elapsed),
		"elapsed": maxi(0, elapsed),
		"done": done_count == checks.size(),
		"doneCount": done_count,
		"totalChecks": checks.size(),
	}


## Settles the active run when every check is satisfied or the deadline passes.
## Returns `{"status": "", ...}` when nothing changed this day.
static func check(state: Dictionary, academy: Dictionary, exchange: SmaExchange) -> Dictionary:
	var definition := active_definition(state)
	if definition.is_empty():
		return {"status": ""}
	var data := progress(state, exchange)
	if data.is_empty():
		return {"status": ""}
	var active: Dictionary = state["active"]
	if bool(data["done"]):
		var challenge_id := String(definition["id"])
		state["active"] = {}
		if not state["completed"].has(challenge_id):
			state["completed"].append(challenge_id)
		var gained := SmaAcademy.award_xp(academy, "challenge:%s" % challenge_id,
			int(definition["xp"]))
		return {"status": "completed", "id": challenge_id, "xp": gained,
			"definition": definition}
	var elapsed := int(exchange.state["dayIndex"]) - int(active.get("startDay", 0))
	if elapsed > int(definition["days"]):
		var challenge_id := String(definition["id"])
		state["active"] = {}
		if not state["failed"].has(challenge_id):
			state["failed"].append(challenge_id)
		return {"status": "failed", "id": challenge_id, "definition": definition}
	return {"status": "active", "id": String(definition["id"])}


static func completed_count(state: Dictionary) -> int:
	return state.get("completed", []).size()
