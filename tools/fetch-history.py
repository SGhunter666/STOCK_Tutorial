#!/usr/bin/env python3
"""Download real daily historical bars for the Historical Replay Lab.

Source: Yahoo Finance chart API (unofficial public endpoint).
All OHLC prices are adjusted for splits and dividends so that returns are
continuous; volume is raw. This snapshot is for local education, not a licensed
market-data feed.

Usage:
    python3 tools/fetch-history.py [all|legacy|sectors]
Output:
    data/history/2008-crisis.json
    data/history/2015-long.json
    data/history/2020-covid.json
    data/history/2022-hikes.json
"""
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'data' / 'history'
CACHE_PATH = ROOT / 'tools' / '.sector-cache.json'
UA = 'Mozilla/5.0'

SCENARIOS = {
    '2008-crisis': {
        'start': '2007-07-01',
        'end': '2009-07-01',
        'benchmark': 'QQQ',
        'tickers': [
            {'symbol': 'AAPL', 'name': 'Apple Inc.', 'sector': 'technology'},
            {'symbol': 'MSFT', 'name': 'Microsoft Corp.', 'sector': 'technology'},
            {'symbol': 'INTC', 'name': 'Intel Corp.', 'sector': 'technology'},
            {'symbol': 'CSCO', 'name': 'Cisco Systems', 'sector': 'technology'},
            {'symbol': 'QCOM', 'name': 'Qualcomm Inc.', 'sector': 'technology'},
            {'symbol': 'AMZN', 'name': 'Amazon.com Inc.', 'sector': 'discretionary'},
            {'symbol': 'GOOGL', 'name': 'Alphabet Inc.', 'sector': 'technology'},
            {'symbol': 'COST', 'name': 'Costco Wholesale', 'sector': 'staples'},
            {'symbol': 'AMGN', 'name': 'Amgen Inc.', 'sector': 'healthcare'},
            {'symbol': 'NDAQ', 'name': 'Nasdaq Inc.', 'sector': 'financials'},
            {'symbol': 'ADBE', 'name': 'Adobe Inc.', 'sector': 'technology'},
            {'symbol': 'QQQ', 'name': 'Invesco QQQ Trust (benchmark)', 'sector': 'technology', 'benchmark': True},
        ],
    },
    '2015-long': {
        'start': '2015-01-01',
        'end': '2026-10-31',
        'benchmark': 'QQQ',
        'tickers': [
            {'symbol': 'AAPL', 'name': 'Apple Inc.', 'sector': 'technology'},
            {'symbol': 'MSFT', 'name': 'Microsoft Corp.', 'sector': 'technology'},
            {'symbol': 'NVDA', 'name': 'NVIDIA Corp.', 'sector': 'technology'},
            {'symbol': 'AMZN', 'name': 'Amazon.com Inc.', 'sector': 'discretionary'},
            {'symbol': 'GOOGL', 'name': 'Alphabet Inc.', 'sector': 'technology'},
            {'symbol': 'META', 'name': 'Meta Platforms', 'sector': 'technology'},
            {'symbol': 'TSLA', 'name': 'Tesla Inc.', 'sector': 'discretionary'},
            {'symbol': 'AVGO', 'name': 'Broadcom Inc.', 'sector': 'technology'},
            {'symbol': 'COST', 'name': 'Costco Wholesale', 'sector': 'staples'},
            {'symbol': 'NFLX', 'name': 'Netflix Inc.', 'sector': 'discretionary'},
            {'symbol': 'AMD', 'name': 'Advanced Micro Devices', 'sector': 'technology'},
            {'symbol': 'ADBE', 'name': 'Adobe Inc.', 'sector': 'technology'},
            {'symbol': 'QCOM', 'name': 'Qualcomm Inc.', 'sector': 'technology'},
            {'symbol': 'PEP', 'name': 'PepsiCo Inc.', 'sector': 'staples'},
            {'symbol': 'AMGN', 'name': 'Amgen Inc.', 'sector': 'healthcare'},
            {'symbol': 'QQQ', 'name': 'Invesco QQQ Trust (benchmark)', 'sector': 'technology', 'benchmark': True},
        ],
    },
}


FETCH_START = '2019-12-01'
FETCH_END = '2023-01-31'

SECTOR_TICKERS = [
    # Semiconductors
    {'symbol': 'NVDA', 'name': 'NVIDIA Corp.', 'sector': 'technology', 'pack': 'semiconductors'},
    {'symbol': 'AVGO', 'name': 'Broadcom Inc.', 'sector': 'technology', 'pack': 'semiconductors'},
    {'symbol': 'AMD', 'name': 'Advanced Micro Devices', 'sector': 'technology', 'pack': 'semiconductors'},
    {'symbol': 'QCOM', 'name': 'Qualcomm Inc.', 'sector': 'technology', 'pack': 'semiconductors'},
    {'symbol': 'TXN', 'name': 'Texas Instruments', 'sector': 'technology', 'pack': 'semiconductors'},
    {'symbol': 'AMAT', 'name': 'Applied Materials', 'sector': 'technology', 'pack': 'semiconductors'},
    {'symbol': 'LRCX', 'name': 'Lam Research', 'sector': 'technology', 'pack': 'semiconductors'},
    {'symbol': 'KLAC', 'name': 'KLA Corp.', 'sector': 'technology', 'pack': 'semiconductors'},
    {'symbol': 'MU', 'name': 'Micron Technology', 'sector': 'technology', 'pack': 'semiconductors'},
    {'symbol': 'ADI', 'name': 'Analog Devices', 'sector': 'technology', 'pack': 'semiconductors'},
    {'symbol': 'INTC', 'name': 'Intel Corp.', 'sector': 'technology', 'pack': 'semiconductors'},
    # Software
    {'symbol': 'MSFT', 'name': 'Microsoft Corp.', 'sector': 'technology', 'pack': 'software'},
    {'symbol': 'ADBE', 'name': 'Adobe Inc.', 'sector': 'technology', 'pack': 'software'},
    {'symbol': 'CRM', 'name': 'Salesforce Inc.', 'sector': 'technology', 'pack': 'software'},
    {'symbol': 'INTU', 'name': 'Intuit Inc.', 'sector': 'technology', 'pack': 'software'},
    {'symbol': 'NOW', 'name': 'ServiceNow Inc.', 'sector': 'technology', 'pack': 'software'},
    {'symbol': 'SNPS', 'name': 'Synopsys Inc.', 'sector': 'technology', 'pack': 'software'},
    {'symbol': 'CDNS', 'name': 'Cadence Design Systems', 'sector': 'technology', 'pack': 'software'},
    {'symbol': 'PANW', 'name': 'Palo Alto Networks', 'sector': 'technology', 'pack': 'software'},
    {'symbol': 'WDAY', 'name': 'Workday Inc.', 'sector': 'technology', 'pack': 'software'},
    {'symbol': 'TEAM', 'name': 'Atlassian Corp.', 'sector': 'technology', 'pack': 'software'},
    {'symbol': 'CRWD', 'name': 'CrowdStrike Holdings', 'sector': 'technology', 'pack': 'software'},
    {'symbol': 'DDOG', 'name': 'Datadog Inc.', 'sector': 'technology', 'pack': 'software'},
    # Biotech
    {'symbol': 'AMGN', 'name': 'Amgen Inc.', 'sector': 'healthcare', 'pack': 'biotech'},
    {'symbol': 'GILD', 'name': 'Gilead Sciences', 'sector': 'healthcare', 'pack': 'biotech'},
    {'symbol': 'VRTX', 'name': 'Vertex Pharmaceuticals', 'sector': 'healthcare', 'pack': 'biotech'},
    {'symbol': 'REGN', 'name': 'Regeneron Pharmaceuticals', 'sector': 'healthcare', 'pack': 'biotech'},
    {'symbol': 'MRNA', 'name': 'Moderna Inc.', 'sector': 'healthcare', 'pack': 'biotech'},
    {'symbol': 'BIIB', 'name': 'Biogen Inc.', 'sector': 'healthcare', 'pack': 'biotech'},
    {'symbol': 'ILMN', 'name': 'Illumina Inc.', 'sector': 'healthcare', 'pack': 'biotech'},
    {'symbol': 'ALNY', 'name': 'Alnylam Pharmaceuticals', 'sector': 'healthcare', 'pack': 'biotech'},
    {'symbol': 'BMRN', 'name': 'BioMarin Pharmaceutical', 'sector': 'healthcare', 'pack': 'biotech'},
    {'symbol': 'INCY', 'name': 'Incyte Corp.', 'sector': 'healthcare', 'pack': 'biotech'},
    # Healthcare / medtech
    {'symbol': 'ISRG', 'name': 'Intuitive Surgical', 'sector': 'healthcare', 'pack': 'healthcare'},
    {'symbol': 'IDXX', 'name': 'IDEXX Laboratories', 'sector': 'healthcare', 'pack': 'healthcare'},
    {'symbol': 'ALGN', 'name': 'Align Technology', 'sector': 'healthcare', 'pack': 'healthcare'},
    {'symbol': 'DXCM', 'name': 'DexCom Inc.', 'sector': 'healthcare', 'pack': 'healthcare'},
    {'symbol': 'GKOS', 'name': 'Glaukos Corp.', 'sector': 'healthcare', 'pack': 'healthcare'},
    {'symbol': 'TECH', 'name': 'Bio-Techne Corp.', 'sector': 'healthcare', 'pack': 'healthcare'},
    {'symbol': 'PODD', 'name': 'Insulet Corp.', 'sector': 'healthcare', 'pack': 'healthcare'},
    {'symbol': 'PEN', 'name': 'Penumbra Inc.', 'sector': 'healthcare', 'pack': 'healthcare'},
    {'symbol': 'NBIX', 'name': 'Neurocrine Biosciences', 'sector': 'healthcare', 'pack': 'healthcare'},
    {'symbol': 'MMSI', 'name': 'Merit Medical Systems', 'sector': 'healthcare', 'pack': 'healthcare'},
    # Real estate (some large REITs are NYSE-listed; exchange is shown in the UI)
    {'symbol': 'PLD', 'name': 'Prologis Inc.', 'sector': 'realestate', 'pack': 'realestate'},
    {'symbol': 'AMT', 'name': 'American Tower', 'sector': 'realestate', 'pack': 'realestate'},
    {'symbol': 'EQIX', 'name': 'Equinix Inc.', 'sector': 'realestate', 'pack': 'realestate'},
    {'symbol': 'WELL', 'name': 'Welltower Inc.', 'sector': 'realestate', 'pack': 'realestate'},
    {'symbol': 'SPG', 'name': 'Simon Property Group', 'sector': 'realestate', 'pack': 'realestate'},
    {'symbol': 'PSA', 'name': 'Public Storage', 'sector': 'realestate', 'pack': 'realestate'},
    {'symbol': 'O', 'name': 'Realty Income', 'sector': 'realestate', 'pack': 'realestate'},
    {'symbol': 'CCI', 'name': 'Crown Castle', 'sector': 'realestate', 'pack': 'realestate'},
    {'symbol': 'DLR', 'name': 'Digital Realty Trust', 'sector': 'realestate', 'pack': 'realestate'},
    {'symbol': 'CSGP', 'name': 'CoStar Group', 'sector': 'realestate', 'pack': 'realestate'},
    {'symbol': 'VTR', 'name': 'Ventas Inc.', 'sector': 'realestate', 'pack': 'realestate'},
    # Financials
    {'symbol': 'CME', 'name': 'CME Group', 'sector': 'financials', 'pack': 'financials'},
    {'symbol': 'PYPL', 'name': 'PayPal Holdings', 'sector': 'financials', 'pack': 'financials'},
    {'symbol': 'NDAQ', 'name': 'Nasdaq Inc.', 'sector': 'financials', 'pack': 'financials'},
    {'symbol': 'IBKR', 'name': 'Interactive Brokers', 'sector': 'financials', 'pack': 'financials'},
    {'symbol': 'MKTX', 'name': 'MarketAxess Holdings', 'sector': 'financials', 'pack': 'financials'},
    {'symbol': 'FITB', 'name': 'Fifth Third Bancorp', 'sector': 'financials', 'pack': 'financials'},
    {'symbol': 'HBAN', 'name': 'Huntington Bancshares', 'sector': 'financials', 'pack': 'financials'},
    {'symbol': 'ZION', 'name': 'Zions Bancorporation', 'sector': 'financials', 'pack': 'financials'},
    {'symbol': 'WAL', 'name': 'Western Alliance Bancorp', 'sector': 'financials', 'pack': 'financials'},
    {'symbol': 'EWBC', 'name': 'East West Bancorp', 'sector': 'financials', 'pack': 'financials'},
    # Consumer and retail
    {'symbol': 'AMZN', 'name': 'Amazon.com Inc.', 'sector': 'discretionary', 'pack': 'consumer'},
    {'symbol': 'TSLA', 'name': 'Tesla Inc.', 'sector': 'discretionary', 'pack': 'consumer'},
    {'symbol': 'COST', 'name': 'Costco Wholesale', 'sector': 'staples', 'pack': 'consumer'},
    {'symbol': 'NFLX', 'name': 'Netflix Inc.', 'sector': 'discretionary', 'pack': 'consumer'},
    {'symbol': 'BKNG', 'name': 'Booking Holdings', 'sector': 'discretionary', 'pack': 'consumer'},
    {'symbol': 'MELI', 'name': 'MercadoLibre Inc.', 'sector': 'discretionary', 'pack': 'consumer'},
    {'symbol': 'SBUX', 'name': 'Starbucks Corp.', 'sector': 'discretionary', 'pack': 'consumer'},
    {'symbol': 'LULU', 'name': 'Lululemon Athletica', 'sector': 'discretionary', 'pack': 'consumer'},
    {'symbol': 'ORLY', 'name': "O'Reilly Automotive", 'sector': 'discretionary', 'pack': 'consumer'},
    {'symbol': 'ROST', 'name': 'Ross Stores', 'sector': 'discretionary', 'pack': 'consumer'},
    # Industrials
    {'symbol': 'GE', 'name': 'General Electric', 'sector': 'industrials', 'pack': 'industrials'},
    {'symbol': 'CAT', 'name': 'Caterpillar Inc.', 'sector': 'industrials', 'pack': 'industrials'},
    {'symbol': 'HON', 'name': 'Honeywell International', 'sector': 'industrials', 'pack': 'industrials'},
    {'symbol': 'UPS', 'name': 'United Parcel Service', 'sector': 'industrials', 'pack': 'industrials'},
    {'symbol': 'BA', 'name': 'Boeing Co.', 'sector': 'industrials', 'pack': 'industrials'},
    {'symbol': 'RTX', 'name': 'RTX Corp.', 'sector': 'industrials', 'pack': 'industrials'},
    {'symbol': 'LMT', 'name': 'Lockheed Martin', 'sector': 'industrials', 'pack': 'industrials'},
    {'symbol': 'DE', 'name': 'Deere & Co.', 'sector': 'industrials', 'pack': 'industrials'},
    {'symbol': 'MMM', 'name': '3M Co.', 'sector': 'industrials', 'pack': 'industrials'},
    {'symbol': 'UNP', 'name': 'Union Pacific', 'sector': 'industrials', 'pack': 'industrials'},
    # Energy
    {'symbol': 'XOM', 'name': 'Exxon Mobil', 'sector': 'energy', 'pack': 'energy'},
    {'symbol': 'CVX', 'name': 'Chevron Corp.', 'sector': 'energy', 'pack': 'energy'},
    {'symbol': 'COP', 'name': 'ConocoPhillips', 'sector': 'energy', 'pack': 'energy'},
    {'symbol': 'SLB', 'name': 'SLB', 'sector': 'energy', 'pack': 'energy'},
    {'symbol': 'EOG', 'name': 'EOG Resources', 'sector': 'energy', 'pack': 'energy'},
    {'symbol': 'OXY', 'name': 'Occidental Petroleum', 'sector': 'energy', 'pack': 'energy'},
    {'symbol': 'PSX', 'name': 'Phillips 66', 'sector': 'energy', 'pack': 'energy'},
    {'symbol': 'MPC', 'name': 'Marathon Petroleum', 'sector': 'energy', 'pack': 'energy'},
    {'symbol': 'VLO', 'name': 'Valero Energy', 'sector': 'energy', 'pack': 'energy'},
    {'symbol': 'KMI', 'name': 'Kinder Morgan', 'sector': 'energy', 'pack': 'energy'},
    # Utilities
    {'symbol': 'NEE', 'name': 'NextEra Energy', 'sector': 'utilities', 'pack': 'utilities'},
    {'symbol': 'DUK', 'name': 'Duke Energy', 'sector': 'utilities', 'pack': 'utilities'},
    {'symbol': 'SO', 'name': 'Southern Co.', 'sector': 'utilities', 'pack': 'utilities'},
    {'symbol': 'D', 'name': 'Dominion Energy', 'sector': 'utilities', 'pack': 'utilities'},
    {'symbol': 'AEP', 'name': 'American Electric Power', 'sector': 'utilities', 'pack': 'utilities'},
    {'symbol': 'EXC', 'name': 'Exelon Corp.', 'sector': 'utilities', 'pack': 'utilities'},
    {'symbol': 'XEL', 'name': 'Xcel Energy', 'sector': 'utilities', 'pack': 'utilities'},
    {'symbol': 'SRE', 'name': 'Sempra', 'sector': 'utilities', 'pack': 'utilities'},
    {'symbol': 'PEG', 'name': 'Public Service Enterprise', 'sector': 'utilities', 'pack': 'utilities'},
    {'symbol': 'WEC', 'name': 'WEC Energy Group', 'sector': 'utilities', 'pack': 'utilities'},
    # Communication services
    {'symbol': 'CMCSA', 'name': 'Comcast Corp.', 'sector': 'communication', 'pack': 'communication'},
    {'symbol': 'TMUS', 'name': 'T-Mobile US', 'sector': 'communication', 'pack': 'communication'},
    {'symbol': 'CHTR', 'name': 'Charter Communications', 'sector': 'communication', 'pack': 'communication'},
    {'symbol': 'DIS', 'name': 'Walt Disney Co.', 'sector': 'communication', 'pack': 'communication'},
    {'symbol': 'VZ', 'name': 'Verizon Communications', 'sector': 'communication', 'pack': 'communication'},
    {'symbol': 'T', 'name': 'AT&T Inc.', 'sector': 'communication', 'pack': 'communication'},
    {'symbol': 'TRIP', 'name': 'TripAdvisor Inc.', 'sector': 'communication', 'pack': 'communication'},
    {'symbol': 'TTWO', 'name': 'Take-Two Interactive', 'sector': 'communication', 'pack': 'communication'},
    {'symbol': 'LYV', 'name': 'Live Nation Entertainment', 'sector': 'communication', 'pack': 'communication'},
    {'symbol': 'NWSA', 'name': 'News Corp.', 'sector': 'communication', 'pack': 'communication'},
    # Benchmark
    {'symbol': 'QQQ', 'name': 'Invesco QQQ Trust (benchmark)', 'sector': 'technology', 'pack': 'benchmark', 'benchmark': True},
]

SECTOR_SCENARIOS = {
    '2020-covid': {'start': '2020-01-02', 'end': '2020-12-31'},
    '2022-hikes': {'start': '2022-01-03', 'end': '2022-12-30'},
}

LONG_2015_SYMBOLS = [
    # Existing 2015 large-cap base
    'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'COST', 'NFLX', 'AMD', 'ADBE', 'QCOM', 'PEP', 'AMGN',
    # Additional pre-2015 names from existing packs
    'INTC', 'TXN', 'AMAT', 'LRCX', 'KLAC', 'MU',
    'CRM', 'INTU', 'NOW', 'SNPS', 'CDNS',
    'GILD', 'VRTX', 'REGN', 'BIIB',
    'ISRG', 'IDXX', 'ALGN', 'DXCM',
    # Four new sector packs
    'GE', 'CAT', 'HON', 'UPS', 'BA', 'RTX', 'LMT', 'DE', 'MMM', 'UNP',
    'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'OXY', 'PSX', 'MPC', 'VLO', 'KMI',
    'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'XEL', 'SRE', 'PEG', 'WEC',
    'CMCSA', 'TMUS', 'CHTR', 'DIS', 'VZ', 'T', 'TRIP', 'TTWO', 'LYV', 'NWSA',
    'QQQ',
]


def epoch(date_text: str) -> int:
    return int(datetime.strptime(date_text, '%Y-%m-%d').replace(tzinfo=timezone.utc).timestamp())


def fetch_chart(symbol: str, period1: int, period2: int, attempts: int = 5):
    url = (
        f'https://query2.finance.yahoo.com/v8/finance/chart/{symbol}'
        f'?period1={period1}&period2={period2}&interval=1d'
        '&events=div%2Csplit&includeAdjustedClose=true'
    )
    last_error = None
    for attempt in range(attempts):
        try:
            completed = subprocess.run(
                ['curl', '-sS', '--max-time', '30', '-H', f'User-Agent: {UA}', url],
                capture_output=True,
                text=True,
                timeout=40,
            )
            if completed.returncode != 0:
                raise RuntimeError(completed.stderr.strip() or f'curl exit {completed.returncode}')
            data = json.loads(completed.stdout)
            if 'chart' not in data or not data['chart'].get('result'):
                raise RuntimeError('empty chart result')
            return data['chart']['result'][0]
        except Exception as error:  # noqa: BLE001 - retry transient throttling
            last_error = error
            time.sleep(6 + attempt * 4)
    raise RuntimeError(f'{symbol}: {last_error}')


def build_ticker(entry: dict, period1: int, period2: int) -> dict:
    result = fetch_chart(entry['symbol'], period1, period2)
    timestamps = result['timestamp']
    quote = result['indicators']['quote'][0]
    adjclose = result['indicators']['adjclose'][0]['adjclose']
    bars = []
    for index, stamp in enumerate(timestamps):
        close = quote['close'][index]
        adjusted = adjclose[index]
        if close is None or adjusted is None or close <= 0:
            continue
        factor = adjusted / close
        open_price = quote['open'][index]
        high = quote['high'][index]
        low = quote['low'][index]
        volume = quote['volume'][index] or 0
        if open_price is None or high is None or low is None:
            continue
        values = [
            round(open_price * factor, 2),
            round(high * factor, 2),
            round(low * factor, 2),
            round(adjusted, 2),
        ]
        # Keep OHLC internally consistent after rounding.
        values[1] = max(values[1], values[0], values[3])
        values[2] = min(values[2], values[0], values[3])
        date_text = datetime.fromtimestamp(stamp, tz=timezone.utc).strftime('%Y-%m-%d')
        bars.append([date_text, values[0], values[1], values[2], values[3], int(volume)])

    bars.sort(key=lambda row: row[0])
    if not bars:
        raise RuntimeError(f'{entry["symbol"]}: no usable bars')
    exchange = result['meta'].get('exchangeName', '')
    payload = {
        'symbol': entry['symbol'],
        'name': entry['name'],
        'sector': entry['sector'],
        'exchange': exchange,
        'benchmark': bool(entry.get('benchmark')),
        'bars': bars,
    }
    if entry.get('pack'):
        payload['pack'] = entry['pack']
    return payload


def slice_bars(bars, start, end):
    return [bar for bar in bars if start <= bar[0] <= end]


def build_legacy():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for scenario_id, scenario in SCENARIOS.items():
        if scenario_id == '2015-long':
            continue  # built by build_long_universe with the expanded 75-symbol universe
        period1 = epoch(scenario['start'])
        period2 = epoch(scenario['end'])
        tickers = []
        print(f'Fetching {scenario_id}…')
        for entry in scenario['tickers']:
            ticker = build_ticker(entry, period1, period2)
            print(f'  {ticker["symbol"]:6s} {len(ticker["bars"]):5d} bars  {ticker["bars"][0][0]} → {ticker["bars"][-1][0]}')
            tickers.append(ticker)
            time.sleep(1.2)
        payload = {
            'id': scenario_id,
            'source': 'Yahoo Finance chart API (build-time snapshot)',
            'adjusted': True,
            'currency': 'USD',
            'benchmark': scenario['benchmark'],
            'start': scenario['start'],
            'end': scenario['end'],
            'fetchedAt': datetime.now(tz=timezone.utc).strftime('%Y-%m-%d'),
            'note': 'Adjusted OHLC for splits and dividends; volume raw. Local educational snapshot, not a licensed feed.',
            'tickers': tickers,
        }
        path = OUT_DIR / f'{scenario_id}.json'
        path.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        print(f'  → {path.relative_to(ROOT)} ({path.stat().st_size / 1024 / 1024:.2f} MB)\n')


def lookup_ticker(symbol):
    for entry in SECTOR_TICKERS:
        if entry['symbol'] == symbol:
            return entry
    for entry in SCENARIOS['2015-long']['tickers']:
        if entry['symbol'] == symbol:
            return entry
    raise RuntimeError(f'No metadata for {symbol}')


def build_long_universe():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    period1 = epoch('2015-01-01')
    period2 = epoch('2026-10-31')
    cache_path = ROOT / 'tools' / '.long-cache.json'
    cache = {}
    if cache_path.exists():
        try:
            cache = json.loads(cache_path.read_text(encoding='utf-8'))
            print(f'Loaded long cache with {len(cache)} symbols')
        except Exception:  # noqa: BLE001
            cache = {}
    print(f'Fetching 2015–2026 universe {len(LONG_2015_SYMBOLS)} symbols…')
    tickers = []
    for symbol in LONG_2015_SYMBOLS:
        if symbol in cache:
            source = cache[symbol]
            print(f'  {symbol:6s} cached')
        else:
            entry = lookup_ticker(symbol)
            source = build_ticker(entry, period1, period2)
            cache[symbol] = source
            cache_path.write_text(json.dumps(cache, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
            print(f'  {symbol:6s} {len(source["bars"]):5d} bars  {source["bars"][0][0]} → {source["bars"][-1][0]}')
            time.sleep(1.5)
        ticker = {**{key: value for key, value in source.items() if key != 'pack'}, 'bars': source['bars']}
        tickers.append(ticker)
    bar_count = len(next(ticker['bars'] for ticker in tickers if ticker.get('benchmark')))
    for ticker in tickers:
        if len(ticker['bars']) != bar_count:
            raise RuntimeError(f'{ticker["symbol"]}: {len(ticker["bars"])} bars, expected {bar_count}')
    payload = {
        'id': '2015-long',
        'source': 'Yahoo Finance chart API (build-time snapshot)',
        'adjusted': True,
        'currency': 'USD',
        'benchmark': 'QQQ',
        'start': '2015-01-01',
        'end': '2026-10-31',
        'fetchedAt': datetime.now(tz=timezone.utc).strftime('%Y-%m-%d'),
        'note': ('Adjusted OHLC for splits and dividends; volume raw. '
                 'Real US stocks across technology, healthcare, industrials, energy, utilities and communication. '
                 'Local educational snapshot, not a licensed feed.'),
        'tickers': tickers,
    }
    path = OUT_DIR / '2015-long.json'
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'  2015-long: {len(tickers)} symbols, {bar_count} bars')
    print(f'  → {path.relative_to(ROOT)} ({path.stat().st_size / 1024 / 1024:.2f} MB)\n')


def build_sector_scenarios():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    period1 = epoch(FETCH_START)
    period2 = epoch(FETCH_END)
    cache = {}
    if CACHE_PATH.exists():
        try:
            cache = json.loads(CACHE_PATH.read_text(encoding='utf-8'))
            print(f'Loaded cache with {len(cache)} symbols')
        except Exception:  # noqa: BLE001 - rebuild a corrupt cache
            cache = {}
    print(f'Fetching sector universe {len(SECTOR_TICKERS)} symbols ({FETCH_START} → {FETCH_END})…')
    for entry in SECTOR_TICKERS:
        symbol = entry['symbol']
        if symbol in cache:
            print(f'  {symbol:6s} cached')
            continue
        try:
            ticker = build_ticker(entry, period1, period2)
        except Exception as error:  # noqa: BLE001 - skip delisted symbols, validate packs later
            print(f'  {symbol:6s} SKIPPED: {error}')
            continue
        cache[symbol] = ticker
        CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        print(f'  {ticker["symbol"]:6s} {len(ticker["bars"]):5d} bars  {ticker["bars"][0][0]} → {ticker["bars"][-1][0]}')
        time.sleep(1.5)

    for scenario_id, window in SECTOR_SCENARIOS.items():
        tickers = []
        for entry in SECTOR_TICKERS:
            source = cache.get(entry['symbol'])
            if not source:
                continue
            bars = slice_bars(source['bars'], window['start'], window['end'])
            if len(bars) < 200:
                continue
            tickers.append({**{key: value for key, value in source.items() if key != 'bars'}, 'bars': bars})
        pack_counts = {}
        for ticker in tickers:
            if ticker.get('pack') and ticker['pack'] != 'benchmark':
                pack_counts[ticker['pack']] = pack_counts.get(ticker['pack'], 0) + 1
        for pack, count in sorted(pack_counts.items()):
            if count < 10:
                raise RuntimeError(f'{scenario_id}: pack {pack} only has {count} symbols')
        payload = {
            'id': scenario_id,
            'source': 'Yahoo Finance chart API (build-time snapshot)',
            'adjusted': True,
            'currency': 'USD',
            'benchmark': 'QQQ',
            'start': window['start'],
            'end': window['end'],
            'fetchedAt': datetime.now(tz=timezone.utc).strftime('%Y-%m-%d'),
            'note': ('Adjusted OHLC for splits and dividends; volume raw. '
                     'Mostly Nasdaq-listed with a few large NYSE REITs; exchange is shown per symbol. '
                     'Local educational snapshot, not a licensed feed.'),
            'tickers': tickers,
        }
        path = OUT_DIR / f'{scenario_id}.json'
        path.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        bar_count = len(next(ticker['bars'] for ticker in tickers if ticker.get('benchmark')))
        print(f'  {scenario_id}: {len(tickers)} symbols, {bar_count} bars, packs={pack_counts}')
        print(f'  → {path.relative_to(ROOT)} ({path.stat().st_size / 1024 / 1024:.2f} MB)\n')


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if mode not in ('all', 'legacy', '2008', 'long', 'sectors'):
        raise SystemExit('Usage: python3 tools/fetch-history.py [all|2008|long|sectors]')
    if mode in ('all', 'legacy', '2008'):
        build_legacy()
    if mode in ('all', 'legacy', 'long'):
        build_long_universe()
    if mode in ('all', 'sectors'):
        build_sector_scenarios()


if __name__ == '__main__':
    main()
