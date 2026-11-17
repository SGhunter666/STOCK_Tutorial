## Event-driven narrative runner.
##
## Domain events (trade filled, day closed, margin call, new game) are matched
## against trigger definitions in data/stories/manifest.json. The runner is
## UI-free: it emits view_changed and calls a small host interface for numbers
## and cash effects, so story content is data — never engine code.
class_name SmaStoryService
extends RefCounted

signal view_changed
signal story_started(story_id: String)
signal story_finished(story_id: String)

const MANIFEST_PATH := "res://data/stories/manifest.json"
const HISTORY_LIMIT := 200

var host: Object = null
var stories: Dictionary = {}
var triggers: Array = []
var flags: Dictionary = {}
var seen: Dictionary = {}
var history: Array = []
var queue: Array[String] = []

var active_id: String = ""
var active_story: Dictionary = {}
var node_id: String = ""


func setup(target_host: Object) -> void:
	host = target_host


func load_content() -> bool:
	var manifest_file := FileAccess.open(MANIFEST_PATH, FileAccess.READ)
	if manifest_file == null:
		push_error("SmaStoryService: missing manifest %s" % MANIFEST_PATH)
		return false
	var manifest: Variant = JSON.parse_string(manifest_file.get_as_text())
	if typeof(manifest) != TYPE_DICTIONARY:
		push_error("SmaStoryService: malformed manifest")
		return false
	stories.clear()
	for file_name in manifest.get("stories", []):
		var path := "res://data/stories/%s" % String(file_name)
		var file := FileAccess.open(path, FileAccess.READ)
		if file == null:
			push_error("SmaStoryService: missing story %s" % path)
			continue
		var story: Variant = JSON.parse_string(file.get_as_text())
		if typeof(story) != TYPE_DICTIONARY or not story.has("nodes") or not story.has("start"):
			push_error("SmaStoryService: invalid story %s" % path)
			continue
		stories[String(story.get("id", file_name.get_basename()))] = story
	triggers.clear()
	var trigger_file: Variant = manifest.get("triggers", "")
	if String(trigger_file) != "":
		var handle := FileAccess.open("res://data/stories/%s" % String(trigger_file), FileAccess.READ)
		if handle != null:
			var parsed: Variant = JSON.parse_string(handle.get_as_text())
			if typeof(parsed) == TYPE_DICTIONARY:
				triggers = parsed.get("triggers", [])
	return not stories.is_empty()


func is_active() -> bool:
	return not active_id.is_empty()


func start_story(story_id: String) -> bool:
	if not stories.has(story_id):
		return false
	if is_active():
		if active_id != story_id and not queue.has(story_id):
			queue.append(story_id)
		return false
	active_id = story_id
	active_story = stories[story_id]
	seen[story_id] = true
	node_id = String(active_story.get("start", ""))
	_record("start")
	story_started.emit(active_id)
	view_changed.emit()
	return true


func advance() -> void:
	if not is_active():
		return
	var node := current_node()
	if node.is_empty():
		_finish()
		return
	var node_type := String(node.get("type", "line"))
	if node_type == "choice":
		if _available_choices(node).is_empty():
			_finish()
		return
	if node_type == "end":
		_finish()
		return
	var next_id := String(node.get("next", ""))
	if next_id.is_empty():
		_finish()
	else:
		_goto(next_id)


func choose(index: int) -> bool:
	if not is_active():
		return false
	var node := current_node()
	if String(node.get("type", "")) != "choice":
		return false
	var choices: Array = node.get("choices", [])
	if index < 0 or index >= choices.size():
		return false
	var choice: Dictionary = choices[index]
	if not evaluate(choice.get("condition", null)):
		return false
	_apply_effects(choice.get("effects", []))
	var next_id := String(choice.get("next", ""))
	if next_id.is_empty():
		_finish()
	else:
		_goto(next_id)
	return true


func current_node() -> Dictionary:
	if not is_active():
		return {}
	var nodes: Dictionary = active_story.get("nodes", {})
	return nodes.get(node_id, {})


## UI-facing snapshot. Choices that fail their condition are excluded.
func current_view() -> Dictionary:
	if not is_active():
		return {"active": false}
	var node := current_node()
	var node_type := String(node.get("type", "line"))
	var choices: Array = []
	if node_type == "choice":
		for choice in _available_choices(node):
			choices.append({"index": int(choice["index"]), "text": _resolve(choice["text"])})
	return {
		"active": true,
		"story_id": active_id,
		"title": _resolve(active_story.get("title", "")),
		"speaker": _resolve(node.get("speaker", "")),
		"text": _resolve(node.get("text", "")),
		"type": node_type,
		"choices": choices,
		"background": String(node.get("background", "")),
		"portrait": String(node.get("portrait", "")),
		"can_continue": node_type == "line",
		"node_id": node_id,
	}


func _available_choices(node: Dictionary) -> Array:
	var available: Array = []
	var raw: Array = node.get("choices", [])
	for index in raw.size():
		var choice: Dictionary = raw[index]
		if evaluate(choice.get("condition", null)):
			var entry := choice.duplicate(true)
			entry["index"] = index
			available.append(entry)
	return available


func handle_event(event_name: String, payload: Dictionary = {}) -> void:
	for trigger in triggers:
		if String(trigger.get("event", "")) != event_name:
			continue
		var story_id := String(trigger.get("story", ""))
		if story_id.is_empty() or not stories.has(story_id):
			continue
		if bool(trigger.get("once", false)) and bool(seen.get(story_id, false)):
			continue
		if not evaluate(trigger.get("condition", null)):
			continue
		if is_active():
			if active_id != story_id and not queue.has(story_id):
				queue.append(story_id)
		else:
			start_story(story_id)


## Structured conditions instead of an expression parser: predictable, testable
## and impossible for content to execute arbitrary code.
func evaluate(condition: Variant) -> bool:
	if condition == null:
		return true
	if typeof(condition) == TYPE_BOOL:
		return bool(condition)
	if typeof(condition) != TYPE_DICTIONARY:
		return true
	var data: Dictionary = condition
	if data.has("all"):
		for entry in data["all"]:
			if not evaluate(entry):
				return false
	if data.has("any"):
		var matched := false
		for entry in data["any"]:
			if evaluate(entry):
				matched = true
				break
		if not matched:
			return false
	if data.has("not") and evaluate(data["not"]):
		return false
	if data.has("flag"):
		var flag_name := String(data["flag"])
		var expected: Variant = data.get("value", true)
		var actual: Variant = flags.get(flag_name, false)
		if typeof(expected) == TYPE_BOOL:
			if bool(actual) != bool(expected):
				return false
		elif str(actual) != str(expected):
			return false
	if data.has("cash_gte") and _host_number("get_cash") < float(data["cash_gte"]):
		return false
	if data.has("cash_lte") and _host_number("get_cash") > float(data["cash_lte"]):
		return false
	if data.has("equity_gte") and _host_number("get_equity") < float(data["equity_gte"]):
		return false
	if data.has("day_gte") and _host_number("get_day") < float(data["day_gte"]):
		return false
	if data.has("trade_count_gte") and _host_number("get_trade_count") < float(data["trade_count_gte"]):
		return false
	if data.has("position_qty_gte"):
		var spec: Dictionary = data["position_qty_gte"]
		var held := 0
		if host != null and host.has_method("get_position_qty"):
			held = int(host.get_position_qty(String(spec.get("ticker", ""))))
		if held < int(spec.get("qty", 0)):
			return false
	if data.has("story_seen"):
		if not bool(seen.get(String(data["story_seen"]), false)):
			return false
	return true


func _host_number(method_name: String) -> float:
	if host != null and host.has_method(method_name):
		return float(host.call(method_name))
	return 0.0


func _apply_effects(effects: Array) -> void:
	for effect in effects:
		if typeof(effect) != TYPE_DICTIONARY:
			continue
		if effect.has("set_flag"):
			flags[String(effect["set_flag"])] = effect.get("value", true)
		if effect.has("add_cash"):
			var amount := float(effect["add_cash"])
			if host != null and host.has_method("story_add_cash"):
				host.story_add_cash(amount, String(effect.get("memo", "story")))
		if effect.has("toast"):
			var message := _resolve(effect["toast"])
			if host != null and host.has_method("toast"):
				host.toast(message)


func _resolve(value: Variant) -> String:
	if host != null and host.has_method("localize"):
		return String(host.localize(value))
	if typeof(value) == TYPE_DICTIONARY:
		var table: Dictionary = value
		for key in table.keys():
			return String(table[key])
		return ""
	return String(value)


func _goto(next_id: String) -> void:
	var nodes: Dictionary = active_story.get("nodes", {})
	if next_id.is_empty() or not nodes.has(next_id):
		_finish()
		return
	var next_node: Dictionary = nodes[next_id]
	if String(next_node.get("type", "line")) == "end":
		_finish()
		return
	node_id = next_id
	_record("node")
	view_changed.emit()


func _finish() -> void:
	var finished_id := active_id
	active_id = ""
	active_story = {}
	node_id = ""
	if not finished_id.is_empty():
		_record("finish")
		story_finished.emit(finished_id)
	view_changed.emit()
	if not queue.is_empty():
		var next_story: String = queue.pop_front()
		start_story(next_story)


func _record(kind: String) -> void:
	history.append({"kind": kind, "story": active_id, "node": node_id,
		"day": int(_host_number("get_day"))})
	if history.size() > HISTORY_LIMIT:
		history = history.slice(history.size() - HISTORY_LIMIT)


func to_dict() -> Dictionary:
	return {
		"flags": flags,
		"seen": seen,
		"history": history,
		"activeId": active_id,
		"nodeId": node_id,
		"queue": queue,
	}


func from_dict(data: Dictionary) -> void:
	flags = data.get("flags", {})
	seen = data.get("seen", {})
	history = data.get("history", [])
	queue.clear()
	for item in data.get("queue", []):
		queue.append(String(item))
	active_id = String(data.get("activeId", ""))
	node_id = String(data.get("nodeId", ""))
	active_story = stories.get(active_id, {})
	if active_id.is_empty():
		active_story = {}
	view_changed.emit()
