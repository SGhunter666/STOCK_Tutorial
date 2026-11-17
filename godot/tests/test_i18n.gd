extends "res://tests/test_base.gd"

const ZH_PATH := "res://locales/zh_CN.json"
const EN_PATH := "res://locales/en.json"


func _load(path: String) -> Dictionary:
	var file := FileAccess.open(path, FileAccess.READ)
	check(file != null, "locale file exists: %s" % path)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	check(typeof(parsed) == TYPE_DICTIONARY, "locale file parses: %s" % path)
	return parsed if typeof(parsed) == TYPE_DICTIONARY else {}


func run() -> void:
	describe("i18n-parity")
	var zh := _load(ZH_PATH)
	var en := _load(EN_PATH)
	var missing_in_en: Array[String] = []
	var missing_in_zh: Array[String] = []
	for key in zh.keys():
		if not en.has(key):
			missing_in_en.append(String(key))
	for key in en.keys():
		if not zh.has(key):
			missing_in_zh.append(String(key))
	check(missing_in_en.is_empty(), "keys missing in English: %s" % str(missing_in_en))
	check(missing_in_zh.is_empty(), "keys missing in Chinese: %s" % str(missing_in_zh))
	ge(float(zh.size()), 100.0, "dictionary covers the whole interface")

	describe("i18n-content")
	for key in zh.keys():
		check(str(zh[key]) != "", "zh value is not empty: %s" % key)
	for key in en.keys():
		check(str(en[key]) != "", "en value is not empty: %s" % key)
	check(zh.has("error.order.insufficientMargin"), "error keys are present")
	check(zh.has("sector.technology"), "sector keys are present")
	check(zh.has("story.seen"), "story keys are present")
