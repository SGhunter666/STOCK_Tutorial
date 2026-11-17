## Bilingual UI dictionary. Story text lives inline in story JSON; this service is
## only for interface labels, errors and toasts. Missing keys fall back to English,
## then to the key itself, so a missing translation never crashes the UI.
extends Node

signal locale_changed(locale: String)

const LOCALES := ["zh_CN", "en"]
const FALLBACK := "en"

var locale: String = "zh_CN"
var _dict: Dictionary = {}
var _fallback: Dictionary = {}


func _ready() -> void:
	_load_all()
	set_locale("zh_CN")


func _load_all() -> void:
	for code in LOCALES:
		var path := "res://locales/%s.json" % code
		var file := FileAccess.open(path, FileAccess.READ)
		if file == null:
			push_warning("I18n: missing locale file %s" % path)
			continue
		var parsed: Variant = JSON.parse_string(file.get_as_text())
		if typeof(parsed) != TYPE_DICTIONARY:
			push_warning("I18n: malformed locale file %s" % path)
			continue
		if code == FALLBACK:
			_fallback = parsed
		else:
			_dict[code] = parsed
	_dict[FALLBACK] = _fallback


func set_locale(next_locale: String) -> void:
	if not LOCALES.has(next_locale):
		next_locale = FALLBACK
	if locale == next_locale and _dict.has(next_locale):
		return
	locale = next_locale
	locale_changed.emit(locale)


func toggle() -> void:
	set_locale("en" if locale == "zh_CN" else "zh_CN")


func t(key: String, params: Dictionary = {}) -> String:
	var value := _lookup(locale, key)
	if value == "":
		value = _lookup(FALLBACK, key)
	if value == "":
		value = key
	for param in params.keys():
		value = value.replace("{%s}" % param, str(params[param]))
	return value


func _lookup(code: String, key: String) -> String:
	var table: Dictionary = _dict.get(code, {})
	var value: Variant = table.get(key, "")
	return String(value) if value != null else ""


## Resolves inline bilingual content from story files. Accepts a String key or a
## Dictionary of locale codes, and falls back to the first available translation.
func resolve(value: Variant) -> String:
	if value == null:
		return ""
	if typeof(value) == TYPE_DICTIONARY:
		var table: Dictionary = value
		if table.has(locale):
			return String(table[locale])
		if table.has(FALLBACK):
			return String(table[FALLBACK])
		for key in table.keys():
			return String(table[key])
		return ""
	return t(String(value))


func has_key(key: String) -> bool:
	return _lookup(locale, key) != "" or _lookup(FALLBACK, key) != ""
