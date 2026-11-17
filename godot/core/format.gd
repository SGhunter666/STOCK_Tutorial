## Number and money formatting shared by the UI. Money is always virtual USD;
## the locale only changes grouping and labels, never the currency.
class_name SmaFormat
extends RefCounted


const _FACTORS := [1.0, 10.0, 100.0, 1000.0, 10000.0, 100000.0]


static func round_to(value: float, digits: int = 2) -> float:
	var factor: float
	if digits >= 0 and digits < _FACTORS.size():
		factor = _FACTORS[digits]
	else:
		factor = pow(10.0, digits)
	return roundf(value * factor) / factor


static func _fixed(value: float, digits: int) -> String:
	var format := "%." + str(digits) + "f"
	return format % value


static func group_digits(text: String, separator: String = ",") -> String:
	var negative := text.begins_with("-")
	var body := text.trim_prefix("-")
	var parts := body.split(".")
	var integer_part: String = parts[0]
	var grouped := ""
	var count := 0
	for index in range(integer_part.length() - 1, -1, -1):
		grouped = integer_part[index] + grouped
		count += 1
		if count % 3 == 0 and index > 0:
			grouped = separator + grouped
	var result := grouped
	if parts.size() > 1:
		result += "." + parts[1]
	return ("-" if negative else "") + result


static func num(value: float, digits: int = 2) -> String:
	if not is_finite(value):
		return "—"
	return group_digits(_fixed(value, digits))


static func money(value: float, digits: int = 2) -> String:
	if not is_finite(value):
		return "—"
	var prefix := "-" if value < 0.0 else ""
	return prefix + "$" + num(absf(value), digits)


static func signed_money(value: float, digits: int = 2) -> String:
	var prefix := "+" if value > 0.0 else ""
	return prefix + money(value, digits)


static func pct(value: float, digits: int = 2) -> String:
	if not is_finite(value):
		return "—"
	var rounded := round_to(value, digits)
	if rounded == 0.0:
		rounded = absf(rounded)
	var prefix := "+" if rounded > 0.0 else ""
	return prefix + _fixed(rounded, digits) + "%"


## Percent level without a leading plus sign, for ratios, weights and drawdowns.
static func pct_plain(value: float, digits: int = 2) -> String:
	if not is_finite(value):
		return "—"
	var rounded := round_to(absf(value), digits)
	return _fixed(rounded, digits) + "%"


static func compact(value: float) -> String:
	var absolute := absf(value)
	if absolute >= 1_000_000_000.0:
		return _fixed(value / 1_000_000_000.0, 2) + "B"
	if absolute >= 1_000_000.0:
		return _fixed(value / 1_000_000.0, 2) + "M"
	if absolute >= 1_000.0:
		return _fixed(value / 1_000.0, 1) + "K"
	return _fixed(value, 0)


static func quantity(value: float) -> String:
	if is_equal_approx(value, roundf(value)):
		return group_digits(_fixed(value, 0))
	return group_digits(_fixed(value, 4))
