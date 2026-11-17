extends SceneTree

## Headless test entry point:
##   godot --headless --path godot --script res://tests/run_tests.gd

const SUITES := [
	"res://tests/test_rng.gd",
	"res://tests/test_calendar.gd",
	"res://tests/test_catalog.gd",
	"res://tests/test_order_book.gd",
	"res://tests/test_exchange.gd",
	"res://tests/test_save.gd",
	"res://tests/test_narrative.gd",
	"res://tests/test_academy.gd",
	"res://tests/test_options.gd",
	"res://tests/test_futures.gd",
	"res://tests/test_multiasset.gd",
	"res://tests/test_etf.gd",
	"res://tests/test_challenges.gd",
	"res://tests/test_tax.gd",
	"res://tests/test_career.gd",
	"res://tests/test_fund.gd",
	"res://tests/test_quant.gd",
	"res://tests/test_corporate.gd",
	"res://tests/test_fundamentals.gd",
	"res://tests/test_review.gd",
	"res://tests/test_optimizer.gd",
	"res://tests/test_replay.gd",
	"res://tests/test_theme.gd",
	"res://tests/test_market_intel.gd",
	"res://tests/test_history.gd",
	"res://tests/test_i18n.gd",
]


func _init() -> void:
	var total_checks := 0
	var failures: Array[String] = []
	for path in SUITES:
		var script: Script = load(path)
		if script == null:
			failures.append("%s: failed to load suite" % path)
			continue
		var suite = script.new()
		suite.run()
		total_checks += int(suite.checks)
		for failure in suite.failures:
			failures.append("%s :: %s" % [path.get_file(), failure])
	if failures.is_empty():
		print("ALL TESTS PASSED (%d checks)" % total_checks)
		quit(0)
	else:
		for failure in failures:
			printerr("FAIL: ", failure)
		print("TESTS FAILED (%d checks, %d failures)" % [total_checks, failures.size()])
		quit(1)
