## Trading calendar and session clock. Day 0 is Monday 2026-01-05; weekends are
## skipped. All display strings are derived, never stored in the save.
class_name SmaCalendar
extends RefCounted

const BASE_UNIX := 1767571200  # 2026-01-05T00:00:00Z
const SECONDS_PER_DAY := 86400
const SESSION_SECONDS := 23400  # 09:30:00 .. 16:00:00
const QUARTER_DAYS := 63

const MONTHS_ZH := ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"]
const MONTHS_EN := ["January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December"]
const WEEKDAYS_ZH := ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
const WEEKDAYS_EN := ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


static func date_for_trading_day(day_index: int) -> Dictionary:
	var safe := int(day_index)
	var weeks := int(floor(float(safe) / 5.0))
	var rest := safe - weeks * 5
	var unix := BASE_UNIX + weeks * 7 * SECONDS_PER_DAY + rest * SECONDS_PER_DAY
	return Time.get_datetime_dict_from_unix_time(unix)


static func iso_date(day_index: int) -> String:
	var date := date_for_trading_day(day_index)
	return "%04d-%02d-%02d" % [date["year"], date["month"], date["day"]]


static func weekday(day_index: int) -> int:
	return int(date_for_trading_day(day_index)["weekday"])


static func format_date(day_index: int, locale: String = "zh_CN") -> String:
	var date := date_for_trading_day(day_index)
	var weekday_index := int(date["weekday"])
	if locale.begins_with("zh"):
		return "%d年%s%d日 %s" % [date["year"], MONTHS_ZH[int(date["month"]) - 1],
			date["day"], WEEKDAYS_ZH[weekday_index]]
	return "%s %d, %d %s" % [MONTHS_EN[int(date["month"]) - 1], date["day"],
		date["year"], WEEKDAYS_EN[weekday_index]]


static func format_date_short(day_index: int, locale: String = "zh_CN") -> String:
	var date := date_for_trading_day(day_index)
	if locale.begins_with("zh"):
		return "%d月%d日" % [date["month"], date["day"]]
	return "%s %d" % [MONTHS_EN[int(date["month"]) - 1].substr(0, 3), date["day"]]


static func session_clock(second: int) -> String:
	var clamped := clampi(second, 0, SESSION_SECONDS - 1)
	var total := 9 * 3600 + 30 * 60 + clamped
	return "%02d:%02d:%02d" % [int(total / 3600.0), int(total % 3600 / 60.0), total % 60]


static func week_key(day_index: int) -> String:
	var weeks := int(floor(float(day_index) / 5.0))
	var unix := BASE_UNIX + weeks * 7 * SECONDS_PER_DAY
	var date := Time.get_datetime_dict_from_unix_time(unix)
	return "%04d-%02d-%02d" % [date["year"], date["month"], date["day"]]


static func month_key(day_index: int) -> String:
	return iso_date(day_index).substr(0, 7)
