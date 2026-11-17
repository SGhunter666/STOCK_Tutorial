## Deterministic quarterly report model for the simulated companies. The catalog
## stores one annual filing per issuer; this module derives a stable quarterly
## history from it with a seeded seasonal pattern so the statement page can offer
## real quarter selection without inventing random live data.
class_name SmaFundamentals
extends RefCounted

const QUARTER_DAYS := 63
const REPORT_LAG_DAYS := 14
const FIRST_QUARTER := -8
const MAX_QUARTER := 40
const TAX_RATE := 0.21
const INTEREST_RATE := 0.04
const SEASONAL := [0.96, 0.99, 1.02, 1.03]


static func latest_quarter(day: int) -> int:
	var quarter := int(floor(float(day - REPORT_LAG_DAYS) / float(QUARTER_DAYS))) - 1
	return clampi(quarter, FIRST_QUARTER, MAX_QUARTER)


static func quarter_end_day(quarter: int) -> int:
	return quarter * QUARTER_DAYS + QUARTER_DAYS - 1


static func report_day(quarter: int) -> int:
	return (quarter + 1) * QUARTER_DAYS + REPORT_LAG_DAYS


static func _round2(value: float) -> float:
	return SmaFormat.round_to(value, 2)


static func _period_label(quarter: int) -> String:
	var date := SmaCalendar.date_for_trading_day(quarter_end_day(quarter))
	var month := int(date["month"])
	var q := int(floor(float(month - 1) / 3.0)) + 1
	return "%d Q%d" % [int(date["year"]), q]


static func split_factor_through(ticker: String, day: int) -> float:
	var factor := 1.0
	for entry in SmaCorporate.SPLITS.get(ticker, []):
		if int(entry["quarter"]) * QUARTER_DAYS <= day:
			factor *= float(entry["ratio"])
	return factor


static func report(ticker: String, quarter: int) -> Dictionary:
	var company := SmaCompanyCatalog.get_company(ticker)
	if company.is_empty():
		return {}
	var financials: Dictionary = company.get("financials", {})
	var shares := maxf(1.0, float(company.get("sharesOutstanding",
		company.get("shares", 1.0))))
	var annual_revenue := float(financials.get("revenue", 0.0))
	var annual_gross := float(financials.get("grossProfit", 0.0))
	var annual_operating := float(financials.get("operatingIncome", 0.0))
	var annual_net := float(financials.get("netIncome", 0.0))
	var assets := float(financials.get("totalAssets", 0.0))
	var liabilities := float(financials.get("totalLiabilities", 0.0))
	var debt := float(financials.get("debt", 0.0))
	var cash := float(financials.get("cash", 0.0))
	var capex := absf(float(financials.get("capex", 0.0)))
	var rng := SmaRng.new("fundamentals:%s:%d" % [ticker, quarter])
	var season := float(SEASONAL[posmod(quarter, SEASONAL.size())])
	var cycle := 1.0 + 0.035 * sin(float(quarter) * 0.8 + float(abs(hash(ticker)) % 628) / 100.0)
	var revenue := annual_revenue / 4.0 * season * cycle \
		* (1.0 + rng.normal() * 0.012)
	var gross_margin := annual_gross / annual_revenue if annual_revenue > 0.0 else 0.0
	gross_margin = clampf(gross_margin + rng.normal() * 0.006, 0.02, 0.95)
	var gross_profit := revenue * gross_margin
	var operating_margin := annual_operating / annual_revenue if annual_revenue > 0.0 else 0.0
	operating_margin = clampf(operating_margin + rng.normal() * 0.005, -0.2, 0.7)
	var operating_income := revenue * operating_margin
	var operating_expenses := maxf(0.0, gross_profit - operating_income)
	var interest_expense := debt * INTEREST_RATE / 4.0
	var pretax := operating_income - interest_expense
	var tax_expense := maxf(0.0, pretax * TAX_RATE)
	var net_income := pretax - tax_expense
	var eps := net_income / shares
	var annual_dividend := float(financials.get("dividendPerShare", 0.0))
	var quarterly_dividend := annual_dividend / 4.0
	var dividends_paid := quarterly_dividend * shares
	var revenue_scale := revenue / maxf(1.0, annual_revenue / 4.0)
	var cash_balance := cash * clampf(0.85 + rng.next() * 0.3, 0.7, 1.2) * revenue_scale
	var receivables := revenue * clampf(0.12 + rng.next() * 0.08, 0.1, 0.2)
	var inventory := (revenue - gross_profit) * clampf(0.2 + rng.next() * 0.15, 0.15, 0.35)
	var ppe := maxf(0.0, assets - cash_balance - receivables - inventory)
	var total_assets := cash_balance + receivables + inventory + ppe
	var other_liabilities := maxf(0.0, liabilities - debt)
	var total_liabilities := debt + other_liabilities
	var equity := total_assets - total_liabilities
	var depreciation := ppe * 0.02
	var working_capital := (receivables + inventory) * (rng.next() - 0.5) * 0.1
	var operating_cash := net_income + depreciation - working_capital
	var quarter_capex := -capex / 4.0
	var investing_cash := quarter_capex + (rng.next() - 0.5) * revenue * 0.01
	var debt_issuance := (rng.next() - 0.5) * debt * 0.02
	var financing_cash := debt_issuance - dividends_paid
	var net_change := operating_cash + investing_cash + financing_cash
	var free_cash := operating_cash + quarter_capex
	var split_factor := split_factor_through(ticker, report_day(quarter))
	return {
		"ticker": ticker,
		"quarter": quarter,
		"periodLabel": _period_label(quarter),
		"reportDate": SmaCalendar.iso_date(report_day(quarter)),
		"splitFactor": split_factor,
		"income": {
			"revenue": _round2(revenue),
			"cogs": _round2(revenue - gross_profit),
			"grossProfit": _round2(gross_profit),
			"operatingExpenses": _round2(operating_expenses),
			"operatingIncome": _round2(operating_income),
			"interestExpense": _round2(interest_expense),
			"pretaxIncome": _round2(pretax),
			"taxExpense": _round2(tax_expense),
			"netIncome": _round2(net_income),
			"eps": SmaFormat.round_to(eps, 4),
			"sharesOutstanding": shares,
			"dividendsPaid": _round2(dividends_paid),
		},
		"balance": {
			"cash": _round2(cash_balance),
			"receivables": _round2(receivables),
			"inventory": _round2(inventory),
			"ppe": _round2(ppe),
			"totalAssets": _round2(total_assets),
			"debt": _round2(debt),
			"otherLiabilities": _round2(other_liabilities),
			"totalLiabilities": _round2(total_liabilities),
			"equity": _round2(equity),
		},
		"cashFlow": {
			"operatingCashFlow": _round2(operating_cash),
			"capex": _round2(quarter_capex),
			"investingCashFlow": _round2(investing_cash),
			"financingCashFlow": _round2(financing_cash),
			"debtIssuance": _round2(debt_issuance),
			"dividendsPaid": _round2(dividends_paid),
			"netChange": _round2(net_change),
			"freeCashFlow": _round2(free_cash),
		},
		"ratios": {
			"grossMargin": gross_margin,
			"operatingMargin": operating_margin,
			"netMargin": net_income / revenue if revenue > 0.0 else 0.0,
			"roe": net_income / equity if equity > 0.0 else 0.0,
			"debtToEquity": debt / equity if equity > 0.0 else 0.0,
			"bookValuePerShare": equity / shares,
			"annualDividendPerShare": annual_dividend,
			"quarterlyDividendPerShare": quarterly_dividend,
		},
	}


static func history(ticker: String, count: int = 8, day: int = 0) -> Array:
	var latest := latest_quarter(day)
	var reports: Array = []
	for index in maxi(1, count):
		var quarter := latest - index
		var entry := report(ticker, quarter)
		if not entry.is_empty():
			reports.append(entry)
	return reports
