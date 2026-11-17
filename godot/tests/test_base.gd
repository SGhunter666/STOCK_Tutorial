extends RefCounted

## Minimal assertion harness. No third-party test plugin so the project stays
## dependency-free and runs with `godot --headless --script`.

var checks := 0
var failures: Array[String] = []
var _context := ""


func describe(text: String) -> void:
	_context = text


func check(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures.append(("[%s] " % _context if _context != "" else "") + message)


func eq(actual: Variant, expected: Variant, message: String) -> void:
	check(str(actual) == str(expected),
		"%s (expected=%s, actual=%s)" % [message, str(expected), str(actual)])


func approx(actual: float, expected: float, epsilon: float, message: String) -> void:
	check(absf(actual - expected) <= epsilon,
		"%s (expected=%.8f, actual=%.8f)" % [message, expected, actual])


func le(actual: float, limit: float, message: String) -> void:
	check(actual <= limit, "%s (actual=%.6f, limit=%.6f)" % [message, actual, limit])


func ge(actual: float, limit: float, message: String) -> void:
	check(actual >= limit, "%s (actual=%.6f, limit=%.6f)" % [message, actual, limit])


func run() -> void:
	pass
