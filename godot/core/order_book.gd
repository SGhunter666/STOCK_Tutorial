## Price-level order book with a market-maker ladder and persistent resting
## orders. Matching is price priority; each level fills only the size that
## actually exists, so large orders partially fill.
class_name SmaOrderBook
extends RefCounted

const DEFAULT_LEVELS := 6

var ticker: String
var levels: int
var mm_bids: Array = []
var mm_asks: Array = []
var resting: Array = []


func _init(symbol: String = "", level_count: int = DEFAULT_LEVELS) -> void:
	ticker = symbol
	levels = level_count


static func _round(value: float, digits: int = 2) -> float:
	var factor := pow(10.0, digits)
	return roundf(value * factor) / factor


static func _tick_for(price: float) -> float:
	return 0.05 if price >= 100.0 else 0.01


func set_market_maker(bid: float, ask: float, size: float, level_count: int = -1) -> void:
	var count := levels if level_count < 0 else level_count
	var tick := _tick_for(bid if bid > 0.0 else ask)
	for level in count:
		var bid_price := _round(maxf(tick, bid - level * tick), 2)
		var ask_price := _round(ask + level * tick, 2)
		var level_size := maxi(1, int(round(size * (1.0 + level * 0.35))))
		if level < mm_bids.size():
			mm_bids[level]["price"] = bid_price
			mm_bids[level]["size"] = level_size
		else:
			mm_bids.append({"price": bid_price, "size": level_size})
		if level < mm_asks.size():
			mm_asks[level]["price"] = ask_price
			mm_asks[level]["size"] = level_size
		else:
			mm_asks.append({"price": ask_price, "size": level_size})
	if mm_bids.size() > count:
		mm_bids.resize(count)
	if mm_asks.size() > count:
		mm_asks.resize(count)


func add_resting(order: Dictionary) -> void:
	resting.append(order.duplicate(true))


func remove_order(order_id: String) -> void:
	for index in range(resting.size() - 1, -1, -1):
		if String(resting[index].get("id", "")) == order_id:
			resting.remove_at(index)


func best_bid() -> Variant:
	var best: Variant = null
	for level in mm_bids:
		if int(level["size"]) > 0 and (best == null or float(level["price"]) > best):
			best = float(level["price"])
	for order in resting:
		if String(order.get("side", "")) == "buy" and int(order.get("remaining", 0)) > 0:
			if best == null or float(order["price"]) > best:
				best = float(order["price"])
	return best


func best_ask() -> Variant:
	var best: Variant = null
	for level in mm_asks:
		if int(level["size"]) > 0 and (best == null or float(level["price"]) < best):
			best = float(level["price"])
	for order in resting:
		if String(order.get("side", "")) == "sell" and int(order.get("remaining", 0)) > 0:
			if best == null or float(order["price"]) < best:
				best = float(order["price"])
	return best


func _ask_liquidity(exclude_id: String) -> Array:
	var order_levels: Array = []
	for index in mm_asks.size():
		var level: Dictionary = mm_asks[index]
		order_levels.append({"price": float(level["price"]), "size": int(level["size"]),
			"type": "mm", "index": index})
	for order in resting:
		if String(order.get("id", "")) == exclude_id:
			continue
		if String(order.get("side", "")) != "sell" or int(order.get("remaining", 0)) <= 0:
			continue
		order_levels.append({"price": float(order["price"]),
			"size": int(order["remaining"]), "type": "order", "order": order})
	order_levels.sort_custom(func(a, b): return float(a["price"]) < float(b["price"]))
	return order_levels


func _bid_liquidity(exclude_id: String) -> Array:
	var order_levels: Array = []
	for index in mm_bids.size():
		var level: Dictionary = mm_bids[index]
		order_levels.append({"price": float(level["price"]), "size": int(level["size"]),
			"type": "mm", "index": index})
	for order in resting:
		if String(order.get("id", "")) == exclude_id:
			continue
		if String(order.get("side", "")) != "buy" or int(order.get("remaining", 0)) <= 0:
			continue
		order_levels.append({"price": float(order["price"]),
			"size": int(order["remaining"]), "type": "order", "order": order})
	order_levels.sort_custom(func(a, b): return float(a["price"]) > float(b["price"]))
	return order_levels


## Matches an order against the book. Returns real fills plus the unfilled
## remainder; the caller decides whether the remainder rests.
func match_order(order: Dictionary) -> Dictionary:
	var buys := String(order.get("side", "")) == "buy"
	var liquidity: Array
	if buys:
		liquidity = _ask_liquidity(String(order.get("id", "")))
	else:
		liquidity = _bid_liquidity(String(order.get("id", "")))
	var is_market := String(order.get("type", "market")) == "market"
	var limit := -INF if not buys else INF
	if not is_market:
		var limit_value: Variant = order.get("limitPrice", 0.0)
		limit = float(limit_value) if limit_value != null else 0.0
	var available := int(order.get("remaining", order.get("qty", 0)))
	var remaining := maxi(0, available)
	var fills: Array = []
	for level in liquidity:
		if remaining <= 0:
			break
		var price := float(level["price"])
		if buys and price > limit + 1e-9:
			break
		if not buys and price < limit - 1e-9:
			break
		var qty := mini(remaining, int(level["size"]))
		if qty <= 0:
			continue
		fills.append({
			"price": price,
			"qty": qty,
			"counterparty": level["type"],
			"orderId": String(level["order"]["id"]) if level["type"] == "order" else "",
		})
		remaining -= qty
		if level["type"] == "mm":
			var book_level: Dictionary = mm_asks[level["index"]] if buys else mm_bids[level["index"]]
			book_level["size"] = int(book_level["size"]) - qty
		else:
			var counterpart: Dictionary = level["order"]
			counterpart["remaining"] = int(counterpart["remaining"]) - qty
			if int(counterpart["remaining"]) <= 0:
				remove_order(String(counterpart["id"]))
	return {"fills": fills, "remaining": remaining}


## Re-matches resting orders that now cross the changed market-maker ladder.
func match_resting() -> Array:
	if resting.is_empty():
		return []
	var results: Array = []
	for order in resting.duplicate(true):
		if int(order.get("remaining", 0)) <= 0:
			continue
		var result := match_order(order)
		if result["fills"].is_empty():
			continue
		var outcome := {"order": order}
		outcome.merge(result, true)
		results.append(outcome)
		if int(result["remaining"]) > 0:
			for live in resting:
				if String(live["id"]) == String(order["id"]):
					live["remaining"] = int(result["remaining"])
					break
		else:
			remove_order(String(order["id"]))
	return results


func snapshot(level_count: int = -1) -> Dictionary:
	var count := levels if level_count < 0 else level_count
	return {
		"ticker": ticker,
		"bids": _merge_side(mm_bids, resting, "buy", true, count),
		"asks": _merge_side(mm_asks, resting, "sell", false, count),
	}


func _merge_side(base: Array, orders: Array, side: String, descending: bool, count: int) -> Array:
	var merged := {}
	for level in base:
		var price := _round(float(level["price"]), 2)
		merged[price] = float(merged.get(price, 0)) + float(level["size"])
	for order in orders:
		if String(order.get("side", "")) != side or int(order.get("remaining", 0)) <= 0:
			continue
		var price := _round(float(order["price"]), 2)
		merged[price] = float(merged.get(price, 0)) + float(order["remaining"])
	var rows: Array = []
	for price in merged.keys():
		var size := float(merged[price])
		if size > 0.0:
			rows.append({"price": price, "size": size})
	rows.sort_custom(func(a, b): return _price_before(a, b, descending))
	if rows.size() > count:
		rows.resize(count)
	return rows


static func _price_before(a: Dictionary, b: Dictionary, descending: bool) -> bool:
	if descending:
		return float(a["price"]) > float(b["price"])
	return float(a["price"]) < float(b["price"])


func to_dict() -> Dictionary:
	return {
		"mmBids": mm_bids.duplicate(true),
		"mmAsks": mm_asks.duplicate(true),
	}


func restore(book_data: Dictionary) -> void:
	mm_bids = book_data.get("mmBids", []).duplicate(true)
	mm_asks = book_data.get("mmAsks", []).duplicate(true)
	resting = []
