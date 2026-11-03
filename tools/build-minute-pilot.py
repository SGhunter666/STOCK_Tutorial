#!/usr/bin/env python3
"""Build the local real-minute pilot dataset for the 2022-hikes scenario.

The raw Alpaca CSVs live under data/real/alpaca/2022-pilot and are ignored by
git. This script derives three files that the web app can load on demand:

  history.json                     raw daily bars, split metadata, minute index
  minute-manifest.json             per-symbol/month coverage and file pointers
  ticks/<SYM>/<SYM>_<YYYY-MM>.json eight completed-minute prices per trading day

No missing minute is filled or invented. A tick is only written when a
completed one-minute bar exists at or before that tick's clock time. Days with
no usable minute are left out so the replay engine can label them SIMULATED.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import os
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

NY = ZoneInfo("America/New_York")
TICK_TIMES = ["09:31", "10:31", "11:31", "12:31", "13:31", "14:31", "15:31", "16:00"]
TICK_MINUTES = [int(text[:2]) * 60 + int(text[3:]) for text in TICK_TIMES]
SESSION_START = 9 * 60 + 30
SESSION_END = 16 * 60
MONTH_PATTERN = "%Y-%m"


def read_daily(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows: dict[str, dict] = {}
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            try:
                stamp = datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00"))
                date = stamp.astimezone(NY).date().isoformat()
                open_ = float(row["open"])
                high = float(row["high"])
                low = float(row["low"])
                close = float(row["close"])
                volume = int(float(row["volume"]))
            except (KeyError, TypeError, ValueError):
                continue
            if not all(value > 0 for value in (open_, high, low, close)):
                continue
            if high < max(open_, low, close) or low > min(open_, high, close):
                continue
            if volume < 0:
                continue
            rows[date] = [date, open_, high, low, close, volume]
    return [rows[key] for key in sorted(rows)]


def read_minute_day(path: Path) -> dict[str, list[dict]]:
    """Parse a monthly 1Min csv.gz into New York regular-session bars."""
    days: dict[str, list[dict]] = defaultdict(list)
    if not path.exists():
        return days
    with gzip.open(path, "rt", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            try:
                stamp = datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00"))
                local = stamp.astimezone(NY)
                minutes = local.hour * 60 + local.minute
                open_ = float(row["open"])
                high = float(row["high"])
                low = float(row["low"])
                close = float(row["close"])
                volume = int(float(row["volume"]))
            except (KeyError, TypeError, ValueError):
                continue
            if minutes < SESSION_START or minutes >= SESSION_END:
                continue
            if not all(value > 0 for value in (open_, high, low, close)):
                continue
            if high < max(open_, low, close) or low > min(open_, high, close):
                continue
            if volume < 0:
                continue
            days[local.date().isoformat()].append({
                "minutes": minutes,
                "time": f"{local.hour:02d}:{local.minute:02d}",
                "timestamp": row["timestamp"],
                "open": open_,
                "high": high,
                "low": low,
                "close": close,
                "volume": volume,
            })
    for bars in days.values():
        bars.sort(key=lambda bar: bar["minutes"])
    return days


def build_ticks(day: list[dict]) -> list[dict]:
    """For each tick time take the close of the last fully completed minute."""
    ticks: list[dict] = []
    for index, tick_minute in enumerate(TICK_MINUTES):
        completed = [bar for bar in day if bar["minutes"] + 1 <= tick_minute]
        if not completed:
            continue
        bar = completed[-1]
        lag = tick_minute - (bar["minutes"] + 1)
        ticks.append({
            "t": TICK_TIMES[index],
            "mt": bar["time"],
            "p": round(bar["close"], 6),
            "v": bar["volume"],
            "lag": lag,
        })
    return ticks


def split_ratio_validity(bars: list[list], ex_date: str, ratio: float) -> tuple[bool, float]:
    before = [bar for bar in bars if bar[0] < ex_date]
    after = [bar for bar in bars if bar[0] >= ex_date]
    if not before or not after:
        return False, 0.0
    observed = before[-1][1] / after[0][1]
    return abs(observed / ratio - 1) <= 0.30, observed


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the real-minute pilot dataset")
    parser.add_argument("--root", default="data/real/alpaca/2022-pilot")
    parser.add_argument("--scenario", default="2022-hikes-minutes")
    parser.add_argument("--source-history", default="data/history/2022-hikes.json")
    parser.add_argument("--corporate-actions", default="")
    parser.add_argument("--symbols", required=True, help="comma separated symbols")
    parser.add_argument("--year", type=int, default=2022)
    parser.add_argument("--start", default="")
    parser.add_argument("--end", default="")
    args = parser.parse_args()
    year = args.year
    start = args.start or f"{year}-01-01"
    end = args.end or f"{year}-12-31"

    root = Path(args.root)
    symbols = [part.strip().upper() for part in args.symbols.split(",") if part.strip()]
    benchmark = "QQQ"
    if benchmark not in symbols:
        symbols.append(benchmark)
    metadata = {}
    source_path = Path(args.source_history)
    if source_path.exists():
        source = json.loads(source_path.read_text(encoding="utf-8"))
        metadata = {ticker["symbol"]: ticker for ticker in source.get("tickers", [])}

    corporate = []
    if args.corporate_actions:
        payload = json.loads(Path(args.corporate_actions).read_text(encoding="utf-8"))
        actions = payload.get("corporate_actions", payload)
        corporate = actions.get("forward_splits", []) + actions.get("reverse_splits", [])

    daily_by_symbol = {
        symbol: [bar for bar in read_daily(root / "sip/1Day/raw" / symbol / f"{symbol}_{year}.csv")
                 if start <= bar[0] <= end]
        for symbol in symbols
    }
    calendars = {symbol: {bar[0] for bar in bars} for symbol, bars in daily_by_symbol.items()}
    calendar = set.intersection(*calendars.values()) if calendars else set()
    calendar = sorted(date for date in calendar if start <= date <= end)
    if not calendar:
        print("error: no aligned daily bars found", file=sys.stderr)
        return 1

    months = sorted({date[:7] for date in calendar})
    tickers = []
    manifest_symbols = {}
    totals = {
        "minuteBars": 0, "tickEntries": 0, "symbolDays": 0,
        "fullSymbolDays": 0, "partialSymbolDays": 0, "simulatedSymbolDays": 0,
    }

    for symbol in symbols:
        bars = [bar for bar in daily_by_symbol[symbol] if bar[0] in set(calendar)]
        splits = []
        other_actions = []
        for action in corporate:
            if str(action.get("symbol", "")).upper() != symbol:
                continue
            exchange_date = str(action.get("ex_date", ""))
            old_rate = float(action.get("old_rate") or 0)
            new_rate = float(action.get("new_rate") or 0)
            if not exchange_date or old_rate <= 0 or new_rate <= 0:
                continue
            ratio = new_rate / old_rate
            valid, observed = split_ratio_validity(bars, exchange_date, ratio)
            record = {
                "date": exchange_date,
                "ratio": ratio,
                "from": old_rate,
                "to": new_rate,
                "validated": valid,
                "observedRatio": round(observed, 4),
            }
            if valid:
                splits.append(record)
            else:
                other_actions.append({**record, "reason": "priceRatioMismatch"})

        month_records = {}
        if symbol != benchmark:
            for month in months:
                minute_path = root / "sip/1Min/raw/regular_session" / symbol / f"{symbol}_{month}.csv.gz"
                if not minute_path.exists():
                    continue
                days = read_minute_day(minute_path)
                month_days = {}
                month_tick_entries = 0
                minute_bar_count = 0
                full_days = 0
                partial_days = 0
                for date in calendar:
                    if not date.startswith(month):
                        continue
                    day = days.get(date, [])
                    minute_bar_count += len(day)
                    ticks = build_ticks(day) if day else []
                    if not ticks:
                        continue
                    month_days[date] = ticks
                    month_tick_entries += len(ticks)
                    if len(ticks) == len(TICK_TIMES):
                        full_days += 1
                    else:
                        partial_days += 1
                if not month_days:
                    continue
                tick_rel = f"ticks/{symbol}/{symbol}_{month}.json"
                tick_path = root / tick_rel
                tick_path.parent.mkdir(parents=True, exist_ok=True)
                tick_path.write_text(json.dumps({
                    "symbol": symbol,
                    "month": month,
                    "tickTimes": TICK_TIMES,
                    "days": month_days,
                }, separators=(",", ":")), encoding="utf-8")
                month_records[month] = {
                    "file": tick_rel,
                    "minuteFile": str(minute_path.relative_to(root)).replace(os.sep, "/"),
                    "tickDays": len(month_days),
                    "fullDays": full_days,
                    "partialDays": partial_days,
                    "ticks": month_tick_entries,
                    "minuteBars": minute_bar_count,
                    "tickBytes": tick_path.stat().st_size,
                    "minuteBytes": minute_path.stat().st_size,
                }
                totals["minuteBars"] += minute_bar_count
                totals["tickEntries"] += month_tick_entries
                totals["symbolDays"] += len(month_days)
                totals["fullSymbolDays"] += full_days
                totals["partialSymbolDays"] += partial_days
        if symbol != benchmark:
            real_dates = sum(record["tickDays"] for record in month_records.values())
            totals["simulatedSymbolDays"] += max(0, len(calendar) - real_dates)

        base = metadata.get(symbol, {})
        ticker = {
            "symbol": symbol,
            "name": base.get("name") or symbol,
            "sector": base.get("sector") or "technology",
            "exchange": base.get("exchange") or "",
            "benchmark": symbol == benchmark,
            "bars": bars,
            "splits": splits,
            "otherActions": other_actions,
        }
        if base.get("pack"):
            ticker["pack"] = base["pack"]
        tickers.append(ticker)
        if month_records:
            manifest_symbols[symbol] = {
                "months": month_records,
                "minuteMonths": len(month_records),
                "minuteDays": sum(record["tickDays"] for record in month_records.values()),
                "minuteBars": sum(record["minuteBars"] for record in month_records.values()),
            }

    history = {
        "id": args.scenario,
        "source": "Alpaca Market Data API v2 (SIP), raw prices",
        "adjusted": False,
        "currency": "USD",
        "benchmark": benchmark,
        "start": calendar[0],
        "end": calendar[-1],
        "tickTimes": TICK_TIMES,
        "intraday": {
            "mode": "minute",
            "timezone": "America/New_York",
            "session": "09:30-16:00",
            "root": str(root).replace(os.sep, "/"),
            "manifest": f"{str(root).replace(os.sep, '/')}/minute-manifest.json",
            "tickTimes": TICK_TIMES,
            "tickMinutes": TICK_MINUTES,
        },
        "note": (
            "Raw prices with real one-minute bars. Ticks use only a completed minute at or before "
            "the tick clock time; no future data is read. Missing minutes are not filled."
        ),
        "tickers": tickers,
    }
    (root / "history.json").write_text(json.dumps(history, separators=(",", ":")), encoding="utf-8")

    manifest = {
        "version": 1,
        "scenario": args.scenario,
        "source": "Alpaca SIP 1Min raw",
        "adjustment": "raw",
        "timezone": "America/New_York",
        "session": {"open": "09:30", "close": "16:00"},
        "tickTimes": TICK_TIMES,
        "tickMinutes": TICK_MINUTES,
        "root": str(root).replace(os.sep, "/"),
        "history": f"{str(root).replace(os.sep, '/')}/history.json",
        "calendar": {"start": calendar[0], "end": calendar[-1], "days": len(calendar), "months": months},
        "symbols": manifest_symbols,
        "benchmark": benchmark,
        "summary": {
            "symbols": len(manifest_symbols),
            "tradingDays": len(calendar),
            "minuteMonths": len(months),
            **totals,
        },
        "note": (
            "Tick indexes are derived only from finished one-minute bars. Missing minutes are "
            "excluded, never fabricated. Raw CSVs are local-only and must not be committed."
        ),
        "license": "Personal/local research only. Public redistribution requires Alpaca permission.",
    }
    (root / "minute-manifest.json").write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")

    print(json.dumps({
        "scenario": args.scenario,
        "days": len(calendar),
        "symbols": len(manifest_symbols),
        "minuteBars": totals["minuteBars"],
        "tickEntries": totals["tickEntries"],
        "symbolDays": totals["symbolDays"],
        "fullSymbolDays": totals["fullSymbolDays"],
        "partialSymbolDays": totals["partialSymbolDays"],
        "simulatedSymbolDays": totals["simulatedSymbolDays"],
        "splits": {
            ticker["symbol"]: [split["date"] for split in ticker["splits"]]
            for ticker in tickers if ticker["splits"]
        },
        "otherActions": {
            ticker["symbol"]: [action["date"] for action in ticker["otherActions"]]
            for ticker in tickers if ticker["otherActions"]
        },
        "outputs": ["history.json", "minute-manifest.json", "ticks/*"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
