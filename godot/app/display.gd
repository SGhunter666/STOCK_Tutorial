## Window sizing helpers. The UI is authored against a 1440x900 canvas and the
## project's canvas_items + expand stretch mode scales it to the window.
class_name SmaDisplay
extends RefCounted

const BASE_SIZE := Vector2i(1440, 900)
const MIN_SIZE := Vector2i(1280, 720)
const MAX_SIZE := Vector2i(2560, 1600)
const PRESETS := ["auto", "1440x900", "1920x1080", "2560x1600"]
const MODES := ["windowed", "fullscreen"]


static func normalise_mode(mode: String) -> String:
	return mode if MODES.has(mode) else "windowed"


static func normalise_preset(preset: String) -> String:
	return preset if PRESETS.has(preset) else "auto"


static func target_window_size(screen_size: Vector2i, preset: String) -> Vector2i:
	var target := BASE_SIZE
	match preset:
		"1440x900":
			target = Vector2i(1440, 900)
		"1920x1080":
			target = Vector2i(1920, 1080)
		"2560x1600":
			target = Vector2i(2560, 1600)
		_:
			target = Vector2i(int(float(screen_size.x) * 0.9),
				int(float(screen_size.y) * 0.88))
	target.x = clampi(target.x, MIN_SIZE.x, maxi(MIN_SIZE.x, mini(screen_size.x, MAX_SIZE.x)))
	target.y = clampi(target.y, MIN_SIZE.y, maxi(MIN_SIZE.y, mini(screen_size.y, MAX_SIZE.y)))
	return target


static func centered_position(usable: Rect2i, window_size: Vector2i) -> Vector2i:
	return usable.position + (usable.size - window_size) / 2


## Pure display decision: headless tests can cover the fullscreen branch without
## touching the DisplayServer.
static func resolve_display(mode: String, preset: String, usable: Rect2i) -> Dictionary:
	if normalise_mode(mode) == "fullscreen":
		return {"mode": "fullscreen", "size": usable.size, "position": usable.position}
	var size := target_window_size(usable.size, normalise_preset(preset))
	return {"mode": "windowed", "size": size, "position": centered_position(usable, size)}
