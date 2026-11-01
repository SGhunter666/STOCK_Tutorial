/**
 * Dashboard: learning focus, account snapshot, market pulse, recent activity.
 */
import { money, pct, num, signedMoney } from '../../core/format.js';
import { LineChart } from '../chart.js';
import { pageHead, card, statCard } from '../kit.js';
import { progressBar, emptyState } from '../dom.js';
import { icon } from '../icons.js';
import { equity, marketValue, unrealizedPnl, returnPct, positionRows } from '../../trading/account.js';
import { levelInfo, ACHIEVEMENTS } from '../../education/progress.js';
import { currentUnit, firstUnreadSection, unitProgress, isUnitComplete } from '../../education/lessonEngine.js';
import { STAGE_1_UNITS } from '../../education/curriculum.js';
import { companyName, unitLabel } from '../labels.js';
import { isCompanyUnlocked } from '../../market/marketAccess.js';

export function createDashboardView(ctx) {
  const { i18n, store, router } = ctx;
  let root;
  let container;
  let chart = null;

  const t = (key, params) => i18n.t(key, params);

  function greetingKey() {
    const hour = new Date().getHours();
    if (hour < 12) return 'dashboard.greetingMorning';
    if (hour < 18) return 'dashboard.greetingAfternoon';
    return 'dashboard.greetingEvening';
  }

  function learningCard(state) {
    const unit = currentUnit(state);
    const doneUnits = STAGE_1_UNITS.filter((u) => isUnitComplete(state, u.id)).length;
    if (!unit) {
      return card({
        className: 'learning-card learning-card--complete',
        body: `
          <span class="eyebrow">${t('dashboard.stageCompleteEyebrow')}</span>
          <h2 class="learning-card__title">${t('dashboard.stageCompleteTitle')}</h2>
          <p class="learning-card__text">${t('dashboard.stageCompleteText')}</p>
          <div class="chip-row">
            <span class="chip chip--ghost">${icon('sparkle', { size: 14 })} ${t('dashboard.certificateBadge')}</span>
            <span class="chip chip--ghost">${t('dashboard.stageUnits', { done: doneUnits, total: STAGE_1_UNITS.length })}</span>
          </div>
          <div class="learning-card__actions">
            <button class="btn btn--primary" type="button" data-go="/academy">${t('dashboard.reviewAcademy')}</button>
            <button class="btn btn--ghost" type="button" data-go="/roadmap">${t('dashboard.seeRoadmap')}</button>
          </div>
          <p class="learning-card__footnote">${t('dashboard.certificateNote')}</p>`,
      });
    }
    const progress = unitProgress(state, unit);
    const nextSection = firstUnreadSection(state, unit);
    const target = nextSection ? `/academy/${unit.id}/${nextSection.id}` : `/academy/${unit.id}/practice`;
    return card({
      className: 'learning-card',
      body: `
        <div class="learning-card__top">
          <span class="eyebrow">${t('dashboard.continueEyebrow')}</span>
          <span class="pill">${t('dashboard.unitPill', { number: unit.number })}</span>
        </div>
        <h2 class="learning-card__title">${unitLabel(ctx, unit)}</h2>
        <p class="learning-card__text">${t(unit.summaryKey)}</p>
        <div class="learning-card__progress">
          ${progressBar(progress.pct, 'accent', true)}
          <div class="learning-card__meta">
            <span>${t('dashboard.sectionsRead', { read: progress.read, total: progress.total })}</span>
            <span>${progress.practiceDone ? t('dashboard.practiceDone') : t('dashboard.practicePending')}</span>
            <span>${progress.quizPassed ? t('dashboard.quizPassed', { score: progress.quizBest }) : t('dashboard.quizPending')}</span>
          </div>
        </div>
        <div class="learning-card__actions">
          <button class="btn btn--primary" type="button" data-go="${target}">
            ${icon('play', { size: 14 })} ${t(nextSection ? 'dashboard.resumeLesson' : 'dashboard.goPractice')}
          </button>
          <button class="btn btn--ghost" type="button" data-go="/academy">${t('dashboard.openAcademy')}</button>
        </div>`,
    });
  }

  function portfolioCard(state) {
    const total = equity(state.account, state.market.quotes);
    const ret = returnPct(state.account, state.market.quotes);
    const rows = positionRows(state.account, state.market.quotes);
    return card({
      className: 'portfolio-card',
      body: `
        <div class="portfolio-card__head">
          <span class="eyebrow">${t('dashboard.portfolioEyebrow')}</span>
          <button class="link-btn" type="button" data-go="/portfolio">${t('common.viewAll')} ${icon('arrowRight', { size: 14 })}</button>
        </div>
        <div class="portfolio-card__value" id="dash-equity">${money(total, i18n.locale)}</div>
        <div class="portfolio-card__delta ${ret > 0 ? 'up' : ret < 0 ? 'down' : 'flat'}" id="dash-return">
          ${pct(ret, i18n.locale, 2)} ${t('dashboard.sinceStart')}
        </div>
        <div class="portfolio-card__chart"><canvas id="dash-equity-chart" style="height:96px"></canvas></div>
        <div class="portfolio-card__meta">
          <span>${t('dashboard.cashLine', { value: money(state.account.cash, i18n.locale) })}</span>
          <span>${t('dashboard.positionsLine', { value: rows.length })}</span>
        </div>`,
    });
  }

  function moverRow(quote) {
    return `
      <button class="mover" type="button" data-go="/trade/${quote.ticker}">
        <span class="mover__ticker">${quote.ticker}</span>
        <span class="mover__name">${companyName(ctx, quote.ticker)}</span>
        <span class="mover__price">${money(quote.last, i18n.locale)}</span>
        <span class="mover__change ${quote.changePct > 0 ? 'up' : quote.changePct < 0 ? 'down' : 'flat'}">${pct(quote.changePct, i18n.locale, 2)}</span>
      </button>`;
  }

  function moversHtml(state) {
    const movers = [...Object.values(state.market.quotes)]
      .filter((quote) => isCompanyUnlocked(state, quote.ticker))
      .sort((a, b) => b.changePct - a.changePct);
    const gainers = movers.slice(0, 2);
    const losers = movers.slice(-2).reverse();
    return `
      <span class="mover-list__caption">${t('dashboard.gainers')}</span>
      ${gainers.map(moverRow).join('')}
      <span class="mover-list__caption">${t('dashboard.losers')}</span>
      ${losers.map(moverRow).join('')}`;
  }

  function marketCard(state) {
    const indexChange = state.market.index.prevClose
      ? ((state.market.index.value - state.market.index.prevClose) / state.market.index.prevClose) * 100
      : 0;
    return card({
      title: t('dashboard.marketPulse'),
      subtitle: t('dashboard.marketPulseSubtitle'),
      actions: `<button class="link-btn" type="button" data-go="/market">${t('nav.market')} ${icon('arrowRight', { size: 14 })}</button>`,
      body: `
        <div class="index-row">
          <div class="index-row__main">
            <span class="index-row__label">${t('dashboard.indexLabel')}</span>
            <strong class="index-row__value" id="dash-index">${num(state.market.index.value, i18n.locale, 2)}</strong>
          </div>
          <span class="delta ${indexChange > 0 ? 'up' : indexChange < 0 ? 'down' : 'flat'}" id="dash-index-change">${pct(indexChange, i18n.locale, 2)}</span>
        </div>
        <div class="mover-list">${moversHtml(state)}</div>`,
    });
  }

  function pathCard(state) {
    const steps = STAGE_1_UNITS.map((unit) => {
      const progress = unitProgress(state, unit);
      const done = progress.completed;
      const active = !done && progress.read > 0;
      return `
        <li class="path-step ${done ? 'is-done' : active ? 'is-active' : ''}">
          <span class="path-step__marker">${done ? icon('check', { size: 13 }) : unit.number}</span>
          <div class="path-step__body">
            <span class="path-step__title">${unitLabel(ctx, unit)}</span>
            <span class="path-step__meta">${t('dashboard.unitMeta', { minutes: unit.minutes, read: progress.read, total: progress.total })}</span>
          </div>
          <button class="link-btn" type="button" data-go="/academy/${unit.id}">${done ? t('common.review') : t('common.open')}</button>
        </li>`;
    }).join('');
    return card({
      title: t('dashboard.pathTitle'),
      subtitle: t('dashboard.pathSubtitle'),
      actions: `<button class="link-btn" type="button" data-go="/academy">${t('nav.academy')} ${icon('arrowRight', { size: 14 })}</button>`,
      body: `<ol class="path-list">${steps}</ol>`,
    });
  }

  function activityCard(state) {
    const trades = state.account.trades.slice(0, 4);
    const body = trades.length
      ? `<ul class="activity-list">${trades.map((trade) => `
          <li class="activity-row">
            <span class="side-tag side-tag--${trade.side}">${t(`trade.${trade.side}`)}</span>
            <div class="activity-row__main">
              <span class="activity-row__ticker">${trade.ticker}</span>
              <span class="activity-row__meta">${t('dashboard.tradeMeta', {
                qty: num(trade.qty, i18n.locale, 0),
                price: money(trade.price, i18n.locale),
              })}</span>
            </div>
            <span class="activity-row__pnl ${trade.side === 'sell' ? (trade.realized > 0 ? 'up' : trade.realized < 0 ? 'down' : 'flat') : 'flat'}">
              ${trade.side === 'sell' ? signedMoney(trade.realized, i18n.locale) : '—'}
            </span>
          </li>`).join('')}</ul>`
      : emptyState(icon('trading', { size: 26 }), t('dashboard.noTradesTitle'), t('dashboard.noTradesText'),
        `<button class="btn btn--primary btn--sm" type="button" data-go="/market">${t('dashboard.goTrade')}</button>`);
    return card({
      title: t('dashboard.activityTitle'),
      subtitle: t('dashboard.activitySubtitle'),
      actions: `<button class="link-btn" type="button" data-go="/portfolio">${t('common.viewAll')} ${icon('arrowRight', { size: 14 })}</button>`,
      body,
    });
  }

  function achievementsCard(state) {
    const earned = ACHIEVEMENTS.filter((a) => state.education.achievements.includes(a.id));
    return card({
      title: t('dashboard.achievementsTitle'),
      subtitle: t('dashboard.achievementsSubtitle', { earned: earned.length, total: ACHIEVEMENTS.length }),
      body: earned.length
        ? `<div class="achievement-strip">${earned.slice(0, 4).map((a) => `
            <div class="achievement-chip" title="${t(a.descKey)}">
              <span class="achievement-chip__icon">${icon('sparkle', { size: 15 })}</span>
              <span>${t(a.titleKey)}</span>
            </div>`).join('')}</div>`
        : `<p class="muted">${t('dashboard.noAchievements')}</p>`,
    });
  }

  function template(state) {
    const total = equity(state.account, state.market.quotes);
    const mv = marketValue(state.account, state.market.quotes);
    const unrealized = unrealizedPnl(state.account, state.market.quotes);
    const level = levelInfo(state.education.xp || 0);
    const doneUnits = STAGE_1_UNITS.filter((u) => isUnitComplete(state, u.id)).length;

    return `
      <div class="dashboard">
        ${pageHead({
          eyebrow: t('dashboard.eyebrow'),
          title: t(greetingKey()),
          subtitle: t('dashboard.subtitle', { done: doneUnits, total: STAGE_1_UNITS.length }),
          actions: `<button class="btn btn--ghost btn--sm" type="button" data-go="/glossary">${icon('glossary', { size: 15 })} ${t('nav.glossary')}</button>`,
        })}
        <div class="dash-hero">
          ${learningCard(state)}
          ${portfolioCard(state)}
        </div>
        <div class="stat-grid">
          ${statCard({ label: t('dashboard.statCash'), value: money(state.account.cash, i18n.locale), sub: t('dashboard.statCashSub'), iconName: 'portfolio', id: 'dash-cash' })}
          ${statCard({ label: t('dashboard.statHoldings'), value: money(mv, i18n.locale), sub: t('dashboard.statHoldingsSub'), iconName: 'market', id: 'dash-mv' })}
          ${statCard({ label: t('dashboard.statUnrealized'), value: signedMoney(unrealized, i18n.locale), sub: t('dashboard.statUnrealizedSub'), tone: unrealized > 0 ? 'up' : unrealized < 0 ? 'down' : '', iconName: 'options', id: 'dash-unreal' })}
          ${statCard({ label: t('dashboard.statLevel'), value: `${level.level}`, sub: t('dashboard.statLevelSub', { xp: num(level.intoLevel, i18n.locale, 0), need: level.needed }), iconName: 'academy', id: 'dash-level' })}
        </div>
        <div class="dash-grid">
          ${marketCard(state)}
          <div class="dash-side">
            ${activityCard(state)}
            ${achievementsCard(state)}
          </div>
        </div>
        ${pathCard(state)}
        <div id="dash-values" data-equity="${total}"></div>
      </div>`;
  }

  function updateChart(state) {
    if (!chart) return;
    const history = state.account.equityHistory || [];
    const values = history.map((entry) => entry.equity);
    const current = equity(state.account, state.market.quotes);
    if (!values.length) values.push(state.account.initialCash);
    values.push(current);
    chart.setData({ values, labels: [] });
  }

  function patchNumbers(state) {
    const total = equity(state.account, state.market.quotes);
    const ret = returnPct(state.account, state.market.quotes);
    const mv = marketValue(state.account, state.market.quotes);
    const unrealized = unrealizedPnl(state.account, state.market.quotes);
    const setText = (id, value) => {
      const node = container.querySelector(`#${id}`);
      if (node) node.textContent = value;
    };
    setText('dash-equity', money(total, i18n.locale));
    setText('dash-cash', money(state.account.cash, i18n.locale));
    setText('dash-mv', money(mv, i18n.locale));
    setText('dash-unreal', signedMoney(unrealized, i18n.locale));
    const retNode = container.querySelector('#dash-return');
    if (retNode) {
      retNode.textContent = `${pct(ret, i18n.locale, 2)} ${t('dashboard.sinceStart')}`;
      retNode.classList.toggle('up', ret > 0);
      retNode.classList.toggle('down', ret < 0);
      retNode.classList.toggle('flat', ret === 0);
    }
    const indexNode = container.querySelector('#dash-index');
    if (indexNode) indexNode.textContent = num(state.market.index.value, i18n.locale, 2);
    const indexChange = state.market.index.prevClose
      ? ((state.market.index.value - state.market.index.prevClose) / state.market.index.prevClose) * 100
      : 0;
    const changeNode = container.querySelector('#dash-index-change');
    if (changeNode) {
      changeNode.textContent = pct(indexChange, i18n.locale, 2);
      changeNode.classList.toggle('up', indexChange > 0);
      changeNode.classList.toggle('down', indexChange < 0);
      changeNode.classList.toggle('flat', indexChange === 0);
    }
    const moversNode = container.querySelector('.mover-list');
    if (moversNode) moversNode.innerHTML = moversHtml(state);
    updateChart(state);
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-go]');
      if (button) {
        router.go(button.dataset.go);
      }
    });
    render(store.get());
  }

  function render(state) {
    if (!container) return;
    container.innerHTML = template(state);
    if (chart) chart.destroy();
    const canvas = container.querySelector('#dash-equity-chart');
    if (canvas) {
      chart = new LineChart(canvas, {
        height: 96,
        showYAxis: false,
        padding: { top: 6, right: 4, bottom: 4, left: 4 },
        color: '#5eead4',
      });
      updateChart(state);
    }
  }

  function onTick(state) {
    patchNumbers(state);
  }

  function destroy() {
    if (chart) chart.destroy();
    chart = null;
  }

  return { mount, render, onTick, destroy };
}
