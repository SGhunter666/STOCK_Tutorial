## Runtime theme and layout switches.
extends "res://tests/test_base.gd"


func run() -> void:
	describe("theme-light")
	SmaUiTheme.set_theme_mode("light")
	eq(SmaUiTheme.mode, "light", "light mode selected")
	check(SmaUiTheme.BG.r > 0.8, "light background is bright")
	check(SmaUiTheme.TEXT.r < 0.3, "light text is dark")
	check(SmaUiTheme.ACCENT_DARK.v > 0.0, "accent remains defined")
	check(SmaUiTheme.INFO.b > 0.5 and SmaUiTheme.INFO.r < 0.3,
		"info colour keeps contrast on light panels")

	describe("theme-dark")
	SmaUiTheme.set_theme_mode("dark")
	eq(SmaUiTheme.mode, "dark", "dark mode restored")
	check(SmaUiTheme.BG.r < 0.2, "dark background is dark")
	check(SmaUiTheme.TEXT.r > 0.8, "dark text is bright")

	describe("theme-invalid")
	SmaUiTheme.set_theme_mode("unknown")
	eq(SmaUiTheme.mode, "dark", "unknown theme falls back to dark")

	describe("layout-density")
	SmaUiTheme.set_density(0.88)
	approx(SmaUiTheme.density, 0.88, 0.001, "advanced density applied")
	SmaUiTheme.set_density(9.0)
	approx(SmaUiTheme.density, 1.0, 0.001, "density is clamped")
