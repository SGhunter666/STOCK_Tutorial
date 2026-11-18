extends "res://tests/test_base.gd"


func run() -> void:
	describe("display-presets")
	eq(SmaDisplay.target_window_size(Vector2i(2560, 1600), "1440x900"),
		Vector2i(1440, 900), "1440x900 preset")
	eq(SmaDisplay.target_window_size(Vector2i(2560, 1600), "1920x1080"),
		Vector2i(1920, 1080), "1080p preset")
	eq(SmaDisplay.target_window_size(Vector2i(2560, 1600), "2560x1600"),
		Vector2i(2560, 1600), "2K preset")
	eq(SmaDisplay.target_window_size(Vector2i(1920, 1080), "2560x1600"),
		Vector2i(1920, 1080), "2K preset clamps to the screen")
	eq(SmaDisplay.target_window_size(Vector2i(1280, 800), "auto"),
		Vector2i(1280, 720), "auto respects the minimum window size")
