#!/usr/bin/env python3
"""Build the History Lab's raw Alpaca daily dataset.

Reads the CSV files downloaded by stock_history_downloader.py under
data/real/alpaca/long-2016-2026 and writes a single JSON with the same shape
as the existing History Lab snapshots. Prices stay raw (unadjusted) and true
splits are exposed per ticker; spin-off adjustments are listed separately and
never applied as share-count changes.

Usage:
    python3 tools/build-real-history.py
Output:
    data/real/alpaca/long-2016-2026/history.json (ignored by git)
"""
import csv
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data' / 'real' / 'alpaca' / 'long-2016-2026'
CSV_ROOT = DATA / 'sip' / '1Day' / 'raw'
ACTIONS = DATA / 'corporate-actions.json'
METADATA = ROOT / 'data' / 'history' / '2015-long.json'
OUT = DATA / 'history.json'


def load_metadata():
    data = json.loads(METADATA.read_text(encoding='utf-8'))
    return {entry['symbol']: entry for entry in data['tickers']}


def read_symbol(symbol):
    rows = []
    for path in sorted((CSV_ROOT / symbol).glob(f'{symbol}_*.csv')):
        with path.open(newline='', encoding='utf-8') as handle:
            for row in csv.DictReader(handle):
                try:
                    open_price = float(row['open'])
                    high = float(row['high'])
                    low = float(row['low'])
                    close = float(row['close'])
                    volume = int(float(row['volume']))
                except (KeyError, TypeError, ValueError):
                    continue
                if min(open_price, high, low, close) <= 0 or volume < 0:
                    continue
                high = max(high, open_price, low, close)
                low = min(low, open_price, high, close)
                rows.append([
                    row['timestamp'][:10],
                    round(open_price, 2),
                    round(high, 2),
                    round(low, 2),
                    round(close, 2),
                    volume,
                ])
    rows.sort(key=lambda item: item[0])
    deduped = []
    for row in rows:
        if deduped and deduped[-1][0] == row[0]:
            deduped[-1] = row
        else:
            deduped.append(row)
    return deduped


def is_true_split(action):
    new = int(action['new_rate'])
    old = int(action['old_rate'])
    return (new % old == 0) or (old % new == 0)


def load_actions():
    data = json.loads(ACTIONS.read_text(encoding='utf-8'))
    splits = {}
    other = {}
    for kind, rows in data.get('corporate_actions', {}).items():
        for action in rows:
            symbol = action['symbol']
            entry = {
                'date': action['ex_date'],
                'ratio': int(action['new_rate']) / int(action['old_rate']),
                'newRate': int(action['new_rate']),
                'oldRate': int(action['old_rate']),
                'type': kind.replace('_splits', ''),
            }
            target = splits if is_true_split(action) else other
            target.setdefault(symbol, []).append(entry)
    for target in (splits, other):
        for rows in target.values():
            rows.sort(key=lambda item: item['date'])
    return splits, other


def split_matches_price(symbol, action, series):
    """A true split must be visible as a matching price jump in the raw bars.

    Alpaca's corporate-actions feed also contains spin-off / when-issued
    adjustments with small non-integer ratios, and occasionally an action that
    never reached the raw price series. Applying those would create a fake
    position gain, so they stay in ``otherActions`` for transparency.
    """
    bars = series.get(symbol) or []
    index = next((i for i, row in enumerate(bars) if row[0] >= action['date']), None)
    if index is None or index == 0:
        return True
    before = bars[index - 1][4]
    after = bars[index][4]
    if not after:
        return False
    observed = before / after
    return abs(observed / action['ratio'] - 1) <= 0.30


def main():
    metadata = load_metadata()
    splits, other_actions = load_actions()
    symbols = list(metadata.keys())
    series = {symbol: read_symbol(symbol) for symbol in symbols}
    empty = [symbol for symbol, rows in series.items() if not rows]
    if empty:
        raise SystemExit(f'Missing daily data for: {", ".join(empty)}')

    # Keep only splits that are visible in the raw price series.
    for symbol in list(splits.keys()):
        kept = []
        for action in splits[symbol]:
            if split_matches_price(symbol, action, series):
                kept.append(action)
            else:
                other_actions.setdefault(symbol, []).append({
                    **action,
                    'reason': 'priceRatioMismatch',
                })
        if kept:
            splits[symbol] = kept
        else:
            del splits[symbol]

    # QQQ is the benchmark and normally defines the trading calendar.
    benchmark = 'QQQ'
    calendar = [row[0] for row in series.get(benchmark) or max(series.values(), key=len)]
    calendar_set = set(calendar)
    calendar_start, calendar_end = calendar[0], calendar[-1]

    tickers = []
    filled_total = 0
    for symbol in symbols:
        source = metadata[symbol]
        rows = series[symbol]
        by_date = {row[0]: row for row in rows if row[0] in calendar_set}
        bars = []
        filled = []
        previous = None
        for date in calendar:
            row = by_date.get(date)
            if row:
                bars.append(row)
                previous = row
            elif previous:
                bars.append([date, previous[4], previous[4], previous[4], previous[4], 0])
                filled.append(date)
                filled_total += 1
            else:
                bars.append([date, 0, 0, 0, 0, 0])
                filled.append(date)
                filled_total += 1
        ticker = {
            'symbol': symbol,
            'name': source['name'],
            'sector': source['sector'],
            'exchange': source.get('exchange', ''),
            'benchmark': bool(source.get('benchmark')),
            'bars': bars,
        }
        if splits.get(symbol):
            ticker['splits'] = splits[symbol]
        if other_actions.get(symbol):
            ticker['otherActions'] = other_actions[symbol]
        if filled:
            ticker['filled'] = filled
        tickers.append(ticker)

    payload = {
        'id': 'real-2016-2026',
        'source': 'Alpaca Market Data API v2 (SIP)',
        'adjusted': False,
        'currency': 'USD',
        'benchmark': benchmark,
        'start': calendar_start,
        'end': calendar_end,
        'fetchedAt': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        'note': ('Raw SIP daily bars. Actual traded prices, not split/dividend adjusted. '
                 'True splits are listed per ticker; spin-offs and dividends are not applied. '
                 'Local educational snapshot, not a licensed redistribution feed.'),
        'tickers': tickers,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{OUT.relative_to(ROOT)}: {len(tickers)} tickers, {len(calendar)} bars '
          f'({calendar_start} → {calendar_end}), filled {filled_total}, '
          f'{OUT.stat().st_size / 1024 / 1024:.2f} MB')
    for ticker in tickers:
        if ticker.get('splits'):
            print(f"  {ticker['symbol']}: " + ', '.join(
                f"{item['date']} {item['newRate']}:{item['oldRate']}" for item in ticker['splits']
            ))


if __name__ == '__main__':
    main()
