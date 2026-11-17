extends "res://tests/test_base.gd"


func run() -> void:
	describe("calendar")
	eq(SmaCalendar.iso_date(0), "2026-01-05", "day 0 is Monday 2026-01-05")
	eq(SmaCalendar.weekday(0), 1, "day 0 weekday is Monday")
	eq(SmaCalendar.iso_date(4), "2026-01-09", "day 4 is Friday")
	eq(SmaCalendar.iso_date(5), "2026-01-12", "day 5 skips the weekend")
	eq(SmaCalendar.iso_date(10), "2026-01-19", "day 10 is the following Monday")
	eq(SmaCalendar.session_clock(0), "09:30:00", "session starts 09:30")
	eq(SmaCalendar.session_clock(3600), "10:30:00", "one hour into the session")
	eq(SmaCalendar.session_clock(23399), "15:59:59", "last simulated second")
	check(SmaCalendar.format_date(0, "zh_CN").contains("2026"), "zh date includes year")
	check(SmaCalendar.format_date(0, "en").contains("January"), "en date includes month")

	describe("format")
	eq(SmaFormat.money(1234567.891), "$1,234,567.89", "money grouping")
	eq(SmaFormat.money(-300.0), "-$300.00", "negative money puts the sign before the symbol")
	eq(SmaFormat.signed_money(300.0), "+$300.00", "positive signed money has a plus")
	eq(SmaFormat.signed_money(-300.0), "-$300.00", "negative signed money has a minus")
	eq(SmaFormat.num(-1234.5, 1), "-1,234.5", "negative grouping")
	eq(SmaFormat.pct(1.234), "+1.23%", "percentage sign")
	eq(SmaFormat.pct(0.0), "0.00%", "zero has no sign")
	eq(SmaFormat.pct(-0.001, 2), "0.00%", "rounded zero has no negative sign")
	eq(SmaFormat.pct(-0.0105, 1), "0.0%", "small negative percentage rounds to zero")
	eq(SmaFormat.compact(1500000.0), "1.50M", "compact millions")
	eq(SmaFormat.round_to(1.005, 2), 1.0, "round half away from binary noise")
