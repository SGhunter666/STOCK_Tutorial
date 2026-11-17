## Loads and validates the fictional universe. The catalog is the single source of
## company identity; save files only store mutable market state keyed by ticker.
class_name SmaCompanyCatalog
extends RefCounted

const CATALOG_PATH := "res://data/companies.json"
const EXPECTED_COUNT := 50
const EXPECTED_REFERENCES := 20
const EXPECTED_ORIGINALS := 30

static var _cache: Dictionary = {}


static func load_companies() -> Dictionary:
	if not _cache.is_empty():
		return _cache
	var file := FileAccess.open(CATALOG_PATH, FileAccess.READ)
	if file == null:
		push_error("SmaCompanyCatalog: cannot open %s" % CATALOG_PATH)
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY or not parsed.has("companies"):
		push_error("SmaCompanyCatalog: malformed catalog")
		return {}
	var result := {}
	var references := 0
	var originals := 0
	for company in parsed["companies"]:
		if typeof(company) != TYPE_DICTIONARY:
			push_error("SmaCompanyCatalog: company entry is not an object")
			return {}
		var ticker := String(company.get("ticker", ""))
		if ticker.length() != 4:
			push_error("SmaCompanyCatalog: invalid ticker %s" % ticker)
			return {}
		if result.has(ticker):
			push_error("SmaCompanyCatalog: duplicate ticker %s" % ticker)
			return {}
		if float(company.get("price", 0.0)) <= 0.0:
			push_error("SmaCompanyCatalog: invalid price for %s" % ticker)
			return {}
		if not company.has("financials") or not company.has("sector"):
			push_error("SmaCompanyCatalog: missing fields for %s" % ticker)
			return {}
		if String(company.get("origin", "")) == "reference":
			references += 1
		else:
			originals += 1
		result[ticker] = company
	if result.size() != EXPECTED_COUNT or references != EXPECTED_REFERENCES or originals != EXPECTED_ORIGINALS:
		push_error("SmaCompanyCatalog: universe mix is invalid (%d companies, %d refs, %d originals)"
			% [result.size(), references, originals])
		return {}
	_cache = result
	return _cache


static func sectors() -> Array:
	var seen := {}
	for company in load_companies().values():
		seen[String(company["sector"])] = true
	var list := seen.keys()
	list.sort()
	return list


static func get_company(ticker: String) -> Dictionary:
	return load_companies().get(ticker.to_upper(), {})
