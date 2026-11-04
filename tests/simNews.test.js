import { test, assert, assertEqual } from './harness.js';
import { SIM_COMPANIES } from '../js/sim/companies50.js';
import { newsForDay } from '../js/sim/news.js';
import {
  createExchangeEngine, advanceSecond, serializeExchange, deserializeExchange,
} from '../js/sim/exchangeEngine.js';

test('news is deterministic for the same seed and day and never appears on day zero', () => {
  const first = newsForDay({ seed: 'news-test', dayIndex: 5, companies: SIM_COMPANIES });
  const second = newsForDay({ seed: 'news-test', dayIndex: 5, companies: SIM_COMPANIES });
  assertEqual(JSON.stringify(first), JSON.stringify(second), 'same news stream');
  assert(first.length >= 1 && first.length <= 2, 'one or two events');
  for (const event of first) {
    assert(['company', 'sector', 'market'].includes(event.scope), 'scope');
    assert(Number.isFinite(event.impact) && event.impact !== 0, 'impact');
    assert(['positive', 'negative'].includes(event.sentiment), 'sentiment');
    assert(event.template, 'template');
  }
  const zero = newsForDay({ seed: 'news-test', dayIndex: 0, companies: SIM_COMPANIES });
  assertEqual(zero.length, 0, 'no news before the first session');
});

test('news is applied once on the next trading day and moves the target quote', () => {
  const withNews = createExchangeEngine({ seed: 'news-engine-test' });
  const withoutNews = createExchangeEngine({ seed: 'news-engine-test' });
  withNews.dayIndex = 0;
  withNews.second = 23400 - 1;
  withoutNews.dayIndex = 0;
  withoutNews.second = 23400 - 1;
  withoutNews.lastNewsDay = 1;
  advanceSecond(withNews);
  advanceSecond(withoutNews);
  assertEqual(withNews.dayIndex, 1, 'next day');
  assertEqual(withNews.lastNewsDay, 1, 'last news day');
  assert(withNews.news.length >= 1, 'news recorded');
  const event = withNews.news[0];
  const target = event.scope === 'company' ? event.ticker : null;
  const ticker = target || (event.scope === 'sector'
    ? Object.keys(withNews.companies).find((symbol) => withNews.companies[symbol].company.sector === event.sector)
    : 'APLA');
  assert(withNews.quotes[ticker].last !== withoutNews.quotes[ticker].last,
    'news moves the target quote');
  assert(withNews.quotes[ticker].last > 0, 'positive quote');
});

test('news history survives save and restore', () => {
  const state = createExchangeEngine({ seed: 'news-save-test' });
  state.dayIndex = 0;
  state.second = 23400 - 1;
  advanceSecond(state);
  const restored = deserializeExchange(serializeExchange(state));
  assertEqual(restored.lastNewsDay, state.lastNewsDay, 'news day restored');
  assertEqual(restored.news.length, state.news.length, 'news history restored');
});
