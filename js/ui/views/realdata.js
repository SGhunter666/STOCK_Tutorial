/**
 * Read-only real K-line viewer.
 *
 * It loads the locally downloaded Alpaca SIP files, shows the actual raw prices
 * and never touches the account, orders or save file. This makes it possible to
 * compare the game's adjusted history data with the real market prices.
 */
import { money, num, compactNumber } from '../../core/format.js';
import { pageHead, card, segmented, keyValueList } from '../kit.js';
import { CandlestickChart } from '../chart.js';
import { getHistoryScenario } from '../../data/historyScenarios.js';
import {
  loadRealDaily, loadRealMinute, dailyWindow, minuteBarsForDate,
  aggregateMinuteBars, intradayDates, REAL_DATA_MONTH,
} from '../../history/realData.js';

const SCENARIO = getHistoryScenario('2020-covid');
const TICKERS = SCENARIO ? SCENARIO.symbols : ['MSFT'];
const TIMEFRAMES = ['1d', '1m', '5m', '15m', '1h'];

export function createRealDataView(ctx, options = {}) {
  const { i18n } = ctx;
  const t = (key, params) => i18n.t(key, params);
  const fetchImpl = options.fetchImpl || null;
  const loaderOptions = fetchImpl ? { fetchImpl } : {};
  let container;
  let chart = null;
  let ticker = TICKERS.includes('MSFT') ? 'MSFT' : (TICKERS[0] || '');
  let timeframe = '1d';
  let selectedDate = '';
  let dailyBars = [];
  let minuteBars = [];
  let loadSeq = 0;
  const dailyCache = new Map();
  const minuteCache = new Map();

  const dateLabel = (date, short = false) => {
    if (!date) return '';
    try {
      return new Intl.DateTimeFormat(i18n.locale, short
        ? { month: 'short', day: 'numeric', timeZone: 'UTC' }
        : { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }
      ).format(new Date(`${date}T00:00:00Z`));
    } catch {
      return date;
    }
  };

  function statusNode() {
    return container && container.querySelector('#realdata-status');
  }

  function setStatus(message = '', error = false) {
    const node = statusNode();
    if (!node) return;
    node.textContent = message;
    node.hidden = !message;
    node.classList.toggle('is-error', Boolean(error));
  }

  function dateOptions(dates) {
    return dates.map((date) => `<option value="${date}">${dateLabel(date)}</option>`).join('');
  }

  function syncDateOptions() {
    const select = container && container.querySelector('[data-realdata-date]');
    if (!select) return;
    const dates = timeframe === '1d'
      ? dailyBars.map((bar) => bar.date)
      : intradayDates(dailyBars);
    let next = dates.includes(selectedDate) ? selectedDate : '';
    if (!next) {
      next = timeframe === '1d'
        ? (dates[dates.length - 1] || '')
        : (dates.includes(`${REAL_DATA_MONTH}-16`) ? `${REAL_DATA_MONTH}-16` : (dates[0] || ''));
    }
    selectedDate = next;
    select.innerHTML = dateOptions(dates);
    select.value = selectedDate;
  }

  function clearChart() {
    if (chart) chart.setData({ candles: [], labels: [] });
    const note = container && container.querySelector('#realdata-chart-note');
    if (note) note.textContent = '';
  }

  function renderChart() {
    if (!chart || !container) return;
    const title = container.querySelector('#realdata-chart-title');
    if (title) title.textContent = selectedDate ? `${ticker} · ${dateLabel(selectedDate)}` : ticker;
    const note = container.querySelector('#realdata-chart-note');
    if (!dailyBars.length) {
      clearChart();
      if (note) note.textContent = t('realdata.noData');
      return;
    }

    if (timeframe === '1d') {
      const windowBars = dailyWindow(dailyBars, selectedDate, 120);
      chart.setData({
        candles: windowBars.map((bar) => ({
          d: bar.date,
          end: bar.date,
          o: bar.open,
          h: bar.high,
          l: bar.low,
          c: bar.close,
          v: bar.volume,
        })),
        labels: windowBars.map((bar) => dateLabel(bar.date, true)),
      });
      if (note) note.textContent = t('realdata.chartNoteDaily', { count: windowBars.length });
    } else {
      const dayBars = minuteBarsForDate(minuteBars, selectedDate);
      const candles = aggregateMinuteBars(dayBars, timeframe);
      chart.setData({
        candles,
        labels: candles.map((candle) => candle.time || candle.d),
      });
      if (note) {
        note.textContent = candles.length
          ? t('realdata.chartNoteIntraday', {
            count: candles.length,
            tf: t(`realdata.tf.${timeframe}`),
          })
          : t('realdata.noMinute');
      }
    }
  }

  function renderInfo() {
    const target = container && container.querySelector('#realdata-info');
    if (!target) return;
    const bar = dailyBars.find((row) => row.date === selectedDate);
    if (!bar) {
      target.innerHTML = card({
        title: t('realdata.infoTitle'),
        body: `<p class="muted">${t('realdata.noData')}</p>`,
      });
      return;
    }
    const dayBars = timeframe === '1d' ? [] : minuteBarsForDate(minuteBars, selectedDate);
    const minuteLine = timeframe === '1d' ? '' : `
      <p class="muted">${t('realdata.minuteInfo', {
        count: num(dayBars.length, i18n.locale, 0),
        first: dayBars[0] ? dayBars[0].time : '—',
        last: dayBars.length ? dayBars[dayBars.length - 1].time : '—',
      })}</p>`;
    target.innerHTML = card({
      title: `${ticker} · ${dateLabel(selectedDate)}`,
      subtitle: t('realdata.infoSubtitle'),
      body: `
        ${keyValueList([
          [t('realdata.open'), money(bar.open, i18n.locale)],
          [t('realdata.high'), money(bar.high, i18n.locale)],
          [t('realdata.low'), money(bar.low, i18n.locale)],
          [t('realdata.close'), money(bar.close, i18n.locale)],
          [t('realdata.volume'), compactNumber(bar.volume, i18n.locale)],
        ])}
        ${minuteLine}
        <p class="muted">${t('realdata.rawNote')}</p>`,
    });
  }

  function renderAll() {
    renderChart();
    renderInfo();
  }

  async function ensureData() {
    if (!ticker) return;
    const seq = ++loadSeq;
    setStatus(t('realdata.loading'));
    clearChart();
    try {
      if (!dailyCache.has(ticker)) {
        dailyCache.set(ticker, await loadRealDaily(ticker, loaderOptions));
      }
      if (seq !== loadSeq) return;
      dailyBars = dailyCache.get(ticker) || [];
      if (timeframe !== '1d' && !minuteCache.has(ticker)) {
        minuteCache.set(ticker, await loadRealMinute(ticker, loaderOptions));
      }
      if (seq !== loadSeq) return;
      minuteBars = timeframe === '1d' ? [] : (minuteCache.get(ticker) || []);
      syncDateOptions();
      renderAll();
      if (!dailyBars.length) setStatus(t('realdata.noData'), true);
      else setStatus('');
    } catch (error) {
      if (seq !== loadSeq) return;
      if (!dailyCache.has(ticker)) dailyBars = [];
      minuteBars = [];
      syncDateOptions();
      renderAll();
      setStatus(t(error && error.message ? error.message : 'realdata.error.fetch'), true);
    }
  }

  function onTimeframeClick(value) {
    if (!TIMEFRAMES.includes(value) || value === timeframe) return;
    timeframe = value;
    container.querySelectorAll('[data-realdata-timeframe]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.realdataTimeframe === timeframe);
    });
    if (timeframe === '1d') {
      minuteBars = [];
      syncDateOptions();
      renderAll();
      setStatus(dailyBars.length ? '' : t('realdata.noData'), !dailyBars.length);
      return;
    }
    ensureData();
  }

  function template() {
    return `
      <div class="realdata-page">
        ${pageHead({
          eyebrow: t('realdata.eyebrow'),
          title: t('realdata.title'),
          subtitle: t('realdata.subtitle'),
          actions: `<span class="pill pill--warn">${t('realdata.readOnly')}</span>`,
        })}
        ${card({
          title: t('realdata.controlsTitle'),
          subtitle: t('realdata.controlsSubtitle'),
          body: `
            <div class="realdata-controls">
              <label class="field">
                <span class="field-label">${t('realdata.ticker')}</span>
                <select class="input input--select" data-realdata-ticker>
                  ${TICKERS.map((symbol) => `<option value="${symbol}" ${symbol === ticker ? 'selected' : ''}>${symbol}${symbol === 'QQQ' ? ` · ${t('realdata.benchmark')}` : ''}</option>`).join('')}
                </select>
              </label>
              <label class="field">
                <span class="field-label">${t('realdata.date')}</span>
                <select class="input input--select" data-realdata-date></select>
              </label>
              <div class="field">
                <span class="field-label">${t('realdata.timeframe')}</span>
                ${segmented({
                  options: TIMEFRAMES.map((value) => ({ value, label: t(`realdata.tf.${value}`) })),
                  active: timeframe,
                  attr: 'realdata-timeframe',
                })}
              </div>
            </div>
            <p class="muted" id="realdata-status">${t('realdata.loading')}</p>`,
        })}
        ${card({
          title: `<span id="realdata-chart-title">${ticker}</span> · ${t('realdata.chartTitle')}`,
          subtitle: t('realdata.chartSubtitle'),
          body: `
            <div class="chart-wrap"><canvas id="realdata-chart" style="height:340px"></canvas></div>
            <p class="chart-note muted" id="realdata-chart-note"></p>`,
        })}
        <div id="realdata-info"></div>
        ${card({
          title: t('realdata.coverageTitle'),
          subtitle: t('realdata.coverageSubtitle'),
          body: `
            <ul class="realdata-list">
              <li>${t('realdata.coverageDaily')}</li>
              <li>${t('realdata.coverageMinute')}</li>
              <li>${t('realdata.coverageRaw')}</li>
              <li>${t('realdata.coverageLicense')}</li>
            </ul>`,
        })}
      </div>`;
  }

  function mount(target) {
    target.innerHTML = template();
    container = target.querySelector('.realdata-page');
    const canvas = container.querySelector('#realdata-chart');
    chart = new CandlestickChart(canvas, {
      height: 340,
      showVolume: true,
      yFormat: (value) => money(value, i18n.locale),
    });
    container.addEventListener('change', (event) => {
      const targetNode = event.target;
      if (targetNode.matches('[data-realdata-ticker]')) {
        ticker = targetNode.value;
        ensureData();
      } else if (targetNode.matches('[data-realdata-date]')) {
        selectedDate = targetNode.value;
        renderAll();
      }
    });
    container.addEventListener('click', (event) => {
      const button = event.target.closest('[data-realdata-timeframe]');
      if (button) onTimeframeClick(button.dataset.realdataTimeframe);
    });
    syncDateOptions();
    renderAll();
    ensureData();
  }

  function render() {}

  function destroy() {
    loadSeq += 1;
    if (chart) chart.destroy();
    chart = null;
    container = null;
  }

  return { mount, render, destroy };
}
