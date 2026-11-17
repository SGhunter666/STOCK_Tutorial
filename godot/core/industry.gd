## Sector macro sensitivities used by the company card. Positive growth and
## risk values mean the sector tends to rise with the channel; negative rates
## values mean it tends to fall when rates rise.
class_name SmaIndustry
extends RefCounted

const DEFAULT_SENSITIVITY := {"growth": 0.8, "rates": -0.5, "energy": -0.2, "risk": 0.6}

const SECTOR_SENSITIVITY := {
	"technology": {"growth": 1.0, "rates": -1.2, "energy": -0.25, "risk": 1.1},
	"communication": {"growth": 0.8, "rates": -1.0, "energy": -0.2, "risk": 1.0},
	"consumer": {"growth": 1.1, "rates": -0.45, "energy": -1.0, "risk": 0.8},
	"financials": {"growth": 0.9, "rates": 0.4, "energy": 0.0, "risk": 0.9},
	"healthcare": {"growth": 0.5, "rates": -0.35, "energy": -0.25, "risk": 0.5},
	"energy": {"growth": 0.7, "rates": -0.25, "energy": 1.3, "risk": 0.8},
	"industrials": {"growth": 1.2, "rates": -0.45, "energy": -0.65, "risk": 0.9},
	"utilities": {"growth": 0.25, "rates": -0.9, "energy": -0.5, "risk": 0.35},
	"materials": {"growth": 0.95, "rates": -0.3, "energy": 0.35, "risk": 0.7},
	"realestate": {"growth": 0.7, "rates": -1.3, "energy": -0.15, "risk": 0.6},
	"telecom": {"growth": 0.4, "rates": -0.65, "energy": -0.3, "risk": 0.45},
}


static func sector_sensitivity(sector: String) -> Dictionary:
	return SECTOR_SENSITIVITY.get(sector, DEFAULT_SENSITIVITY)
