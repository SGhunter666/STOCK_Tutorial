extends Node

## End-to-end live-feed test. Starts a tiny local HTTP server, points the real
## market screen at it through the settings path, and verifies the fetched JSON
## reaches the UI. Also covers 404, malformed JSON and empty payloads.

var _server: TCPServer
var _peer: StreamPeerTCP
var _request_text := ""
var _port := 0
var _failures: Array[String] = []


func _ready() -> void:
	Game.save_path = "user://saves/live-network.json"
	SmaSaveService.clear(Game.save_path)
	var main_scene: PackedScene = load("res://ui/main.tscn")
	var main := main_scene.instantiate()
	add_child(main)
	await get_tree().process_frame
	await get_tree().process_frame

	Game.new_game("live-network-seed")
	await get_tree().process_frame
	main.navigate("market")
	await get_tree().process_frame

	if not _start_server():
		_expect(false, "local HTTP server did not start")
		_finish()
		return
	var base := "http://127.0.0.1:%d" % _port
	var market = main._screens["market"]

	Game.set_live_feed(base + "/quotes.json", 15)
	var ready_ok := await _wait_status(market, "ready", "", 6000)
	_expect(ready_ok, "live feed did not reach ready")
	if ready_ok:
		_expect((market._live_data.get("quotes", []) as Array).size() == 3,
			"live feed did not parse three quotes")
		_expect(_quote_last(market, "AURA") > 12.0, "AURA quote missing")
		_expect(_quote_change(market, "NOVA") < 0.0, "NOVA change missing")
		_expect(int(market._live_data.get("updatedAt", 0)) > 0,
			"live feed timestamp was not parsed")
		_expect(market._live_body.get_child_count() >= 4,
			"live feed card did not render rows")

	Game.set_live_feed(base + "/missing", 15)
	var http_ok := await _wait_status(market, "error", "liveFeed.errorHttp", 6000)
	_expect(http_ok, "HTTP 404 did not surface a feed error")

	Game.set_live_feed(base + "/malformed", 15)
	var json_ok := await _wait_status(market, "error", "liveFeed.errorFetch", 6000)
	_expect(json_ok, "malformed JSON did not surface a parse error")

	Game.set_live_feed(base + "/empty", 15)
	var empty_ok := await _wait_status(market, "error", "liveFeed.errorQuotes", 6000)
	_expect(empty_ok, "empty quote payload did not surface an error")

	Game.set_live_feed("", 60)
	await get_tree().process_frame
	_expect(String(Game.settings.get("liveFeedUrl", "")) == "",
		"clearing the feed URL did not persist")
	_finish()


func _start_server() -> bool:
	_server = TCPServer.new()
	for candidate in [47831, 47832, 47833, 47834]:
		if _server.listen(candidate, "127.0.0.1") == OK:
			_port = candidate
			set_process(true)
			return true
	return false


func _process(_delta: float) -> void:
	if _server == null:
		return
	if _peer == null:
		if not _server.is_connection_available():
			return
		_peer = _server.take_connection()
		_request_text = ""
	_peer.poll()
	if _peer.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		_peer = null
		_request_text = ""
		return
	var available := _peer.get_available_bytes()
	if available > 0:
		var chunk: Array = _peer.get_data(available)
		if int(chunk[0]) == OK:
			_request_text += (chunk[1] as PackedByteArray).get_string_from_utf8()
	if _request_text.contains("\r\n\r\n") or _request_text.length() > 4096:
		_respond(_request_text)
		_request_text = ""


func _respond(request: String) -> void:
	var path := "/"
	var first_line := request.get_slice("\r\n", 0)
	var parts := first_line.split(" ")
	if parts.size() >= 2:
		path = parts[1]
	var head := "HTTP/1.1 200 OK"
	var body := ""
	if path == "/missing":
		head = "HTTP/1.1 404 Not Found"
		body = "missing"
	elif path == "/malformed":
		body = "{not json"
	elif path == "/empty":
		body = "{\"quotes\":{}}"
	else:
		body = "{\"updatedAt\":\"2026-11-03T09:31:00Z\",\"quotes\":{" \
			+ "\"AURA\":12.34," \
			+ "\"NOVA\":{\"last\":8.5,\"changePct\":-1.2}," \
			+ "\"APLA\":{\"last\":181.9,\"changePct\":0.8}}}"
	var response := "%s\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s" \
		% [head, body.to_utf8_buffer().size(), body]
	_peer.put_data(response.to_utf8_buffer())


func _wait_status(market, status: String, error_key: String, timeout_ms: int) -> bool:
	var deadline := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() < deadline:
		if market._live_status == status \
				and (error_key == "" or market._live_error == error_key):
			return true
		await get_tree().process_frame
	return false


func _quote_last(market, ticker: String) -> float:
	for quote in market._live_data.get("quotes", []):
		if String(quote.get("ticker", "")) == ticker:
			return float(quote.get("last", 0.0))
	return 0.0


func _quote_change(market, ticker: String) -> float:
	for quote in market._live_data.get("quotes", []):
		if String(quote.get("ticker", "")) == ticker:
			return float(quote.get("changePct", 0.0))
	return 0.0


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failures.append(message)


func _finish() -> void:
	if _peer != null:
		_peer.disconnect_from_host()
		_peer = null
	if _server != null:
		_server.stop()
		_server = null
	SmaSaveService.clear(Game.save_path)
	Game.save_path = SmaSaveService.SAVE_PATH
	if _failures.is_empty():
		print("LIVE NETWORK OK quotes=3 errors=404,malformed,empty")
		get_tree().quit(0)
	else:
		for failure in _failures:
			printerr("LIVE NETWORK FAIL: ", failure)
		get_tree().quit(1)
