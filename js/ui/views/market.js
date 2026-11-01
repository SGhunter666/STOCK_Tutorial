/**
 * Market list: virtual exchange, segmented universe, index summary, search and filters.
 */
import { money, pct, moneyCompact } from '../../core/format.js';
import { pageHead, card } from '../kit.js';
import { icon } from '../icons.js';
import { drawSparkline, LineChart } from '../chart.js';
import { COMPANIES, SECTORS } from '../../data/companies.js';
import { unitProgress } from '../../education/lessonEngine.js';
import { getUnit } from '../../education/curriculum.js';
import {
  MARKET_SEGMENTS, isSegmentUnlocked, segmentStats, unlockedCompanies, segmentById,
} from '../../market/marketAccess.js';
import { openModal, closeModal } from '../components.js';
import { companyName, sectorLabel, unitLabel } from '../labels.js';

export function createMarketView(ctx) {
  const { i18n, store, router, actions } = ctx;
  const t = (key, p) => i18n.t(key, p);
  let root;
  let container;
  let query = '';
  let sector = 'all';
  let segmentFilter = 'all';
  let indexChart = null;
  let sparkCanvases = [];
  let tickCounter = 0;

  function practiceBanner(state) {
    const unit = getUnit('u1');
    if (!unit) return '';
    const progress = unitProgress(state, unit);
    if (progress.practiceDone) return '';
    const inspected = (state.education.inspectedTickers || []).length;
    return `
      <div class="practice-banner">
        <span class="practice-banner__icon">${icon('academy', { size: 18 })}</span>
        <div class="practice-banner__text">
          <strong>${t('market.practiceTitle')}</strong>
          <span>${t('market.practiceText', { current: Math.min(inspected, 2), target: 2 })}</span>
        </div>
        <button class="link-btn" type="button" data-go="/academy/u1">${t('market.practiceLink')} ${icon('arrowRight', { size: 14 })}</button>
      </div>`;
  }

  function indexCard(state) {
    const index = state.market.index;
    const change = index.prevClose ? ((index.value - index.prevClose) / index.prevClose) * 100 : 0;
    return card({
      className: 'index-card',
      body: `
        <div class="index-card__info">
          <span class="eyebrow">${t('market.indexName')}</span>
          <div class="index-card__value">
            <strong id="market-index">${money(index.value, i18n.locale, 2)}</strong>
            <span class="delta ${change > 0 ? 'up' : change < 0 ? 'down' : 'flat'}" id="market-index-change">${pct(change, i18n.locale, 2)}</span>
          </div>
          <span class="muted">${t('market.indexNote')}</span>
        </div>
        <div class="index-card__chart"><canvas id="index-chart" style="height:78px"></canvas></div>`,
    });
  }

  function segmentCard(segment, state) {
    const unlocked = isSegmentUnlocked(state, segment.id);
    const active = segmentFilter === segment.id;
    const unit = segment.unlockUnit ? getUnit(segment.unlockUnit) : null;
    return `
      <article class="segment-card ${unlocked ? 'is-unlocked' : 'is-locked'} ${active ? 'is-active' : ''}"
        data-segment="${segment.id}" data-segment-locked="${unlocked ? 'false' : 'true'}"
        tabindex="0" role="button">
        <header class="segment-card__head">
          <h3 class="segment-card__name">${t(segment.nameKey)}</h3>
          <span class="segment-card__state">${unlocked ? icon('check', { size: 12 }) : icon('lock', { size: 12 })}</span>
        </header>
        <p class="segment-card__desc">${t(segment.descKey)}</p>
        <div class="segment-card__meta">
          <span>${t('market.segmentCount', { count: segment.tickers.length })}</span>
          <span class="${unlocked ? 'up' : 'faint'}">${unlocked ? t('market.segmentUnlocked') : t('market.segmentLocked', { unit: unit ? unitLabel(ctx, unit) : '' })}</span>
        </div>
        <div class="segment-tickers">
          ${segment.tickers.map((ticker) => `<span class="${unlocked ? '' : 'is-locked'}">${ticker}</span>`).join('')}
        </div>
      </article>`;
  }

  function segmentsSection(state) {
    const stats = segmentStats(state);
    const unlockedCount = stats.filter((s) => s.unlocked).length;
    return `
      <section class="market-segments">
        <header class="market-segments__head">
          <div>
            <span class="field-label">${t('market.segmentsTitle')}</span>
            <p class="muted">${t('market.segmentsSubtitle', { unlocked: unlockedCount, total: stats.length })}</p>
          </div>
          ${segmentFilter !== 'all' ? `<button class="link-btn" type="button" data-segment="all">${t('market.showAll')}</button>` : ''}
        </header>
        <div class="segment-grid">
          ${MARKET_SEGMENTS.map((segment) => segmentCard(segment, state)).join('')}
        </div>
      </section>`;
  }

  function filters() {
    return `
      <div class="market-toolbar">
        <label class="search-field">
          ${icon('search', { size: 16 })}
          <input class="input input--search" id="market-search" type="search" placeholder="${t('market.searchPlaceholder')}" value="${query}">
        </label>
        <div class="sector-chips" id="sector-chips">
          <button class="chip ${sector === 'all' ? 'is-active' : ''}" type="button" data-sector="all">${t('market.allSectors')}</button>
          ${SECTORS.map((name) => `<button class="chip ${sector === name ? 'is-active' : ''}" type="button" data-sector="${name}">${sectorLabel(ctx, name)}</button>`).join('')}
        </div>
      </div>`;
  }

  function rowsHtml(state) {
    const advanced = store.get().settings.layout === 'advanced';
    return unlockedCompanies(state).map((company) => {
      const quote = state.market.quotes[company.ticker];
      return `
        <tr class="market-row" data-ticker="${company.ticker}" data-name="${companyName(ctx, company.ticker).toLowerCase()}" data-sector="${company.sector}" data-segment="${company.segmentId}" tabindex="0">
          <td>
            <div class="ticker-cell">
              <strong>${company.ticker}</strong>
              <span>${companyName(ctx, company.ticker)}</span>
            </div>
          </td>
          <td><span class="sector-tag">${sectorLabel(ctx, company.sector)}</span></td>
          <td class="num market-last">${money(quote.last, i18n.locale)}</td>
          <td class="num market-change ${quote.changePct > 0 ? 'up' : quote.changePct < 0 ? 'down' : 'flat'}">${pct(quote.changePct, i18n.locale, 2)}</td>
          <td class="num market-cap">${moneyCompact(quote.marketCap, i18n.locale)}</td>
          ${advanced ? `<td class="num market-spread">${money(Math.max(0, quote.ask - quote.bid), i18n.locale)}</td>` : ''}
          <td class="spark-cell"><canvas class="sparkline" data-spark="${company.ticker}" width="120" height="30"></canvas></td>
          <td><button class="link-btn" type="button" data-inspect="${company.ticker}">${t('market.inspect')} ${icon('arrowRight', { size: 13 })}</button></td>
        </tr>`;
    }).join('');
  }

  function marketTable(state) {
    const advanced = store.get().settings.layout === 'advanced';
    const unlockedCount = unlockedCompanies(state).length;
    return card({
      title: t('market.companiesTitle'),
      subtitle: t('market.companiesSubtitle', { unlocked: unlockedCount, total: COMPANIES.length }),
      className: 'market-card',
      body: `
        <div class="table-wrap">
          <table class="table market-table">
            <thead><tr>
              <th>${t('market.company')}</th><th>${t('market.sector')}</th><th class="num">${t('market.last')}</th>
              <th class="num">${t('market.change')}</th><th class="num">${t('market.marketCap')}</th>
              ${advanced ? `<th class="num">${t('market.spread')}</th>` : ''}
              <th>${t('market.trend')}</th><th></th>
            </tr></thead>
            <tbody>${rowsHtml(state)}</tbody>
          </table>
        </div>
        <p class="market-empty muted" hidden>${t('market.noResults')}</p>`,
    });
  }

  function template(state) {
    return `
      <div class="market-page">
        ${pageHead({
          eyebrow: t('market.eyebrow'),
          title: t('market.title'),
          subtitle: t('market.subtitle'),
          actions: `<button class="btn btn--ghost btn--sm" type="button" data-go="/glossary">${icon('glossary', { size: 15 })} ${t('nav.glossary')}</button>`,
        })}
        ${practiceBanner(state)}
        ${indexCard(state)}
        ${segmentsSection(state)}
        ${filters()}
        ${marketTable(state)}
        <p class="page-footnote">${t('market.disclaimer')}</p>
      </div>`;
  }

  function drawSparks(state) {
    sparkCanvases = [...container.querySelectorAll('[data-spark]')];
    sparkCanvases.forEach((canvas) => {
      const row = canvas.closest('.market-row');
      if (row && row.hidden) return;
      const ticker = canvas.dataset.spark;
      const quote = state.market.quotes[ticker];
      const history = state.market.history[ticker];
      if (!quote || !history) return;
      const candles = history.slice(-24).map((candle) => candle.c);
      drawSparkline(canvas, [...candles, quote.last], { positive: quote.changePct >= 0 });
    });
  }

  function drawIndexChart(state) {
    if (!indexChart) return;
    const history = state.market.index.history || [];
    const values = history.map((entry) => entry.v);
    values.push(state.market.index.value);
    indexChart.setData({ values, labels: [] });
  }

  function applyFilters() {
    const rows = [...container.querySelectorAll('.market-row')];
    let visible = 0;
    const needle = query.trim().toLowerCase();
    rows.forEach((row) => {
      const matchesQuery = !needle
        || row.dataset.name.includes(needle)
        || row.dataset.ticker.toLowerCase().includes(needle);
      const matchesSector = sector === 'all' || row.dataset.sector === sector;
      const matchesSegment = segmentFilter === 'all' || row.dataset.segment === segmentFilter;
      const show = matchesQuery && matchesSector && matchesSegment;
      row.hidden = !show;
      if (show) visible += 1;
    });
    const empty = container.querySelector('.market-empty');
    if (empty) empty.hidden = visible > 0;
    drawSparks(store.get());
  }

  function updateSegmentActive() {
    container.querySelectorAll('[data-segment]').forEach((node) => {
      if (!node.classList.contains('segment-card')) return;
      node.classList.toggle('is-active', node.dataset.segment === segmentFilter);
    });
  }

  function openSegmentModal(segmentId) {
    const segment = segmentById(segmentId);
    if (!segment) return;
    const state = store.get();
    if (isSegmentUnlocked(state, segment.id)) return;
    const unit = segment.unlockUnit ? getUnit(segment.unlockUnit) : null;
    const companies = COMPANIES.filter((company) => company.ticker && segment.tickers.includes(company.ticker));
    openModal({
      title: t(segment.nameKey),
      subtitle: t('market.segmentLockedShort'),
      bodyHtml: `
        <p class="modal-copy">${t(segment.descKey)}</p>
        <div class="callout callout--tip">
          <span class="callout__label">${t('unlock.howToUnlock')}</span>
          <p>${unit ? t('market.segmentUnlockHint', { unit: unitLabel(ctx, unit) }) : ''}</p>
        </div>
        <span class="field-label">${t('market.segmentCompanies')}</span>
        <div class="segment-tickers segment-tickers--modal">
          ${companies.map((company) => `<span>${company.ticker} · ${companyName(ctx, company.ticker)}</span>`).join('')}
        </div>`,
      footerHtml: unit
        ? `<a class="btn btn--primary btn--sm" href="#/academy/${unit.id}">${t('market.goUnlock')}</a><button class="btn btn--ghost btn--sm" type="button" data-modal-close="true">${t('common.close')}</button>`
        : `<button class="btn btn--primary btn--sm" type="button" data-modal-close="true">${t('common.close')}</button>`,
    });
    document.querySelector('.modal__foot a[href^="#/academy"]')?.addEventListener('click', closeModal);
  }

  function bind(state) {
    container.querySelectorAll('.market-row').forEach((row) => {
      const handler = () => {
        const ticker = row.dataset.ticker;
        if (!ticker) return;
        actions.inspectTicker(ticker);
        router.go(`/trade/${ticker}`);
      };
      row.addEventListener('click', handler);
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') handler();
      });
    });
    container.querySelectorAll('.segment-card').forEach((cardNode) => {
      const handler = () => {
        if (cardNode.dataset.segmentLocked === 'true') {
          openSegmentModal(cardNode.dataset.segment);
          return;
        }
        segmentFilter = segmentFilter === cardNode.dataset.segment ? 'all' : cardNode.dataset.segment;
        updateSegmentActive();
        applyFilters();
      };
      cardNode.addEventListener('click', handler);
      cardNode.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') handler();
      });
    });
    container.querySelector('#market-search')?.addEventListener('input', (event) => {
      query = event.target.value;
      applyFilters();
    });
    container.querySelectorAll('[data-sector]').forEach((button) => {
      button.addEventListener('click', () => {
        sector = button.dataset.sector;
        container.querySelectorAll('[data-sector]').forEach((node) => node.classList.toggle('is-active', node.dataset.sector === sector));
        applyFilters();
      });
    });
    const showAll = container.querySelector('.market-segments__head [data-segment="all"]');
    if (showAll) {
      showAll.addEventListener('click', () => {
        segmentFilter = 'all';
        updateSegmentActive();
        applyFilters();
      });
    }
    container.querySelectorAll('[data-go]').forEach((button) => {
      button.addEventListener('click', () => router.go(button.dataset.go));
    });
  }

  function mount(node) {
    root = node;
    container = document.createElement('div');
    root.appendChild(container);
    render(store.get());
  }

  function render(state) {
    if (!container) return;
    // A segment can never become locked again; keep the filter valid.
    if (segmentFilter !== 'all' && !isSegmentUnlocked(state, segmentFilter)) segmentFilter = 'all';
    container.innerHTML = template(state);
    bind(state);
    if (indexChart) indexChart.destroy();
    indexChart = new LineChart(container.querySelector('#index-chart'), {
      height: 78,
      showYAxis: false,
      padding: { top: 6, right: 4, bottom: 4, left: 4 },
      color: '#7c9cff',
      fill: false,
    });
    drawIndexChart(state);
    drawSparks(state);
    applyFilters();
  }

  function onTick(state) {
    if (!container) return;
    container.querySelectorAll('.market-row').forEach((row) => {
      if (row.hidden) return;
      const ticker = row.dataset.ticker;
      const quote = state.market.quotes[ticker];
      if (!quote) return;
      const last = row.querySelector('.market-last');
      const change = row.querySelector('.market-change');
      const cap = row.querySelector('.market-cap');
      const spread = row.querySelector('.market-spread');
      if (last) last.textContent = money(quote.last, i18n.locale);
      if (change) {
        change.textContent = pct(quote.changePct, i18n.locale, 2);
        change.classList.toggle('up', quote.changePct > 0);
        change.classList.toggle('down', quote.changePct < 0);
        change.classList.toggle('flat', quote.changePct === 0);
      }
      if (cap) cap.textContent = moneyCompact(quote.marketCap, i18n.locale);
      if (spread) spread.textContent = money(Math.max(0, quote.ask - quote.bid), i18n.locale);
    });
    const indexNode = container.querySelector('#market-index');
    if (indexNode) indexNode.textContent = money(state.market.index.value, i18n.locale, 2);
    const index = state.market.index;
    const change = index.prevClose ? ((index.value - index.prevClose) / index.prevClose) * 100 : 0;
    const changeNode = container.querySelector('#market-index-change');
    if (changeNode) {
      changeNode.textContent = pct(change, i18n.locale, 2);
      changeNode.classList.toggle('up', change > 0);
      changeNode.classList.toggle('down', change < 0);
      changeNode.classList.toggle('flat', change === 0);
    }
    tickCounter += 1;
    if (tickCounter % 2 === 1) drawSparks(state);
    drawIndexChart(state);
  }

  function destroy() {
    if (indexChart) indexChart.destroy();
    indexChart = null;
    sparkCanvases = [];
  }

  return { mount, render, onTick, destroy };
}
