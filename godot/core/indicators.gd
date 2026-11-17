## Deterministic technical indicators based on closes up to the current session.
## No function looks ahead, so the trading desk and lessons cannot leak future
## data.
class_name SmaIndicators
extends RefCounted


static func sma(values: Array, period: int) -> float:
	if period <= 0 or values.size() < period:
		return NAN
	var total := 0.0
	for index in range(values.size() - period, values.size()):
		total += float(values[index])
	return total / float(period)


static func rsi(values: Array, period: int = 14) -> float:
	if values.size() <= period:
		return NAN
	var gains := 0.0
	var losses := 0.0
	for index in range(values.size() - period, values.size()):
		var change := float(values[index]) - float(values[index - 1])
		if change >= 0.0:
			gains += change
		else:
			losses += absf(change)
	if gains + losses == 0.0:
		return 50.0
	if losses == 0.0:
		return 100.0
	return 100.0 - 100.0 / (1.0 + gains / losses)


static func annualized_volatility(values: Array, periods_per_year: int = 252) -> float:
	if values.size() < 3:
		return NAN
	var returns: Array = []
	for index in range(1, values.size()):
		var previous := float(values[index - 1])
		if previous != 0.0:
			returns.append((float(values[index]) - previous) / previous)
	if returns.size() < 2:
		return NAN
	var mean := 0.0
	for value in returns:
		mean += float(value)
	mean /= float(returns.size())
	var variance := 0.0
	for value in returns:
		variance += pow(float(value) - mean, 2.0)
	variance /= float(returns.size())
	return sqrt(variance) * sqrt(float(periods_per_year)) * 100.0


static func max_drawdown(values: Array) -> float:
	if values.size() < 2:
		return NAN
	var peak := float(values[0])
	var worst := 0.0
	for value in values:
		peak = maxf(peak, float(value))
		if peak > 0.0:
			worst = minf(worst, (float(value) - peak) / peak)
	return worst * 100.0


static func snapshot(candles: Array, current_price: float = 0.0) -> Dictionary:
	var closes: Array = []
	for candle in candles:
		closes.append(float(candle.get("c", 0.0)))
	if current_price > 0.0:
		closes.append(current_price)
	if closes.size() < 2:
		return {}
	var sma20 := sma(closes, 20)
	var sma50 := sma(closes, 50)
	var trend := "unknown"
	if not is_nan(sma20) and not is_nan(sma50):
		trend = "up" if sma20 > sma50 else ("down" if sma20 < sma50 else "flat")
	return {
		"sma20": sma20,
		"sma50": sma50,
		"rsi14": rsi(closes, 14),
		"volatility": annualized_volatility(closes.slice(maxi(0, closes.size() - 61))),
		"drawdown": max_drawdown(closes.slice(maxi(0, closes.size() - 90))),
		"trend": trend,
		"last": closes[-1],
	}
