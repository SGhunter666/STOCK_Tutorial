## Quantitative research engine: deterministic long-only backtests, parameter
## optimisation with an out-of-sample split, cross-sectional factor research,
## pooled factor regression and a small logistic / MLP stock-selection model.
## Signals use completed bars and execute at the next open, so no lookahead is
## possible inside a backtest.
class_name SmaQuant
extends RefCounted

const MIN_BARS := 30
const CASH_OPTIONS := [10000.0, 100000.0, 1000000.0]
const FACTOR_OPTIONS := ["momentum", "lowVol", "trend", "value", "news", "newsTrend",
	"volume", "flow", "analyst"]
const MODES := ["backtest", "optimize", "regression", "ml"]
const OBJECTIVES := ["sharpe", "totalReturn", "cagr", "calmar"]
const ML_FACTORS := ["momentum", "lowVol", "trend", "news", "newsTrend", "analyst",
	"volume", "flow"]
const ML_MODELS := ["logistic", "mlp", "deep"]
const ML_NEWS_WINDOW := 20
const ML_MIN_SAMPLES := 120

const STRATEGIES := {
	"buyHold": {"id": "buyHold", "nameKey": "quant.strategy.buyHold.name",
		"descKey": "quant.strategy.buyHold.desc", "params": []},
	"smaCross": {"id": "smaCross", "nameKey": "quant.strategy.smaCross.name",
		"descKey": "quant.strategy.smaCross.desc", "params": [
			{"id": "fast", "labelKey": "quant.param.fast", "default": 20.0,
				"min": 2.0, "max": 120.0, "step": 1.0},
			{"id": "slow", "labelKey": "quant.param.slow", "default": 50.0,
				"min": 5.0, "max": 250.0, "step": 1.0},
		]},
	"rsiReversion": {"id": "rsiReversion", "nameKey": "quant.strategy.rsiReversion.name",
		"descKey": "quant.strategy.rsiReversion.desc", "params": [
			{"id": "rsiPeriod", "labelKey": "quant.param.rsiPeriod", "default": 14.0,
				"min": 5.0, "max": 40.0, "step": 1.0},
			{"id": "rsiEntry", "labelKey": "quant.param.rsiEntry", "default": 30.0,
				"min": 10.0, "max": 45.0, "step": 1.0},
			{"id": "rsiExit", "labelKey": "quant.param.rsiExit", "default": 70.0,
				"min": 55.0, "max": 90.0, "step": 1.0},
		]},
	"momentum": {"id": "momentum", "nameKey": "quant.strategy.momentum.name",
		"descKey": "quant.strategy.momentum.desc", "params": [
			{"id": "lookback", "labelKey": "quant.param.lookback", "default": 60.0,
				"min": 10.0, "max": 250.0, "step": 1.0},
			{"id": "threshold", "labelKey": "quant.param.threshold", "default": 2.0,
				"min": 0.0, "max": 20.0, "step": 0.5},
		]},
	"breakout": {"id": "breakout", "nameKey": "quant.strategy.breakout.name",
		"descKey": "quant.strategy.breakout.desc", "params": [
			{"id": "lookback", "labelKey": "quant.param.breakoutLookback",
				"default": 20.0, "min": 5.0, "max": 120.0, "step": 1.0},
		]},
}


static func default_config() -> Dictionary:
	return {
		"ticker": "", "strategy": "smaCross", "mode": "backtest",
		"params": {"fast": 20.0, "slow": 50.0, "rsiPeriod": 14.0, "rsiEntry": 30.0,
			"rsiExit": 70.0, "lookback": 60.0, "threshold": 2.0},
		"initialCash": 100000.0, "commission": 1.0,
		"factor": "momentum", "factorLookback": 60,
		"objective": "sharpe", "splitPct": 70,
		"mlLookback": 30, "mlHorizon": 10, "mlTopN": 5, "mlTestPct": 30,
		"mlModel": "mlp", "mlAutoTune": false,
	}


static func strategy(strategy_id: String) -> Dictionary:
	return STRATEGIES.get(strategy_id, STRATEGIES["smaCross"])


static func normalize_params(strategy_id: String, params: Dictionary) -> Dictionary:
	var definition := strategy(strategy_id)
	var result := {}
	for parameter in definition["params"]:
		var key := String(parameter["id"])
		var value := float(params.get(key, parameter["default"]))
		if not is_finite(value):
			value = float(parameter["default"])
		result[key] = clampf(value, float(parameter["min"]), float(parameter["max"]))
	if strategy_id == "smaCross" and float(result["fast"]) >= float(result["slow"]):
		result["fast"] = maxf(2.0, minf(float(result["slow"]) - 1.0, float(result["fast"])))
	if strategy_id == "rsiReversion" and float(result["rsiEntry"]) >= float(result["rsiExit"]) - 5.0:
		result["rsiExit"] = minf(90.0, float(result["rsiEntry"]) + 5.0)
	return result


static func normalize_config(config: Dictionary) -> Dictionary:
	var base := default_config()
	var strategy_id := String(config.get("strategy", base["strategy"]))
	if not STRATEGIES.has(strategy_id):
		strategy_id = base["strategy"]
	var mode := String(config.get("mode", base["mode"]))
	if not MODES.has(mode):
		mode = base["mode"]
	var factor := String(config.get("factor", base["factor"]))
	if not FACTOR_OPTIONS.has(factor):
		factor = base["factor"]
	var objective := String(config.get("objective", base["objective"]))
	if not OBJECTIVES.has(objective):
		objective = base["objective"]
	var ml_model := String(config.get("mlModel", base["mlModel"]))
	if not ML_MODELS.has(ml_model):
		ml_model = base["mlModel"]
	var initial_cash := float(config.get("initialCash", base["initialCash"]))
	if not CASH_OPTIONS.has(initial_cash):
		initial_cash = base["initialCash"]
	return {
		"ticker": String(config.get("ticker", "")).substr(0, 8),
		"strategy": strategy_id, "mode": mode,
		"params": normalize_params(strategy_id, config.get("params", {})),
		"initialCash": initial_cash,
		"commission": clampf(float(config.get("commission", 1.0)), 0.0, 10.0),
		"factor": factor,
		"factorLookback": clampi(int(config.get("factorLookback", 60)), 20, 250),
		"objective": objective,
		"splitPct": clampi(int(config.get("splitPct", 70)), 50, 90),
		"mlLookback": clampi(int(config.get("mlLookback", 30)), 20, 50),
		"mlHorizon": clampi(int(config.get("mlHorizon", 10)), 5, 30),
		"mlTopN": clampi(int(config.get("mlTopN", 5)), 3, 10),
		"mlTestPct": clampi(int(config.get("mlTestPct", 30)), 20, 50),
		"mlModel": ml_model, "mlAutoTune": bool(config.get("mlAutoTune", false)),
	}


static func _sma(values: Array, period: int) -> float:
	if period <= 0 or values.size() < period:
		return NAN
	var total := 0.0
	for index in range(values.size() - period, values.size()):
		total += float(values[index])
	return total / float(period)


static func _rsi(values: Array, index: int, period: int) -> float:
	if index < period or index >= values.size():
		return NAN
	var gains := 0.0
	var losses := 0.0
	for cursor in range(index - period + 1, index + 1):
		var change := float(values[cursor]) - float(values[cursor - 1])
		if change >= 0.0:
			gains += change
		else:
			losses += absf(change)
	if gains + losses == 0.0:
		return 50.0
	if losses == 0.0:
		return 100.0
	var rs := gains / losses
	return 100.0 - 100.0 / (1.0 + rs)


static func _closes(candles: Array) -> Array:
	var result: Array = []
	for candle in candles:
		result.append(float(candle.get("c", 0.0)))
	return result


## Signal on the bar at `index`, computed only from bars up to `index`.
static func signal_at(strategy_id: String, params: Dictionary, candles: Array,
		index: int) -> String:
	if index < 1 or index >= candles.size():
		return ""
	var closes := _closes(candles)
	if strategy_id == "buyHold":
		return "buy"
	if strategy_id == "smaCross":
		var fast := int(roundf(float(params["fast"])))
		var slow := int(roundf(float(params["slow"])))
		var current_fast := _sma(closes.slice(0, index + 1), fast)
		var current_slow := _sma(closes.slice(0, index + 1), slow)
		var previous_fast := _sma(closes.slice(0, index), fast)
		var previous_slow := _sma(closes.slice(0, index), slow)
		if is_nan(current_fast) or is_nan(current_slow) or is_nan(previous_fast) \
				or is_nan(previous_slow):
			return ""
		if current_fast > current_slow and previous_fast <= previous_slow:
			return "buy"
		if current_fast < current_slow and previous_fast >= previous_slow:
			return "sell"
		return ""
	if strategy_id == "rsiReversion":
		var value := _rsi(closes, index, int(roundf(float(params["rsiPeriod"]))))
		if is_nan(value):
			return ""
		if value < float(params["rsiEntry"]):
			return "buy"
		if value > float(params["rsiExit"]):
			return "sell"
		return ""
	if strategy_id == "momentum":
		var lookback := int(roundf(float(params["lookback"])))
		if index < lookback:
			return ""
		var base := float(closes[index - lookback])
		if base <= 0.0:
			return ""
		var move := (float(closes[index]) / base - 1.0) * 100.0
		if move > float(params["threshold"]):
			return "buy"
		if move < -float(params["threshold"]):
			return "sell"
		return ""
	if strategy_id == "breakout":
		var lookback := int(roundf(float(params["lookback"])))
		if index < lookback:
			return ""
		var high := -INF
		var low := INF
		for cursor in range(index - lookback, index):
			high = maxf(high, float(candles[cursor].get("h", 0.0)))
			low = minf(low, float(candles[cursor].get("l", 0.0)))
		if float(candles[index].get("c", 0.0)) > high:
			return "buy"
		if float(candles[index].get("c", 0.0)) < low:
			return "sell"
	return ""


## Sustained regime for portfolio construction rather than a one-bar crossover.
static func regime(strategy_id: String, params: Dictionary, candles: Array) -> String:
	if candles.size() < 2:
		return "hold"
	var normalized := normalize_params(strategy_id, params)
	if strategy_id == "buyHold":
		return "buy"
	var closes := _closes(candles)
	var last := closes.size() - 1
	if strategy_id == "smaCross":
		var fast := _sma(closes, int(roundf(float(normalized["fast"]))))
		var slow := _sma(closes, int(roundf(float(normalized["slow"]))))
		if is_nan(fast) or is_nan(slow):
			return "hold"
		return "buy" if fast > slow else ("sell" if fast < slow else "hold")
	if strategy_id == "rsiReversion":
		var value := _rsi(closes, last, int(roundf(float(normalized["rsiPeriod"]))))
		if is_nan(value):
			return "hold"
		if value < float(normalized["rsiEntry"]):
			return "buy"
		if value > float(normalized["rsiExit"]):
			return "sell"
		return "hold"
	if strategy_id == "momentum":
		var lookback := int(roundf(float(normalized["lookback"])))
		if last < lookback:
			return "hold"
		var base := float(closes[last - lookback])
		if base <= 0.0:
			return "hold"
		var move := (float(closes[last]) / base - 1.0) * 100.0
		if move > float(normalized["threshold"]):
			return "buy"
		if move < -float(normalized["threshold"]):
			return "sell"
		return "hold"
	if strategy_id == "breakout":
		var lookback := int(roundf(float(normalized["lookback"])))
		if last < lookback:
			return "hold"
		var high := -INF
		var low := INF
		for cursor in range(last - lookback, last):
			high = maxf(high, float(candles[cursor].get("h", 0.0)))
			low = minf(low, float(candles[cursor].get("l", 0.0)))
		if float(closes[last]) > high:
			return "buy"
		if float(closes[last]) < low:
			return "sell"
	return "hold"


static func _equity_metrics(curve: Array, initial_cash: float, trades: Array,
		bars: int) -> Dictionary:
	var values: Array = curve if not curve.is_empty() else [initial_cash]
	var final_equity := float(values[-1])
	var total_return := (final_equity / initial_cash - 1.0) * 100.0 if initial_cash > 0.0 else 0.0
	var years := maxf(1.0 / 252.0, float(bars) / 252.0)
	var cagr := -100.0
	if initial_cash > 0.0 and final_equity > 0.0:
		cagr = (pow(final_equity / initial_cash, 1.0 / years) - 1.0) * 100.0
	var peak := float(values[0])
	var worst := 0.0
	for value in values:
		peak = maxf(peak, float(value))
		if peak > 0.0:
			worst = minf(worst, (float(value) - peak) / peak)
	var returns: Array = []
	for index in range(1, values.size()):
		var previous := float(values[index - 1])
		if previous > 0.0:
			returns.append((float(values[index]) - previous) / previous)
	var mean := 0.0
	if not returns.is_empty():
		var total := 0.0
		for value in returns:
			total += float(value)
		mean = total / float(returns.size())
	var variance := 0.0
	if returns.size() > 1:
		for value in returns:
			variance += pow(float(value) - mean, 2.0)
		variance /= float(returns.size())
	var deviation := sqrt(variance)
	var sharpe := mean / deviation * sqrt(252.0) if deviation > 0.0 else 0.0
	var wins := 0
	var losses := 0
	for trade in trades:
		if float(trade.get("pnl", 0.0)) > 0.0:
			wins += 1
		elif float(trade.get("pnl", 0.0)) < 0.0:
			losses += 1
	return {
		"initialCash": initial_cash, "finalEquity": final_equity,
		"totalReturnPct": total_return, "cagrPct": cagr,
		"maxDrawdownPct": absf(worst * 100.0),
		"volatilityPct": deviation * sqrt(252.0) * 100.0,
		"sharpe": sharpe,
		"winRatePct": float(wins) / float(trades.size()) * 100.0 if not trades.is_empty() else 0.0,
		"trades": trades.size(), "exposurePct": 0.0, "bars": bars,
	}


static func run_backtest(candles: Array, strategy_id: String, params: Dictionary,
		initial_cash: float = 100000.0, commission: float = 1.0) -> Dictionary:
	if candles.size() < MIN_BARS:
		return {"ok": false, "error": "quant.error.history"}
	if not STRATEGIES.has(strategy_id):
		return {"ok": false, "error": "quant.error.strategy"}
	var normalized := normalize_params(strategy_id, params)
	var cash_start := initial_cash if CASH_OPTIONS.has(initial_cash) else 100000.0
	var fee := maxf(0.0, commission)
	var cash := cash_start
	var qty := 0
	var entry: Dictionary = {}
	var exposure_bars := 0
	var trades: Array = []
	var curve: Array = [cash_start]
	for index in range(1, candles.size()):
		var next_signal: String = signal_at(strategy_id, normalized,
			candles.slice(0, index), index - 1)
		var open_price := float(candles[index].get("o", 0.0))
		if next_signal == "buy" and qty == 0 and open_price > 0.0:
			var quantity := int(floor((cash - fee) / open_price))
			if quantity > 0:
				cash -= float(quantity) * open_price + fee
				qty = quantity
				entry = {"entryIndex": index, "entryPrice": open_price, "qty": quantity,
					"fee": fee}
		elif next_signal == "sell" and qty > 0 and not entry.is_empty() and open_price > 0.0:
			cash += float(qty) * open_price - fee
			var pnl := float(qty) * (open_price - float(entry["entryPrice"])) - fee * 2.0
			trades.append({
				"entryIndex": int(entry["entryIndex"]), "exitIndex": index,
				"entryPrice": float(entry["entryPrice"]), "exitPrice": open_price,
				"qty": qty, "pnl": SmaFormat.round_to(pnl, 2),
				"returnPct": (open_price / float(entry["entryPrice"]) - 1.0) * 100.0,
				"barsHeld": index - int(entry["entryIndex"]),
				"fee": float(entry["fee"]) + fee,
			})
			qty = 0
			entry = {}
		if qty > 0:
			exposure_bars += 1
		curve.append(cash + float(qty) * float(candles[index].get("c", 0.0)))
	var final_close := float(candles[-1].get("c", 0.0))
	if qty > 0 and not entry.is_empty():
		var pnl := float(qty) * (final_close - float(entry["entryPrice"])) - float(entry["fee"])
		trades.append({
			"entryIndex": int(entry["entryIndex"]), "exitIndex": candles.size() - 1,
			"entryPrice": float(entry["entryPrice"]), "exitPrice": null,
			"qty": qty, "pnl": SmaFormat.round_to(pnl, 2),
			"returnPct": (final_close / float(entry["entryPrice"]) - 1.0) * 100.0,
			"barsHeld": candles.size() - 1 - int(entry["entryIndex"]),
			"fee": float(entry["fee"]), "open": true,
		})
		cash += float(qty) * final_close
	var metrics := _equity_metrics(curve, cash_start, trades, candles.size() - 1)
	metrics["exposurePct"] = float(exposure_bars) / float(maxi(1, candles.size() - 1)) * 100.0
	metrics["finalEquity"] = cash
	var benchmark := 0.0
	if float(candles[0].get("c", 0.0)) > 0.0:
		benchmark = (final_close / float(candles[0]["c"]) - 1.0) * 100.0
	metrics["benchmarkReturnPct"] = benchmark
	metrics["excessReturnPct"] = float(metrics["totalReturnPct"]) - benchmark
	metrics["openPosition"] = qty > 0
	var points: Array = []
	for index in curve.size():
		points.append({"index": index,
			"day": String(candles[mini(index, candles.size() - 1)].get("d", "")),
			"equity": SmaFormat.round_to(float(curve[index]), 2)})
	return {"ok": true, "strategy": strategy_id, "params": normalized,
		"metrics": metrics, "trades": trades, "equityCurve": points,
		"lastPrice": final_close}


static func _score_for(metrics: Dictionary, objective: String) -> float:
	match objective:
		"totalReturn":
			return float(metrics["totalReturnPct"])
		"cagr":
			return float(metrics["cagrPct"])
		"calmar":
			var drawdown := float(metrics["maxDrawdownPct"])
			return float(metrics["cagrPct"]) / drawdown if drawdown > 0.0 else 0.0
		_:
			return float(metrics["sharpe"])


const _GRIDS := {
	"buyHold": [{}],
	"smaCross": {"fast": [5, 10, 20, 30, 40], "slow": [30, 50, 80, 120, 160]},
	"rsiReversion": {"rsiPeriod": [7, 14, 21], "rsiEntry": [20, 30, 40],
		"rsiExit": [60, 70, 80]},
	"momentum": {"lookback": [20, 60, 120], "threshold": [1, 3, 5]},
	"breakout": {"lookback": [10, 20, 40]},
}


static func _parameter_grid(strategy_id: String) -> Array:
	var grid: Dictionary = _GRIDS.get(strategy_id, {})
	if strategy_id == "buyHold":
		return [{}]
	var keys: Array = grid.keys()
	keys.sort()
	var combos: Array = [{}]
	for key in keys:
		var next: Array = []
		for combo in combos:
			for value in grid[key]:
				var extended: Dictionary = combo.duplicate(true)
				extended[String(key)] = value
				next.append(extended)
		combos = next
	return combos


static func optimize(candles: Array, strategy_id: String, base_params: Dictionary,
		initial_cash: float, commission: float, split_pct: int,
		objective: String) -> Dictionary:
	if candles.size() < MIN_BARS * 2:
		return {"ok": false, "error": "quant.error.history"}
	var split := clampi(split_pct, 50, 90)
	var split_index := clampi(int(float(candles.size()) * float(split) / 100.0),
		MIN_BARS, candles.size() - MIN_BARS)
	var in_sample := candles.slice(0, split_index)
	var out_sample := candles.slice(maxi(0, split_index - 60))
	var candidates: Array = []
	for params in _parameter_grid(strategy_id):
		var normalized := normalize_params(strategy_id, params)
		var result := run_backtest(in_sample, strategy_id, normalized, initial_cash, commission)
		if not bool(result.get("ok", false)):
			continue
		candidates.append({
			"params": normalized,
			"inSample": result["metrics"],
			"score": SmaFormat.round_to(_score_for(result["metrics"], objective), 4),
		})
	if candidates.is_empty():
		return {"ok": false, "error": "quant.error.history"}
	candidates.sort_custom(func(a, b): return float(a["score"]) > float(b["score"]))
	var best: Dictionary = candidates[0]
	var out_result := run_backtest(out_sample, strategy_id, best["params"],
		initial_cash, commission)
	var baseline := run_backtest(out_sample, strategy_id,
		normalize_params(strategy_id, {}), initial_cash, commission)
	var out_metrics: Dictionary = out_result.get("metrics", {}) if bool(out_result.get("ok", false)) else {}
	var baseline_metrics: Dictionary = baseline.get("metrics", {}) if bool(baseline.get("ok", false)) else {}
	var overfit := false
	if not out_metrics.is_empty() and not baseline_metrics.is_empty():
		overfit = float(out_metrics["sharpe"]) < float(baseline_metrics["sharpe"]) \
			and float(best["inSample"]["sharpe"]) > 0.5
	return {"ok": true, "strategy": strategy_id, "splitPct": split,
		"comboCount": candidates.size(), "best": best,
		"outSample": {"metrics": out_metrics} if not out_metrics.is_empty() else {},
		"baselineOut": {"metrics": baseline_metrics} if not baseline_metrics.is_empty() else {},
		"overfitRisk": overfit,
		"candidates": candidates.slice(0, 10)}


static func history_for(exchange: SmaExchange, ticker: String) -> Array:
	return _candles_for(exchange, ticker, 160)


static func _candles_for(exchange: SmaExchange, ticker: String, minimum: int = 120) -> Array:
	var candles: Array = exchange.get_candles(ticker, "1D")
	if candles.size() >= minimum:
		return candles
	var missing := minimum - candles.size()
	var company := SmaCompanyCatalog.get_company(ticker)
	var first_price := float(company.get("price", 100.0))
	if candles.is_empty():
		first_price = float(exchange.state["companies"].get(ticker, {}).get("last", first_price))
	else:
		first_price = float(candles[0].get("o", first_price))
	var rng := SmaRng.new("%s|%s|history" % [String(exchange.state["seed"]), ticker])
	var synthetic: Array = []
	var price := first_price * (0.9 + rng.next() * 0.2)
	var first_day := int(exchange.state["dayIndex"]) - missing - candles.size()
	for index in missing:
		var drift := rng.normal() * 0.012
		var open_price := price
		var close_price := maxf(0.5, price * (1.0 + drift))
		var high := maxf(open_price, close_price) * (1.0 + absf(rng.normal()) * 0.004)
		var low := minf(open_price, close_price) * (1.0 - absf(rng.normal()) * 0.004)
		synthetic.append({
			"d": SmaCalendar.iso_date(first_day + index),
			"o": SmaFormat.round_to(open_price, 2),
			"h": SmaFormat.round_to(high, 2),
			"l": SmaFormat.round_to(low, 2),
			"c": SmaFormat.round_to(close_price, 2),
			"v": int(100000 + rng.next() * 900000),
		})
		price = close_price
	var result := synthetic.duplicate(true)
	result.append_array(candles)
	return result


static func _annual_volatility(candles: Array, index: int, window: int = 20) -> float:
	if index < window:
		return 0.0
	var returns: Array = []
	for cursor in range(index - window + 1, index + 1):
		var previous := float(candles[cursor - 1].get("c", 0.0))
		var current := float(candles[cursor].get("c", 0.0))
		if previous > 0.0:
			returns.append(current / previous - 1.0)
	if returns.size() < 2:
		return 0.0
	var mean := 0.0
	for value in returns:
		mean += float(value)
	mean /= float(returns.size())
	var variance := 0.0
	for value in returns:
		variance += pow(float(value) - mean, 2.0)
	variance /= float(returns.size())
	return sqrt(variance) * sqrt(252.0)


static func _news_sum(exchange: SmaExchange, ticker: String, from_day: int,
		to_day: int, analyst_only: bool = false) -> float:
	var total := 0.0
	for item in exchange.state.get("news", []):
		if String(item.get("ticker", "")) != ticker:
			continue
		var day := int(item.get("day", -1))
		if day < from_day or day > to_day:
			continue
		if analyst_only and not ["upgrade", "downgrade"].has(String(item.get("template", ""))):
			continue
		total += float(item.get("pct", 0.0))
	return SmaFormat.round_to(total, 2)


static func _factor_metric(exchange: SmaExchange, ticker: String, lookback: int,
		factor: String) -> Dictionary:
	var candles := _candles_for(exchange, ticker, maxi(120, lookback + 20))
	if candles.size() < 30:
		return {}
	var index := candles.size() - 1
	var last := float(candles[index].get("c", 0.0))
	if last <= 0.0:
		return {}
	var day := int(exchange.state["dayIndex"])
	var metric := 0.0
	var score := 0.0
	match factor:
		"momentum":
			var base := float(candles[maxi(0, index - lookback)].get("c", last))
			metric = (last / base - 1.0) * 100.0
			score = metric
		"lowVol":
			metric = _annual_volatility(candles, index, mini(20, lookback)) * 100.0
			score = -metric
		"trend":
			var closes := _closes(candles)
			var average := _sma(closes, mini(lookback, closes.size()))
			metric = (last / average - 1.0) * 100.0 if not is_nan(average) and average > 0.0 else 0.0
			score = metric
		"value":
			var company := SmaCompanyCatalog.get_company(ticker)
			var book := float(company.get("bvps", 0.0))
			metric = last / book if book > 0.0 else 0.0
			score = -metric
		"news":
			metric = _news_sum(exchange, ticker, day - lookback, day)
			score = metric
		"newsTrend":
			var half := maxi(5, int(lookback / 2))
			metric = _news_sum(exchange, ticker, day - half + 1, day) \
				- _news_sum(exchange, ticker, day - 2 * half + 1, day - half)
			score = metric
		"analyst":
			metric = _news_sum(exchange, ticker, day - lookback, day, true)
			score = metric
		"volume":
			var recent := 0.0
			var prior := 0.0
			for cursor in range(maxi(0, index - 4), index + 1):
				recent += float(candles[cursor].get("v", 0.0))
			recent /= float(mini(5, index + 1))
			for cursor in range(maxi(0, index - 19), index + 1):
				prior += float(candles[cursor].get("v", 0.0))
			prior /= float(mini(20, index + 1))
			metric = (recent / prior - 1.0) * 100.0 if prior > 0.0 else 0.0
			score = metric
		"flow":
			var weighted := 0.0
			var volume_total := 0.0
			for cursor in range(maxi(1, index - 9), index + 1):
				var volume := float(candles[cursor].get("v", 0.0))
				var change := float(candles[cursor].get("c", 0.0)) \
					/ maxf(0.01, float(candles[cursor - 1].get("c", 0.0))) - 1.0
				weighted += volume * change
				volume_total += volume
			metric = weighted / volume_total * 100.0 if volume_total > 0.0 else 0.0
			score = metric
		_:
			return {}
	return {"ticker": ticker, "metric": SmaFormat.round_to(metric, 2),
		"score": score, "sector": String(SmaCompanyCatalog.get_company(ticker).get("sector", ""))}


static func factor_research(exchange: SmaExchange, factor: String, lookback: int) -> Dictionary:
	var safe_factor := factor if FACTOR_OPTIONS.has(factor) else "momentum"
	var window := clampi(lookback, 20, 250)
	var rows: Array = []
	for ticker in SmaCompanyCatalog.load_companies().keys():
		var row := _factor_metric(exchange, String(ticker), window, safe_factor)
		if not row.is_empty():
			rows.append(row)
	rows.sort_custom(func(a, b): return float(a["score"]) > float(b["score"]))
	for index in rows.size():
		rows[index]["rank"] = index + 1
	return {"factor": safe_factor, "lookback": window, "rows": rows,
		"count": rows.size()}


# ---------------------------------------------------------------------------
# Cross-sectional panel and regression
# ---------------------------------------------------------------------------

static func _standardize(rows: Array, feature_count: int) -> void:
	for feature in feature_count:
		var values: Array = []
		for row in rows:
			values.append(float(row["features"][feature]))
		var mean := 0.0
		for value in values:
			mean += float(value)
		mean /= float(maxi(1, values.size()))
		var variance := 0.0
		for value in values:
			variance += pow(float(value) - mean, 2.0)
		variance /= float(maxi(1, values.size()))
		var deviation := sqrt(variance)
		for row in rows:
			var value := float(row["features"][feature])
			row["features"][feature] = (value - mean) / deviation if deviation > 0.000000001 else 0.0


static func build_panel(exchange: SmaExchange, lookback: int, horizon: int) -> Dictionary:
	var window := clampi(lookback, 20, 50)
	var forward := clampi(horizon, 5, 30)
	var tickers: Array = SmaCompanyCatalog.load_companies().keys()
	var histories := {}
	var minimum_length := 100000
	for ticker in tickers:
		var candles := _candles_for(exchange, String(ticker), 180)
		histories[String(ticker)] = candles
		minimum_length = mini(minimum_length, candles.size())
	if minimum_length < window + forward + 10:
		return {"ok": false, "error": "quant.error.history"}
	var groups: Array = []
	var samples: Array = []
	var day := int(exchange.state["dayIndex"])
	for offset in range(window + 10, minimum_length - forward, forward):
		var rows: Array = []
		for ticker in tickers:
			var symbol := String(ticker)
			var candles: Array = histories[symbol]
			var index := candles.size() - minimum_length + offset
			var close_now := float(candles[index].get("c", 0.0))
			var close_future := float(candles[index + forward].get("c", 0.0))
			if close_now <= 0.0 or close_future <= 0.0:
				continue
			var volume_recent := 0.0
			var volume_prior := 0.0
			for cursor in range(maxi(0, index - 4), index + 1):
				volume_recent += float(candles[cursor].get("v", 0.0))
			volume_recent /= float(mini(5, index + 1))
			for cursor in range(maxi(0, index - 19), index + 1):
				volume_prior += float(candles[cursor].get("v", 0.0))
			volume_prior /= float(mini(20, index + 1))
			var flow := 0.0
			var flow_volume := 0.0
			for cursor in range(maxi(1, index - 9), index + 1):
				var volume := float(candles[cursor].get("v", 0.0))
				var change := float(candles[cursor].get("c", 0.0)) \
					/ maxf(0.01, float(candles[cursor - 1].get("c", 0.0))) - 1.0
				flow += volume * change
				flow_volume += volume
			var closes := _closes(candles.slice(0, index + 1))
			var average := _sma(closes, mini(60, closes.size()))
			var news_recent := _news_sum(exchange, symbol, day - 10, day)
			var news_prior := _news_sum(exchange, symbol, day - 20, day - 11)
			rows.append({
				"ticker": symbol,
				"features": [
					close_now / maxf(0.01, float(candles[maxi(0, index - 20)].get("c", 0.0))) - 1.0,
					-_annual_volatility(candles, index, 20),
					close_now / average - 1.0 if not is_nan(average) and average > 0.0 else 0.0,
					news_recent,
					news_recent - news_prior,
					_news_sum(exchange, symbol, day - ML_NEWS_WINDOW, day, true),
					volume_recent / volume_prior - 1.0 if volume_prior > 0.0 else 0.0,
					flow / flow_volume if flow_volume > 0.0 else 0.0,
				],
				"forwardReturn": close_future / close_now - 1.0,
			})
		if rows.size() < 5:
			continue
		_standardize(rows, ML_FACTORS.size())
		var group := {"day": String(candles_day(histories, tickers, minimum_length, offset)),
			"rows": rows}
		groups.append(group)
		for row in rows:
			samples.append({"features": row["features"].duplicate(true),
				"forwardReturn": float(row["forwardReturn"])})
	return {"ok": true, "lookback": window, "horizon": forward,
		"samples": samples, "groups": groups}


static func candles_day(histories: Dictionary, tickers: Array, minimum_length: int,
		offset: int) -> String:
	if tickers.is_empty():
		return ""
	var candles: Array = histories[String(tickers[0])]
	var index := candles.size() - minimum_length + offset
	if index < 0 or index >= candles.size():
		return ""
	return String(candles[index].get("d", ""))


static func _rank(values: Array) -> Array:
	var ordered: Array = []
	for index in values.size():
		ordered.append({"value": float(values[index]), "index": index})
	ordered.sort_custom(func(a, b): return float(a["value"]) < float(b["value"]))
	var ranks: Array = []
	ranks.resize(values.size())
	for position in ordered.size():
		ranks[int(ordered[position]["index"])] = position + 1
	return ranks


static func _rank_correlation(left: Array, right: Array) -> float:
	if left.size() < 3 or left.size() != right.size():
		return 0.0
	var left_ranks := _rank(left)
	var right_ranks := _rank(right)
	var left_mean := 0.0
	var right_mean := 0.0
	for value in left_ranks:
		left_mean += float(value)
	left_mean /= float(left_ranks.size())
	for value in right_ranks:
		right_mean += float(value)
	right_mean /= float(right_ranks.size())
	var covariance := 0.0
	var left_variance := 0.0
	var right_variance := 0.0
	for index in left_ranks.size():
		var left_diff := float(left_ranks[index]) - left_mean
		var right_diff := float(right_ranks[index]) - right_mean
		covariance += left_diff * right_diff
		left_variance += left_diff * left_diff
		right_variance += right_diff * right_diff
	if left_variance <= 0.0 or right_variance <= 0.0:
		return 0.0
	return covariance / sqrt(left_variance * right_variance)


static func _solve(matrix: Array, vector: Array) -> Array:
	var size := vector.size()
	var rows: Array = []
	for index in size:
		var row: Array = []
		row.append_array(matrix[index])
		row.append(vector[index])
		rows.append(row)
	for column in size:
		var pivot := column
		for row in range(column + 1, size):
			if absf(float(rows[row][column])) > absf(float(rows[pivot][column])):
				pivot = row
		if absf(float(rows[pivot][column])) < 0.000000000001:
			return []
		var swap: Array = rows[column]
		rows[column] = rows[pivot]
		rows[pivot] = swap
		var divisor := float(rows[column][column])
		for cursor in range(column, size + 1):
			rows[column][cursor] = float(rows[column][cursor]) / divisor
		for row in size:
			if row == column:
				continue
			var factor := float(rows[row][column])
			if factor == 0.0:
				continue
			for cursor in range(column, size + 1):
				rows[row][cursor] = float(rows[row][cursor]) \
					- factor * float(rows[column][cursor])
	var result: Array = []
	for row in rows:
		result.append(float(row[size]))
	return result


static func factor_regression(exchange: SmaExchange, lookback: int,
		horizon: int) -> Dictionary:
	var panel := build_panel(exchange, lookback, horizon)
	if not bool(panel.get("ok", false)):
		return panel
	var samples: Array = panel["samples"]
	if samples.size() < 30:
		return {"ok": false, "error": "quant.error.regression"}
	var feature_count := ML_FACTORS.size()
	var size := feature_count + 1
	var xtx: Array = []
	for left in size:
		var row: Array = []
		row.resize(size)
		row.fill(0.0)
		xtx.append(row)
	var xty: Array = []
	xty.resize(size)
	xty.fill(0.0)
	var sum_y := 0.0
	var sum_y2 := 0.0
	for sample in samples:
		var row: Array = [1.0]
		row.append_array(sample["features"])
		for left in size:
			xty[left] = float(xty[left]) + float(row[left]) * float(sample["forwardReturn"])
			for right in size:
				xtx[left][right] = float(xtx[left][right]) + float(row[left]) * float(row[right])
		sum_y += float(sample["forwardReturn"])
		sum_y2 += pow(float(sample["forwardReturn"]), 2.0)
	var ridge := maxf(0.000000001, float(samples.size()) * 0.000000001)
	for index in range(1, size):
		xtx[index][index] = float(xtx[index][index]) + ridge
	var coefficients := _solve(xtx, xty)
	if coefficients.is_empty():
		return {"ok": false, "error": "quant.error.regression"}
	var residual := 0.0
	for sample in samples:
		var row: Array = [1.0]
		row.append_array(sample["features"])
		var fitted := 0.0
		for index in size:
			fitted += float(row[index]) * float(coefficients[index])
		residual += pow(float(sample["forwardReturn"]) - fitted, 2.0)
	var mean_y := sum_y / float(maxi(1, samples.size()))
	var total := maxf(0.000000001, sum_y2 - float(samples.size()) * mean_y * mean_y)
	var r2 := 1.0 - residual / total
	var factors: Array = []
	for feature in feature_count:
		var ic_sum := 0.0
		var count := 0
		for group in panel["groups"]:
			var rows: Array = group["rows"]
			if rows.size() < 3:
				continue
			var feature_values: Array = []
			var returns: Array = []
			for row in rows:
				feature_values.append(float(row["features"][feature]))
				returns.append(float(row["forwardReturn"]))
			ic_sum += _rank_correlation(feature_values, returns)
			count += 1
		factors.append({
			"id": ML_FACTORS[feature],
			"coefficient": SmaFormat.round_to(float(coefficients[feature + 1]), 3),
			"ic": SmaFormat.round_to(ic_sum / float(maxi(1, count)), 3),
		})
	return {"ok": true, "lookback": int(panel["lookback"]), "horizon": int(panel["horizon"]),
		"samples": samples.size(), "dates": panel["groups"].size(),
		"intercept": SmaFormat.round_to(float(coefficients[0]), 3),
		"r2": SmaFormat.round_to(r2, 3), "factors": factors}


# ---------------------------------------------------------------------------
# Logistic / MLP stock selection
# ---------------------------------------------------------------------------

static func _train_logistic(samples: Array, labels: Array) -> Dictionary:
	var weights: Array = []
	weights.resize(ML_FACTORS.size())
	weights.fill(0.0)
	var bias := 0.0
	var learning_rate := 0.08
	var l2 := 0.02
	for iteration in 160:
		var gradients: Array = []
		gradients.resize(weights.size())
		gradients.fill(0.0)
		var bias_gradient := 0.0
		for index in samples.size():
			var features: Array = samples[index]["features"]
			var score := bias
			for feature in weights.size():
				score += float(weights[feature]) * float(features[feature])
			var prediction := 1.0 / (1.0 + exp(-clampf(score, -30.0, 30.0)))
			var delta := prediction - float(labels[index])
			for feature in weights.size():
				gradients[feature] = float(gradients[feature]) \
					+ delta * float(features[feature])
			bias_gradient += delta
		var scale := 1.0 / float(maxi(1, samples.size()))
		for feature in weights.size():
			weights[feature] = float(weights[feature]) \
				- learning_rate * (float(gradients[feature]) * scale + l2 * float(weights[feature]))
		bias -= learning_rate * bias_gradient * scale
	return {"weights": weights, "bias": bias}


static func _predict_logistic(model: Dictionary, features: Array) -> float:
	var score := float(model["bias"])
	var weights: Array = model["weights"]
	for index in weights.size():
		score += float(weights[index]) * float(features[index])
	return 1.0 / (1.0 + exp(-clampf(score, -30.0, 30.0)))


static func _train_mlp(samples: Array, labels: Array, hidden_layers: Array,
		epochs: int = 100) -> Dictionary:
	var sizes: Array = [ML_FACTORS.size()]
	sizes.append_array(hidden_layers)
	sizes.append(1)
	var weights: Array = []
	var biases: Array = []
	var rng := SmaRng.new("quant-mlp")
	for layer in range(1, sizes.size()):
		var matrix: Array = []
		for neuron in int(sizes[layer]):
			var row: Array = []
			for previous in int(sizes[layer - 1]):
				row.append(rng.normal() * 0.3)
			matrix.append(row)
		weights.append(matrix)
		var bias_row: Array = []
		bias_row.resize(int(sizes[layer]))
		bias_row.fill(0.0)
		biases.append(bias_row)
	var learning_rate := 0.06
	for epoch in epochs:
		for index in samples.size():
			var activations: Array = [samples[index]["features"]]
			for layer in weights.size():
				var previous: Array = activations[-1]
				var current: Array = []
				var matrix: Array = weights[layer]
				for neuron in matrix.size():
					var score := float(biases[layer][neuron])
					var row: Array = matrix[neuron]
					for cursor in row.size():
						score += float(row[cursor]) * float(previous[cursor])
					if layer == weights.size() - 1:
						current.append(1.0 / (1.0 + exp(-clampf(score, -30.0, 30.0))))
					else:
						current.append(tanh(clampf(score, -20.0, 20.0)))
				activations.append(current)
			var deltas: Array = []
			deltas.resize(weights.size())
			var output: Array = activations[-1]
			var label := 1.0 if float(labels[index]) > 0.5 else 0.0
			var output_delta: Array = [float(output[0]) - label]
			deltas[weights.size() - 1] = output_delta
			for layer in range(weights.size() - 2, -1, -1):
				var next_delta: Array = deltas[layer + 1]
				var matrix: Array = weights[layer + 1]
				var delta_row: Array = []
				for neuron in int(sizes[layer + 1]):
					var propagated := 0.0
					for next_neuron in next_delta.size():
						propagated += float(next_delta[next_neuron]) \
							* float(matrix[next_neuron][neuron])
					var activation := float(activations[layer + 1][neuron])
					delta_row.append(propagated * (1.0 - activation * activation))
				deltas[layer] = delta_row
			for layer in weights.size():
				var previous: Array = activations[layer]
				var delta_row: Array = deltas[layer]
				var matrix: Array = weights[layer]
				for neuron in matrix.size():
					var row: Array = matrix[neuron]
					for cursor in row.size():
						row[cursor] = float(row[cursor]) - learning_rate \
							* float(delta_row[neuron]) * float(previous[cursor])
					biases[layer][neuron] = float(biases[layer][neuron]) \
						- learning_rate * float(delta_row[neuron])
	return {"weights": weights, "biases": biases}


static func _predict_mlp(model: Dictionary, features: Array) -> float:
	var activations: Array = features
	var weights: Array = model["weights"]
	var biases: Array = model["biases"]
	for layer in weights.size():
		var matrix: Array = weights[layer]
		var current: Array = []
		for neuron in matrix.size():
			var score := float(biases[layer][neuron])
			var row: Array = matrix[neuron]
			for cursor in row.size():
				score += float(row[cursor]) * float(activations[cursor])
			if layer == weights.size() - 1:
				current.append(1.0 / (1.0 + exp(-clampf(score, -30.0, 30.0))))
			else:
				current.append(tanh(clampf(score, -20.0, 20.0)))
		activations = current
	return float(activations[0])


static func _accuracy(model: Dictionary, samples: Array, labels: Array,
		mlp: bool) -> float:
	if samples.is_empty():
		return 0.0
	var correct := 0
	for index in samples.size():
		var probability := _predict_mlp(model, samples[index]["features"]) if mlp \
			else _predict_logistic(model, samples[index]["features"])
		var predicted := 1.0 if probability >= 0.5 else 0.0
		var label := 1.0 if float(labels[index]) > 0.5 else 0.0
		if predicted == label:
			correct += 1
	return float(correct) / float(samples.size())


static func ml_stock_selection(exchange: SmaExchange, lookback: int, horizon: int,
		top_n: int, test_pct: int, model_type: String, auto_tune: bool) -> Dictionary:
	var panel := build_panel(exchange, lookback, horizon)
	if not bool(panel.get("ok", false)):
		return panel
	var groups: Array = panel["groups"]
	if groups.size() < 6:
		return {"ok": false, "error": "quant.error.mlSamples"}
	var split := clampi(int(roundf(float(groups.size()) * (1.0 - float(test_pct) / 100.0))),
		2, groups.size() - 2)
	var train_groups: Array = groups.slice(0, split)
	var test_groups: Array = groups.slice(split)
	var train_samples: Array = []
	var train_labels: Array = []
	for group in train_groups:
		for row in group["rows"]:
			train_samples.append({"features": row["features"], "ticker": row["ticker"]})
			train_labels.append(1.0 if float(row["forwardReturn"]) > 0.0 else 0.0)
	if train_samples.size() < ML_MIN_SAMPLES:
		return {"ok": false, "error": "quant.error.mlSamples"}
	var model: Dictionary = {}
	var tuning: Dictionary = {}
	var mlp := model_type != "logistic"
	var hidden1 := 8
	var hidden2 := 6 if model_type == "deep" else 0
	var epochs := 120 if model_type == "deep" else 80
	if mlp and auto_tune:
		var validation_count := maxi(10, int(float(train_samples.size()) * 0.25))
		var fit_samples: Array = train_samples.slice(0, train_samples.size() - validation_count)
		var fit_labels: Array = train_labels.slice(0, train_labels.size() - validation_count)
		var validation_samples: Array = train_samples.slice(train_samples.size() - validation_count)
		var validation_labels: Array = train_labels.slice(train_labels.size() - validation_count)
		var best_accuracy := -1.0
		var grid: Array = [[6, 0, 80], [10, 0, 100], [8, 6, 100], [12, 8, 120]]
		for entry in grid:
			var layers: Array = [int(entry[0])]
			if int(entry[1]) > 0:
				layers.append(int(entry[1]))
			var candidate := _train_mlp(fit_samples, fit_labels, layers, int(entry[2]))
			var accuracy := _accuracy(candidate, validation_samples, validation_labels, true)
			if accuracy > best_accuracy:
				best_accuracy = accuracy
				hidden1 = int(entry[0])
				hidden2 = int(entry[1])
				epochs = int(entry[2])
				tuning = {"best": {"hidden1": hidden1, "hidden2": hidden2,
					"epochs": epochs, "validationAccuracy": accuracy},
					"gridSize": grid.size()}
	if mlp:
		var layers: Array = [hidden1]
		if hidden2 > 0:
			layers.append(hidden2)
		model = _train_mlp(train_samples, train_labels, layers, epochs)
	else:
		model = _train_logistic(train_samples, train_labels)
	var train_accuracy := _accuracy(model, train_samples, train_labels, mlp)

	var test_samples: Array = []
	var test_labels: Array = []
	for group in test_groups:
		for row in group["rows"]:
			test_samples.append({"features": row["features"], "ticker": row["ticker"]})
			test_labels.append(1.0 if float(row["forwardReturn"]) > 0.0 else 0.0)
	var test_accuracy := _accuracy(model, test_samples, test_labels, mlp)

	var picks: Array = []
	var top_returns: Array = []
	var universe_returns: Array = []
	var curve: Array = []
	var cumulative_top := 1.0
	var cumulative_universe := 1.0
	for group in test_groups:
		var scored: Array = []
		var universe_total := 0.0
		for row in group["rows"]:
			var probability := _predict_mlp(model, row["features"]) if mlp \
				else _predict_logistic(model, row["features"])
			scored.append({"ticker": String(row["ticker"]),
				"probability": probability, "forward": float(row["forwardReturn"])})
			universe_total += float(row["forwardReturn"])
		scored.sort_custom(func(a, b): return float(a["probability"]) > float(b["probability"]))
		var selected := scored.slice(0, mini(top_n, scored.size()))
		var top_return := 0.0
		for entry in selected:
			top_return += float(entry["forward"])
		top_return /= float(maxi(1, selected.size()))
		var universe_return := universe_total / float(maxi(1, scored.size()))
		top_returns.append(top_return)
		universe_returns.append(universe_return)
		cumulative_top *= 1.0 + top_return
		cumulative_universe *= 1.0 + universe_return
		var tickers: Array = []
		for entry in selected:
			tickers.append(String(entry["ticker"]))
		picks.append({"date": String(group["day"]), "tickers": tickers,
			"topReturn": SmaFormat.round_to(top_return * 100.0, 2),
			"universeReturn": SmaFormat.round_to(universe_return * 100.0, 2),
			"excess": SmaFormat.round_to((top_return - universe_return) * 100.0, 2)})
		curve.append({"day": String(group["day"]),
			"top": SmaFormat.round_to(cumulative_top, 4),
			"universe": SmaFormat.round_to(cumulative_universe, 4)})
	var avg_top := 0.0
	var avg_universe := 0.0
	for index in top_returns.size():
		avg_top += float(top_returns[index])
		avg_universe += float(universe_returns[index])
	avg_top /= float(maxi(1, top_returns.size()))
	avg_universe /= float(maxi(1, universe_returns.size()))
	var hits := 0
	for index in top_returns.size():
		if float(top_returns[index]) > float(universe_returns[index]):
			hits += 1
	var overfit := test_accuracy < train_accuracy - 0.15
	return {
		"ok": true, "lookback": int(panel["lookback"]), "horizon": int(panel["horizon"]),
		"topN": top_n, "trainSamples": train_samples.size(),
		"testSamples": test_samples.size(), "splitDate": String(test_groups[0]["day"]),
		"model": {
			"type": model_type, "accuracy": train_accuracy,
			"testAccuracy": test_accuracy, "hidden1": hidden1, "hidden2": hidden2,
			"epochs": epochs,
			"coefficients": _model_weights(model, mlp),
			"featureImportance": _model_weights(model, mlp),
		},
		"tuning": tuning, "picks": picks,
		"portfolio": {
			"totalReturnPct": SmaFormat.round_to((cumulative_top - 1.0) * 100.0, 2),
			"benchmarkReturnPct": SmaFormat.round_to((cumulative_universe - 1.0) * 100.0, 2),
			"excessReturnPct": SmaFormat.round_to((cumulative_top - cumulative_universe) * 100.0, 2),
			"hitRatePct": float(hits) / float(maxi(1, top_returns.size())) * 100.0,
			"rebalances": top_returns.size(),
			"avgExcessPct": SmaFormat.round_to((avg_top - avg_universe) * 100.0, 2),
		},
		"curve": curve, "overfitRisk": overfit,
	}


static func _model_weights(model: Dictionary, mlp: bool) -> Dictionary:
	var result := {}
	if not mlp:
		var weights: Array = model["weights"]
		for index in ML_FACTORS.size():
			result[ML_FACTORS[index]] = SmaFormat.round_to(float(weights[index]), 3)
		return result
	var weights: Array = model["weights"]
	var first: Array = weights[0]
	for feature in ML_FACTORS.size():
		var total := 0.0
		for neuron in first.size():
			total += absf(float(first[neuron][feature]))
		result[ML_FACTORS[feature]] = SmaFormat.round_to(total / float(maxi(1, first.size())), 3)
	return result

