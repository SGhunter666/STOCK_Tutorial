extends "res://tests/test_base.gd"

## Covers the pure display helpers: auto ratios, preset clamping, centring,
## fullscreen resolution and a broad sweep of desktop / laptop / ultrawide
## resolutions. Actual DisplayServer calls are exercised by integration.gd
## when a real window is available.

const AUTO_CASES := [
	[Vector2i(800, 600), Vector2i(1280, 720)],
	[Vector2i(1024, 600), Vector2i(1280, 720)],
	[Vector2i(1280, 720), Vector2i(1280, 720)],
	[Vector2i(1366, 768), Vector2i(1280, 720)],
	[Vector2i(1440, 900), Vector2i(1296, 792)],
	[Vector2i(1512, 982), Vector2i(1360, 864)],
	[Vector2i(1600, 900), Vector2i(1440, 792)],
	[Vector2i(1680, 1050), Vector2i(1512, 924)],
	[Vector2i(1728, 1117), Vector2i(1555, 982)],
	[Vector2i(1920, 1080), Vector2i(1728, 950)],
	[Vector2i(1920, 1200), Vector2i(1728, 1056)],
	[Vector2i(2048, 1152), Vector2i(1843, 1013)],
	[Vector2i(2256, 1504), Vector2i(2030, 1323)],
	[Vector2i(2560, 1080), Vector2i(2304, 950)],
	[Vector2i(2560, 1440), Vector2i(2304, 1267)],
	[Vector2i(2560, 1600), Vector2i(2304, 1408)],
	[Vector2i(2560, 1664), Vector2i(2304, 1464)],
	[Vector2i(2880, 1800), Vector2i(2560, 1584)],
	[Vector2i(3024, 1964), Vector2i(2560, 1600)],
	[Vector2i(3440, 1440), Vector2i(2560, 1267)],
	[Vector2i(3456, 2234), Vector2i(2560, 1600)],
	[Vector2i(3840, 1080), Vector2i(2560, 950)],
	[Vector2i(3840, 2160), Vector2i(2560, 1600)],
	[Vector2i(5120, 1440), Vector2i(2560, 1267)],
	[Vector2i(5120, 2880), Vector2i(2560, 1600)],
	[Vector2i(6016, 3384), Vector2i(2560, 1600)],
	[Vector2i(7680, 4320), Vector2i(2560, 1600)],
	[Vector2i(1080, 1920), Vector2i(1280, 1600)],
]

const PRESET_CASES := [
	[Vector2i(800, 600), "1440x900", Vector2i(1280, 720)],
	[Vector2i(800, 600), "1920x1080", Vector2i(1280, 720)],
	[Vector2i(800, 600), "2560x1600", Vector2i(1280, 720)],
	[Vector2i(1024, 600), "1440x900", Vector2i(1280, 720)],
	[Vector2i(1280, 720), "2560x1600", Vector2i(1280, 720)],
	[Vector2i(1366, 768), "1440x900", Vector2i(1366, 768)],
	[Vector2i(1366, 768), "1920x1080", Vector2i(1366, 768)],
	[Vector2i(1440, 900), "1440x900", Vector2i(1440, 900)],
	[Vector2i(1920, 1080), "1440x900", Vector2i(1440, 900)],
	[Vector2i(1920, 1080), "1920x1080", Vector2i(1920, 1080)],
	[Vector2i(1920, 1080), "2560x1600", Vector2i(1920, 1080)],
	[Vector2i(1920, 1200), "2560x1600", Vector2i(1920, 1200)],
	[Vector2i(2560, 1440), "2560x1600", Vector2i(2560, 1440)],
	[Vector2i(2560, 1600), "2560x1600", Vector2i(2560, 1600)],
	[Vector2i(2560, 1664), "2560x1600", Vector2i(2560, 1600)],
	[Vector2i(3840, 2160), "1440x900", Vector2i(1440, 900)],
	[Vector2i(3840, 2160), "1920x1080", Vector2i(1920, 1080)],
	[Vector2i(3840, 2160), "2560x1600", Vector2i(2560, 1600)],
	[Vector2i(5120, 2880), "2560x1600", Vector2i(2560, 1600)],
]


func run() -> void:
	describe("display-constants")
	check(SmaDisplay.MIN_SIZE.x < SmaDisplay.BASE_SIZE.x
		and SmaDisplay.BASE_SIZE.x < SmaDisplay.MAX_SIZE.x,
		"base width sits between the minimum and maximum")
	check(SmaDisplay.MIN_SIZE.y < SmaDisplay.BASE_SIZE.y
		and SmaDisplay.BASE_SIZE.y < SmaDisplay.MAX_SIZE.y,
		"base height sits between the minimum and maximum")
	eq(SmaDisplay.MODES, ["windowed", "fullscreen"], "supported window modes")
	eq(SmaDisplay.PRESETS, ["auto", "1440x900", "1920x1080", "2560x1600"],
		"supported presets")

	describe("display-auto-resolutions")
	for row in AUTO_CASES:
		var screen: Vector2i = row[0]
		eq(SmaDisplay.target_window_size(screen, "auto"), row[1],
			"auto adapts to %dx%d" % [screen.x, screen.y])

	describe("display-presets-on-screens")
	for row in PRESET_CASES:
		var screen: Vector2i = row[0]
		eq(SmaDisplay.target_window_size(screen, row[1]), row[2],
			"%s on %dx%d" % [row[1], screen.x, screen.y])

	describe("display-clamping-sweep")
	for width in range(640, 4001, 160):
		for height in range(480, 2401, 160):
			var screen := Vector2i(width, height)
			var upper_x := maxi(SmaDisplay.MIN_SIZE.x,
				mini(screen.x, SmaDisplay.MAX_SIZE.x))
			var upper_y := maxi(SmaDisplay.MIN_SIZE.y,
				mini(screen.y, SmaDisplay.MAX_SIZE.y))
			for preset in SmaDisplay.PRESETS:
				var size := SmaDisplay.target_window_size(screen, preset)
				var label := "%s on %dx%d" % [preset, width, height]
				check(size.x >= SmaDisplay.MIN_SIZE.x
					and size.x <= upper_x, label + " width within bounds")
				check(size.y >= SmaDisplay.MIN_SIZE.y
					and size.y <= upper_y, label + " height within bounds")
				check(size.x <= maxi(screen.x, SmaDisplay.MIN_SIZE.x)
					and size.y <= maxi(screen.y, SmaDisplay.MIN_SIZE.y),
					label + " never exceeds a screen larger than the minimum")

	describe("display-normalisation")
	for mode in SmaDisplay.MODES:
		eq(SmaDisplay.normalise_mode(mode), mode, "mode %s is accepted" % mode)
	for preset in SmaDisplay.PRESETS:
		eq(SmaDisplay.normalise_preset(preset), preset,
			"preset %s is accepted" % preset)
	eq(SmaDisplay.normalise_mode(""), "windowed", "empty mode falls back")
	eq(SmaDisplay.normalise_mode("FULLSCREEN"), "windowed",
		"mode matching is case-sensitive")
	eq(SmaDisplay.normalise_mode("bogus"), "windowed",
		"unknown mode falls back to windowed")
	eq(SmaDisplay.normalise_preset(""), "auto", "empty preset falls back")
	eq(SmaDisplay.normalise_preset("8K"), "auto",
		"unknown preset falls back to auto")

	describe("display-centering")
	eq(SmaDisplay.centered_position(Rect2i(0, 0, 2560, 1600),
		Vector2i(2560, 1600)), Vector2i(0, 0), "full-size window is not shifted")
	eq(SmaDisplay.centered_position(Rect2i(0, 0, 1920, 1080),
		Vector2i(1728, 950)), Vector2i(96, 65), "1080p window is centred")
	eq(SmaDisplay.centered_position(Rect2i(0, 0, 1920, 1080),
		Vector2i(1281, 721)), Vector2i(319, 179),
		"odd leftovers truncate toward zero")
	eq(SmaDisplay.centered_position(Rect2i(0, 25, 3840, 2135),
		Vector2i(2560, 1600)), Vector2i(640, 292),
		"menu bar and dock offsets are respected")
	eq(SmaDisplay.centered_position(Rect2i(-2560, 0, 2560, 1600),
		Vector2i(2304, 1408)), Vector2i(-2432, 96),
		"secondary screens with negative origins are supported")
	eq(SmaDisplay.centered_position(Rect2i(100, -50, 1600, 900),
		Vector2i(1280, 720)), Vector2i(260, 40),
		"offsets in both axes are respected")

	describe("display-fullscreen")
	var fullscreen := SmaDisplay.resolve_display("fullscreen", "1440x900",
		Rect2i(0, 0, 2560, 1600))
	eq(fullscreen["mode"], "fullscreen", "fullscreen mode is returned")
	eq(fullscreen["size"], Vector2i(2560, 1600),
		"fullscreen fills the usable screen")
	eq(fullscreen["position"], Vector2i(0, 0),
		"fullscreen starts at the screen origin")
	var offset_fullscreen := SmaDisplay.resolve_display("fullscreen", "bogus",
		Rect2i(-2560, 40, 3840, 2160))
	eq(offset_fullscreen["mode"], "fullscreen",
		"invalid presets do not disable fullscreen")
	eq(offset_fullscreen["size"], Vector2i(3840, 2160),
		"fullscreen uses the full usable size on secondary screens")
	eq(offset_fullscreen["position"], Vector2i(-2560, 40),
		"fullscreen keeps the screen origin")
	var tiny_fullscreen := SmaDisplay.resolve_display("fullscreen", "auto",
		Rect2i(0, 0, 800, 600))
	eq(tiny_fullscreen["size"], Vector2i(800, 600),
		"fullscreen is not clamped to the minimum window size")
	var windowed := SmaDisplay.resolve_display("windowed", "1920x1080",
		Rect2i(0, 0, 2560, 1600))
	eq(windowed["mode"], "windowed", "windowed mode is returned")
	eq(windowed["size"], Vector2i(1920, 1080), "windowed uses the preset size")
	eq(windowed["position"], Vector2i(320, 260),
		"windowed position is centred inside the usable area")
	var fallback := SmaDisplay.resolve_display("bogus", "bogus",
		Rect2i(0, 0, 1920, 1080))
	eq(fallback["mode"], "windowed", "invalid modes fall back to windowed")
	eq(fallback["size"], Vector2i(1728, 950),
		"invalid presets fall back to auto")
	eq(fallback["position"], Vector2i(96, 65),
		"fallback window is still centred")
