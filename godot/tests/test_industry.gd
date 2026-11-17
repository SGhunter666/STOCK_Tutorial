extends "res://tests/test_base.gd"


func run() -> void:
	describe("industry-sensitivity")
	var tech := SmaIndustry.sector_sensitivity("technology")
	approx(float(tech["growth"]), 1.0, 0.001, "technology growth sensitivity")
	approx(float(tech["rates"]), -1.2, 0.001, "technology rate sensitivity")
	var energy := SmaIndustry.sector_sensitivity("energy")
	approx(float(energy["energy"]), 1.3, 0.001, "energy sector exposure")
	var unknown := SmaIndustry.sector_sensitivity("unknown")
	approx(float(unknown["growth"]), 0.8, 0.001, "unknown sectors use the default")
	approx(float(unknown["rates"]), -0.5, 0.001, "default rate sensitivity")
	check(SmaIndustry.SECTOR_SENSITIVITY.size() >= 11, "all sectors are covered")
