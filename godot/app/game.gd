## Application composition root. Owns the exchange, the story runner, the
## simulation clock and the save slot. UI code only calls these actions and
## listens to signals; it never mutates the account or market directly.
extends Node

signal state_changed(reason: String)
signal tick
signal day_closed(day: int)
signal trade_filled(trade: Dictionary)
signal order_rejected(error_key: String)
signal story_changed
signal toast_requested(message: String)
signal game_started
signal game_loaded
signal game_saved
signal fast_forward_started
signal fast_forward_progress(value: float)
signal fast_forward_finished
signal academy_changed
signal layout_changed
signal theme_changed

const SAVE_VERSION := 1
const DEFAULT_SEED := "academy-2026"
const START_CASH := 100000.0
const SPEEDS := [1, 5, 10, 30, 60]
const AUTOSAVE_SECONDS := 20.0
const MAX_STEPS_PER_FRAME := 240

var exchange: SmaExchange = null
var narrative: SmaStoryService = null
var academy: Dictionary = {}
var history: SmaHistoryService = null
var challenges: Dictionary = SmaChallenges.create_state()
var career: Dictionary = SmaCareer.create_state()
var quant: Dictionary = SmaQuant.default_config()
var fund: Dictionary = SmaFund.create_state()
var started := false
var paused := true
var speed := 1
var selected_ticker := "APLA"
var settings := {"locale": "zh_CN", "speed": 1, "layout": "beginner",
	"theme": "dark", "liveFeedUrl": "", "liveFeedInterval": 60}
var sandbox_mode := false
var sandbox_config := {"cash": 100000.0, "seed": "sandbox-2026",
	"difficulty": "normal", "commission": 1.0}
var last_error := ""
var save_path := SmaSaveService.SAVE_PATH

var _accum := 0.0
var _ui_accum := 0.0
var _autosave_accum := 0.0
var _last_day := 0
var _last_call_id := ""
var _story_pause := false
var _fast_forward_remaining := 0
var _fast_forward_total := 1
var _fast_forward_active := false


func _ready() -> void:
	I18n.set_locale(String(settings.get("locale", "zh_CN")))
	SmaUiTheme.set_theme_mode(String(settings.get("theme", "dark")))
	_apply_layout(String(settings.get("layout", "beginner")))
	academy = SmaAcademy.create_state()
	history = SmaHistoryService.new()


func _process(delta: float) -> void:
	if not started or exchange == null:
		return
	if _fast_forward_active:
		_process_fast_forward()
		return
	if paused or _story_pause:
		return
	_accum += delta * float(speed)
	var steps := int(_accum)
	if steps <= 0:
		return
	_accum -= float(steps)
	_accum = minf(_accum, float(MAX_STEPS_PER_FRAME))
	_advance_steps(mini(steps, MAX_STEPS_PER_FRAME))
	_ui_accum += delta
	if _ui_accum >= 0.08:
		_ui_accum = 0.0
		tick.emit()
	_autosave_accum += delta
	if _autosave_accum >= AUTOSAVE_SECONDS:
		_autosave_accum = 0.0
		save_game(false)


# ---------------------------------------------------------------------------
# Game lifecycle
# ---------------------------------------------------------------------------

func new_game(seed_value: String = DEFAULT_SEED) -> void:
	sandbox_mode = false
	exchange = SmaExchange.new(seed_value, START_CASH)
	academy = SmaAcademy.create_state()
	history = SmaHistoryService.new()
	challenges = SmaChallenges.create_state()
	career = SmaCareer.create_state()
	quant = SmaQuant.default_config()
	fund = SmaFund.create_state()
	narrative = SmaStoryService.new()
	narrative.setup(self)
	narrative.load_content()
	_connect_narrative()
	started = true
	paused = true
	speed = 1
	settings["speed"] = 1
	settings["locale"] = I18n.locale
	selected_ticker = "APLA"
	_last_day = 0
	_last_call_id = ""
	_story_pause = false
	_accum = 0.0
	_ui_accum = 0.0
	_autosave_accum = 0.0
	game_started.emit()
	state_changed.emit("new_game")
	narrative.handle_event("game_new", {})
	save_game(false)


func _connect_narrative() -> void:
	if narrative == null:
		return
	narrative.story_started.connect(_on_story_started)
	narrative.story_finished.connect(_on_story_finished)
	narrative.view_changed.connect(_on_story_view_changed)


func _on_story_started(_story_id: String) -> void:
	_story_pause = true
	story_changed.emit()
	state_changed.emit("story_started")


func _on_story_finished(_story_id: String) -> void:
	_story_pause = narrative != null and narrative.is_active()
	story_changed.emit()
	state_changed.emit("story_finished")


func _on_story_view_changed() -> void:
	story_changed.emit()


func restart() -> void:
	delete_save()
	new_game(DEFAULT_SEED)
	paused = true


# ---------------------------------------------------------------------------
# Simulation clock
# ---------------------------------------------------------------------------

func _advance_steps(steps: int) -> void:
	if exchange == null or steps <= 0:
		return
	var fills: Array = []
	var call_before := _current_call_id()
	for index in steps:
		exchange.advance_second()
		if not exchange.last_player_fills.is_empty():
			fills.append_array(exchange.last_player_fills)
	for fill in fills:
		trade_filled.emit(fill)
		if narrative != null:
			narrative.handle_event("trade_filled", fill)
	var day_after := int(exchange.state["dayIndex"])
	if day_after != _last_day:
		_last_day = day_after
		day_closed.emit(day_after)
		var early_assignments: Array = exchange.state.get("earlyAssignments", [])
		if not early_assignments.is_empty():
			toast_requested.emit(I18n.t("toast.optionAssignedEarly", {
				"count": early_assignments.size(),
				"ticker": String(early_assignments[0].get("ticker", ""))}))
			exchange.state["earlyAssignments"] = []
		var paid := 0.0
		var paid_count := 0
		var owed := 0.0
		var owed_count := 0
		for entry in exchange.state["account"].get("dividends", []):
			if int(entry.get("day", -1)) != day_after:
				continue
			var amount := float(entry.get("amount", 0.0))
			if amount >= 0.0:
				paid += amount
				paid_count += 1
			else:
				owed += -amount
				owed_count += 1
		if paid_count > 0:
			toast_requested.emit(I18n.t("toast.dividendPaid", {
				"amount": SmaFormat.money(paid), "count": paid_count}))
		if owed_count > 0:
			toast_requested.emit(I18n.t("toast.dividendOwed", {
				"amount": SmaFormat.money(owed), "count": owed_count}))
		if narrative != null:
			narrative.handle_event("day_closed", {"day": day_after})
		save_game(false)
		academy_sync_practice()
		_check_challenges()
		_advance_career()
		_advance_fund()
	var call_after := _current_call_id()
	if call_after != call_before and not call_after.is_empty():
		toast_requested.emit(I18n.t("toast.margin_call"))
		if narrative != null:
			narrative.handle_event("margin_call", {"id": call_after})
	if not fills.is_empty():
		state_changed.emit("trade")
		academy_sync_practice()


func set_speed(next_speed: int) -> void:
	if not SPEEDS.has(next_speed):
		return
	speed = next_speed
	settings["speed"] = next_speed


func set_layout(value: String) -> void:
	var layout := value if ["beginner", "advanced"].has(value) else "beginner"
	settings["layout"] = layout
	_apply_layout(layout)
	layout_changed.emit()
	save_game(false)


func _apply_layout(value: String) -> void:
	SmaUiTheme.set_density(0.88 if value == "advanced" else 1.0)


func set_theme(value: String) -> void:
	var next_theme := value if ["dark", "light"].has(value) else "dark"
	settings["theme"] = next_theme
	SmaUiTheme.set_theme_mode(next_theme)
	theme_changed.emit()
	save_game(false)


## External quotes are reference-only: only the URL and poll interval persist,
## never any fetched price.
func set_live_feed(url: String, interval: int) -> void:
	settings["liveFeedUrl"] = url.strip_edges().substr(0, 300)
	settings["liveFeedInterval"] = interval if [15, 30, 60].has(interval) else 60
	save_game(false)
	state_changed.emit("settings")


func toggle_pause() -> void:
	if not started or _story_pause or _fast_forward_active:
		return
	paused = not paused
	state_changed.emit("clock")


func set_paused(value: bool) -> void:
	if not started:
		return
	paused = value
	state_changed.emit("clock")


func step_minute() -> void:
	if not started or _story_pause or exchange == null or _fast_forward_active:
		return
	paused = true
	_advance_steps(60)
	tick.emit()
	state_changed.emit("clock")


func step_day() -> void:
	if not started or _story_pause or exchange == null or _fast_forward_active:
		return
	paused = true
	_fast_forward_total = maxi(1, SmaExchange.SESSION_SECONDS - int(exchange.state["second"]))
	_fast_forward_remaining = _fast_forward_total
	_fast_forward_active = true
	fast_forward_started.emit()
	fast_forward_progress.emit(0.0)


func _process_fast_forward() -> void:
	if exchange == null:
		_end_fast_forward()
		return
	# Chunking keeps the window responsive; the whole day is a few seconds.
	var chunk := mini(400, _fast_forward_remaining)
	if chunk > 0:
		_advance_steps(chunk)
		_fast_forward_remaining -= chunk
	var progress := 1.0 - float(_fast_forward_remaining) / float(maxi(1, _fast_forward_total))
	fast_forward_progress.emit(progress)
	tick.emit()
	if _fast_forward_remaining <= 0 or _story_pause:
		_end_fast_forward()


func _end_fast_forward() -> void:
	_fast_forward_active = false
	_fast_forward_remaining = 0
	fast_forward_progress.emit(1.0)
	fast_forward_finished.emit()
	state_changed.emit("clock")


func is_fast_forwarding() -> bool:
	return _fast_forward_active


func is_story_paused() -> bool:
	return _story_pause


func is_market_open() -> bool:
	if exchange == null:
		return false
	return int(exchange.state["second"]) < SmaExchange.SESSION_SECONDS


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------

func submit_order(params: Dictionary) -> Dictionary:
	if not started or exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var fill_start := exchange.last_player_fills.size()
	var result := exchange.submit_order(params)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "order.invalid"))
		order_rejected.emit(last_error)
		exchange.clear_player_fills()
		return result
	var fills: Array = exchange.last_player_fills.slice(fill_start)
	exchange.clear_player_fills()
	for fill in fills:
		trade_filled.emit(fill)
		if narrative != null:
			narrative.handle_event("trade_filled", fill)
	if not fills.is_empty():
		save_game(false)
		academy_sync_practice()
	state_changed.emit("order")
	return result


func option_chain(ticker: String) -> Dictionary:
	if exchange == null:
		return {}
	return exchange.option_chain(ticker)


func option_fee(contract: Dictionary, qty: int) -> float:
	if exchange == null:
		return 0.0
	return exchange.option_fee(contract, qty)


func option_rows() -> Array:
	if exchange == null:
		return []
	return exchange.option_rows()


func option_collateral() -> float:
	if exchange == null:
		return 0.0
	return exchange.option_collateral()


func available_option_cash() -> float:
	if exchange == null:
		return 0.0
	return exchange.available_option_cash()


func available_covered_shares(ticker: String) -> int:
	if exchange == null:
		return 0
	return exchange.available_covered_shares(ticker)


func buy_option(ticker: String, option_type: String, strike: float, expiry_day: int,
		qty: int) -> Dictionary:
	if not started or exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	if not academy_is_tool_unlocked("options.trade"):
		return {"ok": false, "error": "error.optionsLocked"}
	var result := exchange.buy_option(ticker, option_type, strike, expiry_day, qty)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "error.priceInvalid"))
		order_rejected.emit(last_error)
		return result
	save_game(false)
	academy_sync_practice()
	state_changed.emit("option")
	return result


func close_option(key: String, qty: int) -> Dictionary:
	if not started or exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := exchange.close_option(key, qty)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "error.noOptionPosition"))
		order_rejected.emit(last_error)
		return result
	save_game(false)
	academy_sync_practice()
	state_changed.emit("option")
	return result


func option_style() -> String:
	if exchange == null:
		return "european"
	return exchange.option_style()


func set_option_style(style: String) -> Dictionary:
	if not started or exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := exchange.set_option_style(style)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "exchange.error.option.style"))
		order_rejected.emit(last_error)
		return result
	save_game(false)
	state_changed.emit("option")
	return result


func exercise_option(key: String, qty: int) -> Dictionary:
	if not started or exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := exchange.exercise_option(key, qty)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "exchange.error.option.noPosition"))
		order_rejected.emit(last_error)
		return result
	save_game(false)
	academy_sync_practice()
	state_changed.emit("option")
	return result


func sell_option(ticker: String, option_type: String, strike: float, expiry_day: int,
		qty: int) -> Dictionary:
	if not started or exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	if not academy_is_tool_unlocked("options.trade"):
		return {"ok": false, "error": "error.optionsLocked"}
	if not academy_is_tool_unlocked("options.sell"):
		return {"ok": false, "error": "error.optionsSellLocked"}
	var result := exchange.sell_option(ticker, option_type, strike, expiry_day, qty)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "error.insufficientOptionCollateral"))
		order_rejected.emit(last_error)
		return result
	save_game(false)
	academy_sync_practice()
	state_changed.emit("option")
	return result


func open_option_strategy(strategy_id: String, ticker: String, expiry_days: int,
		qty: int) -> Dictionary:
	if not started or exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	if not academy_is_tool_unlocked("options.trade") \
			or not academy_is_tool_unlocked("options.sell"):
		return {"ok": false, "error": "error.optionsSellLocked"}
	var quantity := maxi(1, int(qty))
	var chain := exchange.option_chain(ticker)
	var strategy: Dictionary = SmaOptionStrategies.build(
		strategy_id, chain, expiry_days, quantity)
	if strategy.is_empty():
		return {"ok": false, "error": "error.contractNotFound"}
	var fees := 0.0
	for leg in strategy["legs"]:
		fees += exchange.option_fee(leg["contract"], int(leg["qty"]))
	var epsilon := 0.000000001
	match strategy_id:
		"coveredCall":
			if exchange.available_covered_shares(ticker) < SmaOptions.CONTRACT_SIZE * quantity:
				return {"ok": false, "error": "error.needCoveredShares"}
		"cashSecuredPut":
			var put: Dictionary = strategy["legs"][0]["contract"]
			var needed := float(put["strike"]) * SmaOptions.CONTRACT_SIZE * quantity
			if needed > exchange.available_option_cash() + epsilon:
				return {"ok": false, "error": "error.insufficientOptionCollateral"}
		_:
			var cash_needed := maxf(0.0, float(strategy["netCost"])) + fees
			if cash_needed > exchange.available_cash() + epsilon:
				return {"ok": false, "error": "error.insufficientCash"}
	var legs: Array = strategy["legs"].duplicate(true)
	legs.sort_custom(func(a, b):
		return String(a.get("side", "")) == "sell" and String(b.get("side", "")) == "buy")
	var result: Dictionary = exchange.execute_option_legs(legs)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "error.contractNotFound"))
		order_rejected.emit(last_error)
		return result
	result["strategy"] = strategy
	save_game(false)
	academy_sync_practice()
	state_changed.emit("option")
	return result


func futures_chain(ticker: String) -> Dictionary:
	if exchange == null:
		return {}
	return exchange.futures_chain(ticker)


func futures_fee(contract: Dictionary, qty: int) -> float:
	if exchange == null:
		return 0.0
	return exchange.futures_fee(contract, qty)


func futures_rows() -> Array:
	if exchange == null:
		return []
	return exchange.futures_rows()


func futures_margin() -> float:
	if exchange == null:
		return 0.0
	return exchange.futures_margin()


func available_futures_cash() -> float:
	if exchange == null:
		return 0.0
	return exchange.available_futures_cash()


func open_future(ticker: String, expiry_days: int, side: String, qty: int) -> Dictionary:
	if not started or exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	if not academy_is_tool_unlocked("trade.futures"):
		return {"ok": false, "error": "error.futuresLocked"}
	var result := exchange.open_future(ticker, expiry_days, side, qty)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "error.insufficientFuturesMargin"))
		order_rejected.emit(last_error)
		return result
	save_game(false)
	academy_sync_practice()
	state_changed.emit("futures")
	return result


func close_future(key: String, qty: int) -> Dictionary:
	if not started or exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := exchange.close_future(key, qty)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "error.noFuturesPosition"))
		order_rejected.emit(last_error)
		return result
	save_game(false)
	academy_sync_practice()
	state_changed.emit("futures")
	return result


func macro_snapshot() -> Dictionary:
	if exchange == null:
		return {}
	return exchange.macro_world()


func news_items() -> Array:
	if exchange == null:
		return []
	return exchange.news_items()


func corporate_actions(limit: int = 8) -> Array:
	return exchange.corporate_actions(limit) if exchange != null else []


func rights_offerings() -> Array:
	return exchange.rights_offerings() if exchange != null else []


func subscribe_rights(offering_id: String) -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := exchange.subscribe_rights(offering_id)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "corporate.errorUnknown"))
		order_rejected.emit(last_error)
		return result
	toast_requested.emit(I18n.t("toast.rightsSubscribed", {
		"qty": int(result.get("qty", 0))}))
	save_game(false)
	state_changed.emit("corporate")
	return result


func decline_rights(offering_id: String) -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := exchange.decline_rights(offering_id)
	if not bool(result.get("ok", false)):
		return result
	toast_requested.emit(I18n.t("toast.rightsDeclined"))
	save_game(false)
	state_changed.emit("corporate")
	return result


func review_summary() -> Dictionary:
	if exchange == null:
		return {}
	return SmaReview.summary(exchange.state["account"], exchange.equity(),
		int(exchange.state["dayIndex"]))


func review_timeline(limit: int = 12) -> Array:
	if exchange == null:
		return []
	return SmaReview.timeline(exchange.state["account"], limit)


func replay_max_day() -> int:
	return SmaReplay.max_day(exchange.state) if exchange != null else 0


func replay_snapshot(day: int) -> Dictionary:
	if exchange == null:
		return {}
	return SmaReplay.snapshot(exchange.state,
		clampi(day, 0, SmaReplay.max_day(exchange.state)))


func market_index() -> float:
	return exchange.market_index() if exchange != null else 0.0


func market_index_change() -> float:
	return exchange.market_index_change() if exchange != null else 0.0


func macro_calendar() -> Array:
	return exchange.macro_calendar() if exchange != null else []


func global_markets() -> Array:
	return exchange.global_markets() if exchange != null else []


func bond_quotes() -> Array:
	return exchange.bond_quotes() if exchange != null else []


func bond_rows() -> Array:
	return exchange.bond_rows() if exchange != null else []


func buy_bond(bond_id: String, qty: int) -> Dictionary:
	if not started or exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := exchange.buy_bond(bond_id, qty)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "bond.errorUnknown"))
		order_rejected.emit(last_error)
		return result
	save_game(false)
	state_changed.emit("multiasset")
	return result


func sell_bond(bond_id: String, qty: int) -> Dictionary:
	if not started or exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := exchange.sell_bond(bond_id, qty)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "bond.errorUnknown"))
		order_rejected.emit(last_error)
		return result
	save_game(false)
	state_changed.emit("multiasset")
	return result


func fx_quotes() -> Array:
	return exchange.fx_quotes() if exchange != null else []


func fx_rows() -> Array:
	return exchange.fx_rows() if exchange != null else []


func buy_fx(pair_id: String, units: int) -> Dictionary:
	if not started or exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := exchange.buy_fx(pair_id, units)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "fx.errorUnknown"))
		order_rejected.emit(last_error)
		return result
	save_game(false)
	state_changed.emit("multiasset")
	return result


func sell_fx(pair_id: String, units: int) -> Dictionary:
	if not started or exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := exchange.sell_fx(pair_id, units)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "fx.errorUnknown"))
		order_rejected.emit(last_error)
		return result
	save_game(false)
	state_changed.emit("multiasset")
	return result


func commodity_quotes() -> Array:
	return exchange.commodity_quotes() if exchange != null else []


func commodity_rows() -> Array:
	return exchange.commodity_rows() if exchange != null else []


func buy_commodity(commodity_id: String, qty: int) -> Dictionary:
	if not started or exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := exchange.buy_commodity(commodity_id, qty)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "commodity.errorUnknown"))
		order_rejected.emit(last_error)
		return result
	save_game(false)
	state_changed.emit("multiasset")
	return result


func sell_commodity(commodity_id: String, qty: int) -> Dictionary:
	if not started or exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := exchange.sell_commodity(commodity_id, qty)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "commodity.errorUnknown"))
		order_rejected.emit(last_error)
		return result
	save_game(false)
	state_changed.emit("multiasset")
	return result


func crypto_quotes() -> Array:
	return exchange.crypto_quotes() if exchange != null else []


func crypto_rows() -> Array:
	return exchange.crypto_rows() if exchange != null else []


func buy_crypto(crypto_id: String, units: float) -> Dictionary:
	if not started or exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := exchange.buy_crypto(crypto_id, units)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "crypto.errorUnknown"))
		order_rejected.emit(last_error)
		return result
	save_game(false)
	state_changed.emit("multiasset")
	return result


func sell_crypto(crypto_id: String, units: float) -> Dictionary:
	if not started or exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := exchange.sell_crypto(crypto_id, units)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "crypto.errorUnknown"))
		order_rejected.emit(last_error)
		return result
	save_game(false)
	state_changed.emit("multiasset")
	return result


func statement_history(ticker: String, count: int = 8) -> Array:
	var day := int(exchange.state["dayIndex"]) if exchange != null else 0
	return SmaFundamentals.history(ticker.to_upper(), count, day)


func etf_nav(ticker: String) -> float:
	if exchange == null:
		return 0.0
	return SmaEtfs.nav(exchange.state["companies"], ticker)


func etf_holdings(ticker: String) -> Array:
	if exchange == null:
		return []
	return SmaEtfs.holdings_rows(exchange.state["companies"], ticker)


func etf_rows() -> Array:
	if exchange == null:
		return []
	var rows: Array = []
	for ticker in SmaEtfs.tickers():
		var quote: Dictionary = exchange.quote(ticker)
		var nav_value := SmaEtfs.nav(exchange.state["companies"], ticker)
		var last := float(quote.get("last", 0.0))
		var definition := SmaEtfs.definition(ticker)
		rows.append({
			"ticker": ticker,
			"name": String(definition.get("name", ticker)),
			"last": last,
			"nav": nav_value,
			"premium": SmaEtfs.premium(last, nav_value),
			"changePct": float(quote.get("changePct", 0.0)),
			"expenseRatio": float(definition.get("expenseRatio", 0.0)),
			"volume": int(quote.get("volume", 0)),
			"bid": quote.get("bid", null),
			"ask": quote.get("ask", null),
		})
	return rows


func submit_oco(params: Dictionary) -> Dictionary:
	if not started or exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var fill_start := exchange.last_player_fills.size()
	var result := exchange.submit_oco(params)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "order.invalid"))
		order_rejected.emit(last_error)
		exchange.clear_player_fills()
		return result
	var fills: Array = exchange.last_player_fills.slice(fill_start)
	exchange.clear_player_fills()
	for fill in fills:
		trade_filled.emit(fill)
		if narrative != null:
			narrative.handle_event("trade_filled", fill)
	if not fills.is_empty():
		save_game(false)
		academy_sync_practice()
	state_changed.emit("order")
	return result


func cancel_order(order_id: String) -> Dictionary:
	if not started or exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var order_result := exchange.cancel_order(order_id)
	if not bool(order_result.get("ok", false)):
		last_error = String(order_result.get("error", "order.invalid"))
		order_rejected.emit(last_error)
		return order_result
	academy_sync_practice()
	state_changed.emit("order")
	return order_result


func quant_history(ticker: String) -> Array:
	if exchange == null:
		return []
	return SmaQuant.history_for(exchange, ticker)


func quant_backtest(config: Dictionary) -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var normalized := SmaQuant.normalize_config(config)
	var ticker := String(normalized["ticker"])
	if ticker == "":
		ticker = selected_ticker
		normalized["ticker"] = ticker
	return SmaQuant.run_backtest(SmaQuant.history_for(exchange, ticker),
		String(normalized["strategy"]), normalized["params"],
		float(normalized["initialCash"]), float(normalized["commission"]))


func quant_optimize(config: Dictionary) -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var normalized := SmaQuant.normalize_config(config)
	var ticker := String(normalized["ticker"])
	if ticker == "":
		ticker = selected_ticker
	return SmaQuant.optimize(SmaQuant.history_for(exchange, ticker),
		String(normalized["strategy"]), normalized["params"],
		float(normalized["initialCash"]), float(normalized["commission"]),
		int(normalized["splitPct"]), String(normalized["objective"]))


func quant_factor_research(factor: String, lookback: int) -> Dictionary:
	if exchange == null:
		return {"factor": factor, "lookback": lookback, "rows": [], "count": 0}
	return SmaQuant.factor_research(exchange, factor, lookback)


func quant_regression(lookback: int, horizon: int) -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	return SmaQuant.factor_regression(exchange, lookback, horizon)


func quant_ml(config: Dictionary) -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var normalized := SmaQuant.normalize_config(config)
	return SmaQuant.ml_stock_selection(exchange, int(normalized["mlLookback"]),
		int(normalized["mlHorizon"]), int(normalized["mlTopN"]),
		int(normalized["mlTestPct"]), String(normalized["mlModel"]),
		bool(normalized["mlAutoTune"]))


func set_quant_config(config: Dictionary) -> void:
	quant = SmaQuant.normalize_config(config)


func career_context() -> Dictionary:
	if exchange == null:
		return {"academy": academy}
	var account: Dictionary = exchange.state["account"]
	var tickers: Array = SmaCompanyCatalog.load_companies().keys()
	return {
		"academy": academy,
		"day": int(exchange.state["dayIndex"]),
		"equity": exchange.equity(),
		"initialCash": float(account.get("initialCash", START_CASH)),
		"careerIncome": float(account.get("careerIncome", 0.0)),
		"trades": account.get("trades", []).size(),
		"optionTrades": account.get("optionTrades", []).size(),
		"futuresTrades": account.get("futuresTrades", []).size(),
		"equityHistory": account.get("equityHistory", []),
		"challengesCompleted": challenges.get("completed", []),
		"tickers": tickers,
	}


func career_progress() -> Dictionary:
	return SmaCareer.progress(career, career_context())


func promote_career() -> Dictionary:
	var result := SmaCareer.promote(career, career_context(),
		int(exchange.state["dayIndex"]) if exchange != null else 0)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "career.errorNotReady"))
		order_rejected.emit(last_error)
		return result
	var rank: Dictionary = result.get("rank", {})
	toast_requested.emit(I18n.t("toast.careerPromoted", {
		"rank": I18n.t(String(rank.get("titleKey", ""))),
		"xp": int(result.get("xp", 0)),
	}))
	for certificate in result.get("certificates", []):
		toast_requested.emit(I18n.t("toast.certificateEarned", {
			"names": I18n.t(String(certificate.get("id", ""))),
		}))
	save_game(false)
	academy_sync_practice()
	state_changed.emit("career")
	return result


func accept_research_task(task_id: String) -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := SmaCareer.accept_task(career, task_id,
		int(exchange.state["dayIndex"]))
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "career.task.errorUnavailable"))
		order_rejected.emit(last_error)
		return result
	save_game(false)
	state_changed.emit("career")
	return result


func career_report_context(task_id: String) -> Dictionary:
	if exchange == null:
		return {}
	var task: Dictionary = {}
	for entry in career.get("tasks", []):
		if String(entry.get("id", "")) == task_id:
			task = entry
			break
	if task.is_empty():
		return {}
	var ticker := String(task.get("ticker", ""))
	var quote: Dictionary = exchange.quote(ticker)
	var candles: Array = exchange.get_candles(ticker, "1D")
	return {
		"ticker": ticker,
		"last": float(quote.get("last", 0.0)),
		"trend": SmaCareer.trend_for(candles),
	}


func submit_investment_report(input: Dictionary) -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var task_id := String(input.get("taskId", ""))
	var context_data := career_report_context(task_id)
	if context_data.is_empty():
		return {"ok": false, "error": "career.report.errorTask"}
	var ticker := String(context_data["ticker"])
	context_data["inspected"] = academy.get("inspectedTickers", []).has(ticker)
	context_data["financialsDone"] = SmaAcademy.is_unit_complete(academy, "u12")
	context_data["academy"] = academy
	var result := SmaCareer.submit_report(career, input, context_data,
		int(exchange.state["dayIndex"]))
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "career.report.errorTask"))
		order_rejected.emit(last_error)
		return result
	var cash := float(result.get("cash", 0.0))
	if cash > 0.0:
		var account: Dictionary = exchange.state["account"]
		account["cash"] = SmaFormat.round_to(float(account["cash"]) + cash, 2)
		account["careerIncome"] = SmaFormat.round_to(
			float(account.get("careerIncome", 0.0)) + cash, 2)
	toast_requested.emit(I18n.t("toast.reportGraded", {
		"score": int(result["report"]["score"]),
		"grade": String(result["report"]["grade"]),
		"xp": int(result.get("xp", 0)),
	}))
	save_game(false)
	academy_sync_practice()
	state_changed.emit("career")
	return result


func _advance_career() -> void:
	if exchange == null:
		return
	var day := int(exchange.state["dayIndex"])
	var ctx := career_context()
	var account: Dictionary = exchange.state["account"]
	var salary := SmaCareer.apply_salary(account, career, day)
	if bool(salary.get("paid", false)):
		toast_requested.emit(I18n.t("toast.careerSalary", {
			"amount": SmaFormat.money(float(salary["amount"])),
			"rank": I18n.t(String(SmaCareer.rank_def(int(career["rank"]))["titleKey"])),
		}))
	var evaluation := SmaCareer.evaluate(career, ctx, day)
	if bool(evaluation.get("due", false)):
		var record: Dictionary = evaluation["evaluation"]
		toast_requested.emit(I18n.t("toast.careerEvaluation", {
			"grade": String(record["grade"]), "score": int(record["score"]),
		}))
	SmaCareer.refresh_tasks(career, day, ctx.get("tickers", []))
	var synced := SmaCareer.sync_certificates(career, ctx, day)
	for certificate in synced.get("newlyEarned", []):
		toast_requested.emit(I18n.t("toast.certificateEarned", {
			"names": String(certificate.get("id", "")),
		}))
	if bool(salary.get("paid", false)) or bool(evaluation.get("due", false)) \
			or not synced.get("newlyEarned", []).is_empty():
		state_changed.emit("career")


func fund_unlocked() -> bool:
	return SmaFund.unlocked(career)


func fund_quotes() -> Dictionary:
	var quotes := {}
	if exchange == null:
		return quotes
	for ticker in SmaCompanyCatalog.load_companies().keys():
		quotes[String(ticker)] = exchange.quote(String(ticker))
	return quotes


func fund_metrics() -> Dictionary:
	if exchange == null:
		return {}
	return SmaFund.metrics(fund, fund_quotes(), exchange.market_index(),
		float(exchange.quote("MKT").get("last", 0.0)), int(exchange.state["dayIndex"]))


func fund_leaderboard() -> Array:
	return SmaFund.leaderboard(fund, int(exchange.state["dayIndex"]) if exchange != null else 0)


func fund_attribution() -> Dictionary:
	if exchange == null:
		return {}
	return SmaFund.attribution(fund, exchange)


func fund_risk_model() -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "fund.riskModel.history"}
	return SmaFund.factor_risk(fund, exchange, 60)


func create_fund(input: Dictionary) -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	if not fund_unlocked():
		return {"ok": false, "error": "fund.errorLocked"}
	if String(fund.get("status", "none")) == "active":
		return {"ok": false, "error": "fund.errorAlreadyActive"}
	var benchmark_id := String(input.get("benchmarkId", "index"))
	var benchmark_start := 0.0
	if benchmark_id == "index":
		benchmark_start = exchange.market_index()
	elif benchmark_id == "mkt":
		benchmark_start = float(exchange.quote("MKT").get("last", 0.0))
	var result := SmaFund.setup(String(input.get("name", "")),
		String(input.get("strategy", "longOnly")), String(input.get("riskProfile", "balanced")),
		float(input.get("initialAum", SmaFund.AUM_OPTIONS[1])),
		float(input.get("managementRate", 0.02)), float(input.get("performanceRate", 0.2)),
		benchmark_id, float(input.get("hurdleRate", 0.0)),
		bool(input.get("leverageEnabled", false)), String(input.get("taxProfileId", "none")),
		int(exchange.state["dayIndex"]), String(exchange.state["seed"]), benchmark_start)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "fund.errorName"))
		order_rejected.emit(last_error)
		return result
	fund = result["fund"]
	toast_requested.emit(I18n.t("toast.fundCreated", {"name": String(fund["name"])}))
	save_game(false)
	state_changed.emit("fund")
	return {"ok": true, "fund": fund}


func fund_buy(ticker: String, qty: int) -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := SmaFund.buy(fund, fund_quotes(), ticker, qty,
		int(exchange.state["dayIndex"]))
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "fund.errorNotActive"))
		order_rejected.emit(last_error)
		return result
	save_game(false)
	state_changed.emit("fund")
	return result


func fund_sell(ticker: String, qty: int) -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := SmaFund.sell(fund, fund_quotes(), ticker, qty,
		int(exchange.state["dayIndex"]))
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "fund.errorNotActive"))
		order_rejected.emit(last_error)
		return result
	save_game(false)
	state_changed.emit("fund")
	return result


func fund_hire(role_id: String) -> Dictionary:
	var result := SmaFund.hire(fund, role_id)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "fund.errorUnknownRole"))
		order_rejected.emit(last_error)
		return result
	toast_requested.emit(I18n.t("toast.fundHired", {
		"role": I18n.t(String(result["role"]["nameKey"]))}))
	save_game(false)
	state_changed.emit("fund")
	return result


func fund_fire(role_id: String) -> Dictionary:
	var result := SmaFund.fire(fund, role_id)
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "fund.errorNoEmployee"))
		order_rejected.emit(last_error)
		return result
	toast_requested.emit(I18n.t("toast.fundFired"))
	save_game(false)
	state_changed.emit("fund")
	return result


func fund_accept_client(candidate_id: String) -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := SmaFund.accept_client(fund, candidate_id, fund_metrics(),
		int(exchange.state["dayIndex"]))
	if not bool(result.get("ok", false)):
		return result
	toast_requested.emit(I18n.t("toast.fundClientJoined", {
		"name": String(result["client"]["name"])}))
	save_game(false)
	state_changed.emit("fund")
	return result


func fund_settle_redemption(client_id: String) -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := SmaFund.settle_redemption(fund, client_id, fund_metrics(),
		int(exchange.state["dayIndex"]))
	if not bool(result.get("ok", false)):
		return result
	save_game(false)
	state_changed.emit("fund")
	return result


func fund_withdraw_company_cash() -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := SmaFund.withdraw_company_cash(fund, exchange.state["account"])
	if not bool(result.get("ok", false)):
		return result
	toast_requested.emit(I18n.t("toast.fundCashWithdrawn", {
		"amount": SmaFormat.money(float(result["amount"]))}))
	save_game(false)
	state_changed.emit("fund")
	return result


func fund_set_strategy(config: Dictionary) -> void:
	fund["quantPlan"] = SmaFund._normalize_plan(config)
	save_game(false)
	state_changed.emit("fund")


func fund_generate_plan() -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := SmaFund.build_plan(fund, exchange, int(exchange.state["dayIndex"]),
		fund.get("quantPlan", {}))
	if bool(result.get("ok", false)):
		fund["quantPlan"]["plan"] = result["plan"]
		fund["quantPlan"]["lastPlanDay"] = int(exchange.state["dayIndex"])
		save_game(false)
		state_changed.emit("fund")
	return result


func fund_apply_plan() -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var plan: Dictionary = fund.get("quantPlan", {}).get("plan", {})
	var result := SmaFund.apply_plan(fund, exchange, plan, int(exchange.state["dayIndex"]))
	if bool(result.get("ok", false)):
		fund["quantPlan"]["plan"] = null
		toast_requested.emit(I18n.t("toast.fundPlanApplied", {
			"applied": int(result.get("applied", 0)),
			"failed": result.get("failures", []).size(),
		}))
		save_game(false)
		state_changed.emit("fund")
	return result


func fund_research() -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	return SmaFund.research_plan(fund, exchange, fund.get("quantPlan", {}), 70, "sharpe")


func fund_apply_research(config: Dictionary) -> void:
	var plan: Dictionary = fund.get("quantPlan", {})
	plan["topN"] = int(config.get("topN", plan.get("topN", 5)))
	plan["cashBuffer"] = float(config.get("cashBuffer", plan.get("cashBuffer", 0.1)))
	plan["rebalanceDays"] = int(config.get("rebalanceDays",
		plan.get("rebalanceDays", 21)))
	plan["plan"] = null
	fund["quantPlan"] = SmaFund._normalize_plan(plan)
	toast_requested.emit(I18n.t("toast.fundResearchApplied"))
	save_game(false)
	state_changed.emit("fund")


func fund_optimize(method: String, lookback: int, max_weight: float,
		cash_buffer: float) -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	return SmaFund.optimize_portfolio(exchange, method, lookback, max_weight, cash_buffer)


func fund_apply_optimizer(weights: Array) -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var plan := SmaFund.optimizer_plan(fund, exchange, weights,
		int(exchange.state["dayIndex"]))
	if not bool(plan.get("ok", false)):
		return plan
	var result := SmaFund.apply_plan(fund, exchange, plan["plan"],
		int(exchange.state["dayIndex"]))
	toast_requested.emit(I18n.t("toast.fundOptimizerPlan", {
		"count": plan["plan"]["trades"].size()}))
	save_game(false)
	state_changed.emit("fund")
	return result


func _advance_fund() -> void:
	if exchange == null or String(fund.get("status", "none")) != "active":
		return
	var day := int(exchange.state["dayIndex"])
	var result := SmaFund.advance_day(fund, exchange, day)
	var events: Array = result.get("events", [])
	for event in events:
		var event_type := String(event.get("type", ""))
		if event_type == "redemptionRequest":
			toast_requested.emit(I18n.t("toast.fundRedemptionRequest", {
				"name": String(event.get("name", ""))}))
		elif event_type == "closed":
			toast_requested.emit(I18n.t("toast.fundClosed", {
				"reason": I18n.t("fund.closeReason.%s" % String(event.get("reason", "")))}))
	var auto := SmaFund.auto_rebalance(fund, exchange, day)
	if bool(auto.get("executed", false)):
		toast_requested.emit(I18n.t("toast.fundAutoRebalance", {
			"applied": int(auto.get("applied", 0)), "failed": 0}))
	if not events.is_empty() or bool(auto.get("executed", false)):
		state_changed.emit("fund")


func tax_estimate(config: Dictionary) -> Dictionary:
	if exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var input := config.duplicate(true)
	input["trades"] = exchange.state["account"].get("trades", [])
	input["dividends"] = exchange.state["account"].get("dividends", [])
	var uk_shares: Array = []
	if bool(input.get("ukShares", true)):
		for ticker in SmaCompanyCatalog.load_companies().keys():
			uk_shares.append(String(ticker))
	input["ukShareTickers"] = uk_shares
	return SmaTax.estimate(input)


func challenge_progress() -> Dictionary:
	if exchange == null:
		return {}
	return SmaChallenges.progress(challenges, exchange)


func start_challenge(challenge_id: String) -> Dictionary:
	if not started or exchange == null:
		return {"ok": false, "error": "game.notStarted"}
	var result := SmaChallenges.start(challenges, academy, challenge_id,
		int(exchange.state["dayIndex"]), exchange.equity())
	if not bool(result.get("ok", false)):
		last_error = String(result.get("error", "challenges.errorUnknown"))
		order_rejected.emit(last_error)
		return result
	save_game(false)
	state_changed.emit("challenge")
	return result


func abandon_challenge() -> Dictionary:
	if not started:
		return {"ok": false, "error": "game.notStarted"}
	var result := SmaChallenges.abandon(challenges)
	if not bool(result.get("ok", false)):
		return result
	save_game(false)
	state_changed.emit("challenge")
	return result


func _check_challenges() -> void:
	if exchange == null:
		return
	var result := SmaChallenges.check(challenges, academy, exchange)
	var status := String(result.get("status", ""))
	if status.is_empty():
		return
	if status == "completed":
		var definition: Dictionary = result.get("definition", {})
		toast_requested.emit(I18n.t("toast.challengeCompleted", {
			"challenge": I18n.t(String(definition.get("titleKey", ""))),
			"xp": int(result.get("xp", definition.get("xp", 0))),
		}))
		state_changed.emit("challenge")
	elif status == "failed":
		var definition: Dictionary = result.get("definition", {})
		toast_requested.emit(I18n.t("toast.challengeFailed", {
			"challenge": I18n.t(String(definition.get("titleKey", ""))),
		}))
		state_changed.emit("challenge")


func select_ticker(ticker: String) -> void:
	if exchange == null:
		return
	var symbol := ticker.to_upper()
	if exchange.state["companies"].has(symbol):
		selected_ticker = symbol
		if SmaAcademy.record_inspection(academy, symbol):
			academy_sync_practice()
		state_changed.emit("selection")


# ---------------------------------------------------------------------------
# Academy
# ---------------------------------------------------------------------------

func academy_snapshot() -> Dictionary:
	return {
		"trades": exchange.state["account"]["trades"] if exchange != null else [],
		"orders": exchange.state["orders"] if exchange != null else [],
		"positions": exchange.state["account"]["positions"] if exchange != null else {},
		"optionTrades": exchange.state["account"].get("optionTrades", []) if exchange != null else [],
		"options": exchange.state["account"].get("options", []) if exchange != null else [],
		"futures": exchange.state["account"].get("futures", []) if exchange != null else [],
		"futuresTrades": exchange.state["account"].get("futuresTrades", []) if exchange != null else [],
		"cash": float(exchange.state["account"].get("cash", 0.0)) if exchange != null else 0.0,
		"day": get_day(),
	}


func academy_sync_practice() -> void:
	if exchange == null or academy.is_empty():
		return
	var snapshot := academy_snapshot()
	var completed := SmaAcademy.sync_practice(academy, snapshot, get_day())
	var achievements := SmaAcademy.evaluate_achievements(academy, snapshot)
	if completed.is_empty() and achievements.is_empty():
		return
	for entry in completed:
		if bool(entry.get("completed", false)):
			toast_requested.emit(I18n.t("toast.unitComplete"))
	academy_changed.emit()
	save_game(false)


func academy_mark_section_read(unit_id: String, section_id: String) -> Dictionary:
	var result := SmaAcademy.mark_section_read(academy, unit_id, section_id, get_day())
	if bool(result.get("ok", false)):
		var achievements := SmaAcademy.evaluate_achievements(academy, academy_snapshot())
		academy_changed.emit()
		if bool(result.get("completed", false)):
			toast_requested.emit(I18n.t("toast.unitComplete"))
		save_game(false)
		result["achievements"] = achievements
	return result


func academy_submit_quiz(unit_id: String, session: Dictionary, answers: Dictionary) -> Dictionary:
	var grade := SmaAcademy.grade_quiz(session, answers)
	var record := SmaAcademy.record_quiz(academy, unit_id, int(grade["score"]), get_day())
	var achievements := SmaAcademy.evaluate_achievements(academy, academy_snapshot())
	academy_changed.emit()
	if bool(record.get("completed", false)):
		toast_requested.emit(I18n.t("toast.unitComplete"))
	save_game(false)
	return {"grade": grade, "record": record, "achievements": achievements}


func academy_record_glossary(term_id: String) -> void:
	if SmaAcademy.record_glossary_visit(academy, term_id):
		SmaAcademy.evaluate_achievements(academy, academy_snapshot())
		academy_changed.emit()
		save_game(false)


func academy_complete_demo(demo_id: String) -> void:
	if not SmaAcademy.record_demo_completed(academy, demo_id):
		return
	SmaAcademy.evaluate_achievements(academy, academy_snapshot())
	academy_sync_practice()
	academy_changed.emit()
	save_game(false)
	toast_requested.emit(I18n.t("toast.demo_completed"))


func academy_record_financials(ticker: String) -> void:
	if not SmaAcademy.record_financials_viewed(academy, ticker):
		return
	SmaAcademy.evaluate_achievements(academy, academy_snapshot())
	academy_sync_practice()
	academy_changed.emit()
	save_game(false)


func academy_is_tool_unlocked(tool_id: String) -> bool:
	return SmaAcademy.is_tool_unlocked(academy, tool_id)


func academy_mark_language_switched() -> void:
	if bool(academy.get("languageSwitched", false)):
		return
	academy["languageSwitched"] = true
	SmaAcademy.evaluate_achievements(academy, academy_snapshot())
	academy_changed.emit()


func history_commit() -> void:
	save_game(false)
	state_changed.emit("history")


# ---------------------------------------------------------------------------
# Story host interface
# ---------------------------------------------------------------------------

func get_cash() -> float:
	return float(exchange.state["account"]["cash"]) if exchange != null else 0.0


func get_equity() -> float:
	return exchange.equity() if exchange != null else 0.0


func get_position_qty(ticker: String) -> int:
	if exchange == null:
		return 0
	return int(exchange.state["account"]["positions"].get(ticker.to_upper(), {}).get("qty", 0))


func get_trade_count() -> int:
	if exchange == null:
		return 0
	return exchange.state["account"]["trades"].size()


func get_day() -> int:
	return int(exchange.state["dayIndex"]) if exchange != null else 0


func localize(value: Variant) -> String:
	return I18n.resolve(value)


func story_add_cash(amount: float, memo: String = "story") -> void:
	if exchange == null:
		return
	exchange.apply_cash_adjustment(amount, memo)
	state_changed.emit("story_cash")


func toast(message: String) -> void:
	toast_requested.emit(message)


# ---------------------------------------------------------------------------
# Save / load
# ---------------------------------------------------------------------------

func start_sandbox(cash: float, seed_value: String, difficulty: String) -> Dictionary:
	if sandbox_mode:
		return {"ok": false, "error": "sandbox.errorActive"}
	if started:
		save_game(false)
	var safe_difficulty := difficulty if ["easy", "normal", "hard"].has(difficulty) else "normal"
	var commission := 0.0 if safe_difficulty == "easy" else (
		3.0 if safe_difficulty == "hard" else 1.0)
	var safe_cash := clampf(cash, 1000.0, 10000000.0)
	var safe_seed := seed_value.strip_edges().substr(0, 48)
	if safe_seed == "":
		safe_seed = "sandbox-2026"
	sandbox_config = {"cash": safe_cash, "seed": safe_seed,
		"difficulty": safe_difficulty, "commission": commission}
	sandbox_mode = true
	exchange = SmaExchange.new(safe_seed, safe_cash, commission)
	academy = SmaAcademy.create_state()
	history = SmaHistoryService.new()
	challenges = SmaChallenges.create_state()
	career = SmaCareer.create_state()
	quant = SmaQuant.default_config()
	fund = SmaFund.create_state()
	narrative = SmaStoryService.new()
	narrative.setup(self)
	narrative.load_content()
	_connect_narrative()
	started = true
	paused = true
	speed = 1
	selected_ticker = "APLA"
	_last_day = 0
	_last_call_id = ""
	_story_pause = false
	_accum = 0.0
	_ui_accum = 0.0
	_autosave_accum = 0.0
	game_started.emit()
	state_changed.emit("sandbox")
	return {"ok": true}


func exit_sandbox() -> void:
	if not sandbox_mode:
		return
	sandbox_mode = false
	if has_save():
		load_game()
	else:
		started = false
		exchange = null
		state_changed.emit("sandbox_exit")


func restart_sandbox() -> void:
	if not sandbox_mode:
		return
	var config := sandbox_config.duplicate(true)
	exit_sandbox()
	start_sandbox(float(config["cash"]), String(config["seed"]),
		String(config["difficulty"]))


func save_now() -> bool:
	return save_game(true)


func save_info() -> Dictionary:
	var exists := SmaSaveService.exists(save_path)
	var modified := 0
	if exists:
		modified = int(FileAccess.get_modified_time(save_path))
	return {"exists": exists, "modified": modified, "path": save_path,
		"bytes": FileAccess.get_file_as_bytes(save_path).size() if exists else 0}


func reset_progress() -> void:
	restart()


func export_save(target_path: String) -> bool:
	if not has_save():
		return false
	var bytes := FileAccess.get_file_as_bytes(save_path)
	if bytes.is_empty():
		return false
	var file := FileAccess.open(target_path, FileAccess.WRITE)
	if file == null:
		return false
	file.store_buffer(bytes)
	file.close()
	toast_requested.emit(I18n.t("toast.exported"))
	return true


func import_save(source_path: String) -> bool:
	var bytes := FileAccess.get_file_as_bytes(source_path)
	if bytes.is_empty():
		return false
	var parsed: Variant = JSON.parse_string(bytes.get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY \
			or int(parsed.get("version", 0)) != SAVE_VERSION:
		toast_requested.emit(I18n.t("toast.importInvalid"))
		return false
	var file := FileAccess.open(save_path, FileAccess.WRITE)
	if file == null:
		return false
	file.store_buffer(bytes)
	file.close()
	toast_requested.emit(I18n.t("toast.importOk"))
	return load_game()


func has_save() -> bool:
	return SmaSaveService.exists(save_path)


func save_game(manual: bool = true) -> bool:
	if sandbox_mode:
		if manual:
			toast_requested.emit(I18n.t("sandbox.noSave"))
		return false
	if not started or exchange == null:
		return false
	var payload := {
		"version": SAVE_VERSION,
		"savedAt": int(Time.get_unix_time_from_system()),
		"settings": settings,
		"selectedTicker": selected_ticker,
		"exchange": exchange.to_dict(),
		"narrative": narrative.to_dict() if narrative != null else {},
		"academy": academy,
		"history": history.to_dict() if history != null else {},
		"challenges": challenges,
		"career": career,
		"quant": quant,
		"fund": fund,
	}
	var ok := SmaSaveService.write(payload, save_path)
	if ok:
		game_saved.emit()
		if manual:
			toast_requested.emit(I18n.t("toast.saved"))
	return ok


func load_game() -> bool:
	var payload := SmaSaveService.read(save_path)
	if payload.is_empty() or int(payload.get("version", 0)) != SAVE_VERSION:
		toast_requested.emit(I18n.t("toast.no_save"))
		return false
	var saved_exchange: Variant = payload.get("exchange", {})
	if typeof(saved_exchange) != TYPE_DICTIONARY:
		return false
	var engine := SmaExchange.from_dict(saved_exchange)
	if engine == null:
		toast_requested.emit(I18n.t("toast.no_save"))
		return false
	exchange = engine
	academy = SmaAcademy.normalize_state(payload.get("academy", {}))
	challenges = SmaChallenges.normalize_state(payload.get("challenges", {}))
	career = SmaCareer.normalize_state(payload.get("career", {}),
		int(payload.get("exchange", {}).get("dayIndex", 0)))
	quant = SmaQuant.normalize_config(payload.get("quant", {}))
	fund = SmaFund.normalize_state(payload.get("fund", {}),
		int(payload.get("exchange", {}).get("dayIndex", 0)), DEFAULT_SEED)
	history = SmaHistoryService.new()
	history.from_dict(payload.get("history", {}))
	narrative = SmaStoryService.new()
	narrative.setup(self)
	narrative.load_content()
	narrative.from_dict(payload.get("narrative", {}))
	_connect_narrative()
	var saved_settings: Dictionary = payload.get("settings", {})
	for key in saved_settings.keys():
		settings[key] = saved_settings[key]
	settings["liveFeedUrl"] = String(settings.get("liveFeedUrl", "")).strip_edges().substr(0, 300)
	var live_interval := int(settings.get("liveFeedInterval", 60))
	settings["liveFeedInterval"] = live_interval if [15, 30, 60].has(live_interval) else 60
	I18n.set_locale(String(settings.get("locale", "zh_CN")))
	SmaUiTheme.set_theme_mode(String(settings.get("theme", "dark")))
	_apply_layout(String(settings.get("layout", "beginner")))
	selected_ticker = String(payload.get("selectedTicker", "APLA"))
	if not exchange.state["companies"].has(selected_ticker):
		selected_ticker = "APLA"
	started = true
	paused = true
	var saved_speed := int(settings.get("speed", 1))
	speed = saved_speed if SPEEDS.has(saved_speed) else 1
	_accum = 0.0
	_ui_accum = 0.0
	_autosave_accum = 0.0
	_last_day = int(exchange.state["dayIndex"])
	_last_call_id = _current_call_id()
	_story_pause = narrative.is_active()
	game_loaded.emit()
	state_changed.emit("loaded")
	if _story_pause:
		story_changed.emit()
	return true


func delete_save() -> void:
	SmaSaveService.clear(save_path)
	toast_requested.emit(I18n.t("toast.deleted"))


func _current_call_id() -> String:
	if exchange == null:
		return ""
	var call: Variant = exchange.state["account"]["margin"].get("call", null)
	return String(call.get("id", "")) if call != null else ""
