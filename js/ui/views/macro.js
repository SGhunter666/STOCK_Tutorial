/**
 * Macro world: the deterministic economic cycle, releases calendar and global
 * market linkages. Everything is a teaching model, not a live data feed.
 */
import { LineChart } from '../chart.js';
import { num, pct } from '../../core/format.js';
import { pageHead, card, statCard, keyValueList } from '../kit.js';
import { icon } from '../icons.js';
import { formatMarketDate } from '../../market/calendar.js';
import { isUnitComplete } from '../../education/lessonEngine.js';
import { macroWorld, macroCalendar, globalMarkets } from '../../market/macro.js';

export function createMacroView(ctx) {
  const { i18n, store } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let root;
  let container;
  let chart = null;

  function lockedCard() {
    return card({
      className: 'macro-locked',
      title: t('macroPage.lockedTitle'),
      subtitle: t('macroPage.lockedText'),
      body: `
        <p class="muted">${t('macroPage.lockedHint')}</p>
        <div class="button-row">
          <button class="btn btn--primary" type="button" data-go="/academy/u13">${icon('academy', { size: 15 })} ${t('macroPage.goAcademy')}</button>
        </div>`,
    });
  }

  function statGrid(world) {
    return `
      <div class="stat-grid">
        ${statCard({ label: t('macroPage.policyRate'), value: `${num(world.policyRate, i18n.locale, 1)}%`, sub: t('macroPage.realRateSub', { value: `${num(world.realRate, i18n.locale, 1)}%` }), iconName: 'sparkle' })}
        ${statCard({ label: t('macroPage.inflation'), value: `${num(world.inflation, i18n.locale, 1)}%`, sub: t(`macro.regime.${world.regime}`), tone: world.inflation > 3 ? 'down' : '', iconName: 'warning' })}
        ${statCard({ label: t('macroPage.growth'), value: `${num(world.growth, i18n.locale, 1)}%`, sub: t('macroPage.confidenceSub', { value: num(world.confidence, i18n.locale, 1) }), tone: world.growth >= 2.1 ? 'up' : 'down', iconName: 'market' })}
        ${statCard({ label: t('macroPage.unemployment'), value: `${num(world.unemployment, i18n.locale, 1)}%`, sub: t('macroPage.riskAppetiteSub', { value: world.riskAppetite }), tone: world.unemployment > 5.2 ? 'down' : 'up', iconName: 'portfolio' })}
        ${statCard({ label: t('macroPage.yieldCurve'), value: `${num(world.curve, i18n.locale, 2)}%`, sub: t('macroPage.yieldSub', { two: num(world.yield2, i18n.locale, 2), ten: num(world.yield10, i18n.locale, 2) }), tone: world.curve < 0 ? 'down' : '', iconName: 'roadmap' })}
        ${statCard({ label: t('macroPage.creditSpread'), value: `${num(world.creditSpread, i18n.locale, 2)}%`, sub: t('macroPage.creditSub'), tone: world.creditSpread > 2 ? 'down' : '', iconName: 'warning' })}
      </div>`;
  }

  function regimeCard(world) {
    return card({
      className: 'macro-regime',
      title: t('macroPage.regimeTitle'),
      subtitle: t(`macro.regime.${world.regime}`),
      actions: `<span class="pill">${t('macroPage.riskAppetite', { value: world.riskAppetite })}</span>`,
      body: `
        <p class="macro-lead">${t(`macroPage.regime.${world.regime}`)}</p>
        ${keyValueList([
          [t('macroPage.realRate'), `${num(world.realRate, i18n.locale, 1)}%`],
          [t('macroPage.confidence'), num(world.confidence, i18n.locale, 1)],
          [t('macroPage.policyBias'), t(world.realRate < 0 ? 'macroPage.easy' : world.inflation > 3 ? 'macroPage.tight' : 'macroPage.neutralBias')],
          [t('macroPage.riskAppetiteLabel'), `${world.riskAppetite} / 100`],
        ])}
        <p class="chart-note muted">${t('macroPage.regimeNote')}</p>`,
    });
  }

  function chartCard(state) {
    return card({
      className: 'macro-chart',
      title: t('macroPage.chartTitle'),
      subtitle: t('macroPage.chartSubtitle'),
      body: `
        <div class="chart-wrap"><canvas id="macro-growth-chart" style="height:230px"></canvas></div>
        <p class="chart-note muted">${t('macroPage.chartNote')}</p>`,
    });
  }

  function calendarCard(state) {
    const events = macroCalendar(state.market.day, state.seed);
    return card({
      className: 'macro-calendar',
      title: t('macroPage.calendarTitle'),
      subtitle: t('macroPage.calendarSubtitle'),
      body: events.length
        ? `<div class="table-wrap"><table class="table table--compact">
            <thead><tr>
              <th>${t('macroPage.date')}</th><th>${t('macroPage.eventLabel')}</th>
              <th class="num">${t('macroPage.forecast')}</th><th class="num">${t('macroPage.actual')}</th>
              <th class="num">${t('macroPage.surprise')}</th><th class="num">${t('macroPage.impact')}</th>
              <th>${t('macroPage.status')}</th>
            </tr></thead>
            <tbody>${events.map((event) => `
              <tr class="${event.released ? '' : 'is-upcoming'}">
                <td>${formatMarketDate(event.day, i18n.locale)}</td>
                <td>${t(`macroPage.event.${event.type}`)}</td>
                <td class="num">${num(event.forecast, i18n.locale, event.type === 'payrolls' ? 0 : 1)}</td>
                <td class="num">${event.released ? num(event.actual, i18n.locale, event.type === 'payrolls' ? 0 : 1) : '—'}</td>
                <td class="num ${event.surprise >= 0 ? 'up' : 'down'}">${event.released ? pct(event.surprise, i18n.locale, 1) : '—'}</td>
                <td class="num ${event.impactPct >= 0 ? 'up' : 'down'}">${event.released ? pct(event.impactPct, i18n.locale, 2) : '—'}</td>
                <td><span class="pill ${event.released ? 'pill--ok' : ''}">${t(event.released ? 'macroPage.released' : 'macroPage.upcoming')}</span></td>
              </tr>`).join('')}</tbody>
          </table></div>
          <p class="chart-note muted">${t('macroPage.calendarNote')}</p>`
        : `<p class="muted">${t('macroPage.calendarEmpty')}</p>`,
    });
  }

  function globalCard(state) {
    const rows = globalMarkets(state, state.market.day, state.seed);
    return card({
      className: 'macro-global',
      title: t('macroPage.globalTitle'),
      subtitle: t('macroPage.globalSubtitle'),
      body: `<div class="table-wrap"><table class="table table--compact">
        <thead><tr>
          <th>${t('macroPage.regionLabel')}</th><th class="num">${t('macroPage.level')}</th>
          <th class="num">${t('macroPage.change')}</th><th class="num">${t('macroPage.coupling')}</th>
        </tr></thead>
        <tbody>${rows.map((row) => `
          <tr>
            <td>${t(row.nameKey)}</td>
            <td class="num">${num(row.level, i18n.locale, 2)}</td>
            <td class="num ${row.changePct >= 0 ? 'up' : 'down'}">${pct(row.changePct, i18n.locale, 2)}</td>
            <td class="num">${pct(row.coupling * 100, i18n.locale, 0, false)}</td>
          </tr>`).join('')}</tbody>
      </table></div>
      <p class="chart-note muted">${t('macroPage.globalNote')}</p>`,
    });
  }

  function template(state) {
    const unlocked = isUnitComplete(state, 'u13');
    const world = macroWorld(state.market.day, state.seed);
    return `
      <div class="macro-page">
        ${pageHead({
          eyebrow: t('macroPage.eyebrow'),
          title: t('macroPage.title'),
          subtitle: t('macroPage.subtitle'),
          actions: `<span class="pill">${icon('market', { size: 14 })} ${t(`macro.regime.${world.regime}`)}</span>`,
        })}
        ${!unlocked
          ? lockedCard()
          : `${statGrid(world)}
            <div class="macro-split">
              ${regimeCard(world)}
              ${chartCard(state)}
            </div>
            <div class="macro-split">
              ${calendarCard(state)}
              ${globalCard(state)}
            </div>`}
        <p class="chart-note muted">${t('macroPage.note')}</p>
      </div>`;
  }

  function renderChart(state) {
    if (chart) {
      chart.destroy();
      chart = null;
    }
    if (!isUnitComplete(state, 'u13')) return;
    const canvas = container?.querySelector('#macro-growth-chart');
    if (!canvas) return;
    const values = [];
    for (let index = 90; index >= 0; index -= 1) {
      values.push(macroWorld(Math.max(0, state.market.day - index), state.seed).growth);
    }
    chart = new LineChart(canvas, {
      height: 230,
      showYAxis: true,
      yFormat: (value) => `${num(value, i18n.locale, 1)}%`,
      color: '#5eead4',
    });
    chart.setData({ values });
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    render(store.get());
  }

  function render(state) {
    if (!container) return;
    container.innerHTML = template(state);
    renderChart(state);
  }

  function destroy() {
    if (chart) chart.destroy();
  }

  return { mount, render, destroy };
}
