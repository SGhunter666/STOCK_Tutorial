/**
 * External live feed tests: payload normalisation, validation and graceful
 * failure without touching the simulated market.
 */
import {
  suite, test, assert, assertEqual,
} from './harness.js';
import { normalizeLiveFeed, fetchLiveFeed } from '../js/market/liveFeed.js';

function fakeFetch(payload, { ok = true, status = 200 } = {}) {
  return async () => ({
    ok,
    status,
    json: async () => payload,
  });
}

suite('Market: external live feed');

test('live feed accepts a bare quote map and filters invalid prices', () => {
  const result = normalizeLiveFeed({ AURA: 12.3, HLIX: -1, MKT: { last: 45.6, changePct: 2.1 } }, { now: 1 });
  assert(result.ok, 'bare map parses');
  assertEqual(result.quotes.length, 2, 'invalid prices are dropped');
  assertEqual(result.quotes[0].ticker, 'AURA');
  assertEqual(result.quotes[0].changePct, null);
  assertEqual(result.quotes[1].changePct, 2.1);
  assertEqual(result.updatedAt, 1, 'missing timestamp falls back to now');
});

test('live feed accepts nested objects, arrays and timestamps', () => {
  const nested = normalizeLiveFeed({
    updatedAt: '2026-11-03T09:31:00Z',
    quotes: { aura: 10, tech: { price: 22.5, change: -1.2 } },
  });
  assert(nested.ok, 'nested quotes parse');
  assertEqual(nested.quotes.length, 2);
  assertEqual(nested.quotes[0].ticker, 'AURA', 'tickers are upper-cased');
  assertEqual(nested.quotes[1].last, 22.5);
  assertEqual(nested.quotes[1].changePct, -1.2);
  assert(nested.updatedAt > 0, 'timestamp parses');
  const array = normalizeLiveFeed([{ ticker: 'AURA', last: 9 }]);
  assert(array.ok, 'array quotes parse');
  assertEqual(array.quotes[0].last, 9);
});

test('live feed rejects empty and unusable payloads', () => {
  assertEqual(normalizeLiveFeed(null).error, 'liveFeed.errorEmpty');
  assertEqual(normalizeLiveFeed({ quotes: [] }).error, 'liveFeed.errorQuotes');
  assertEqual(normalizeLiveFeed({ quotes: { AURA: 0 } }).error, 'liveFeed.errorQuotes');
});

test('live feed fetch reports HTTP, URL and fetch failures without throwing', async () => {
  const url = await fetchLiveFeed('ftp://example.com/quotes.json');
  assertEqual(url.ok, false);
  assertEqual(url.error, 'liveFeed.errorUrl');
  const http = await fetchLiveFeed('https://example.com/quotes.json', {
    fetchImpl: fakeFetch({}, { ok: false, status: 500 }),
  });
  assertEqual(http.ok, false);
  assertEqual(http.error, 'liveFeed.errorHttp');
  const thrown = await fetchLiveFeed('https://example.com/quotes.json', {
    fetchImpl: async () => { throw new Error('network'); },
  });
  assertEqual(thrown.ok, false);
  assertEqual(thrown.error, 'liveFeed.errorFetch');
});

test('live feed fetch normalises a successful JSON response', async () => {
  const result = await fetchLiveFeed('https://example.com/quotes.json', {
    fetchImpl: fakeFetch({ quotes: { AURA: 12.34 }, updatedAt: '2026-11-03T09:31:00Z' }),
    now: 2,
  });
  assert(result.ok, 'successful feed parses');
  assertEqual(result.quotes.length, 1);
  assertEqual(result.quotes[0].last, 12.34);
  assert(result.updatedAt > 0, 'feed timestamp is retained');
});
