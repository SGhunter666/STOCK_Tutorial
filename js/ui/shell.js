/**
 * Application chrome: side rail navigation, market clock controls, ticker tape and
 * account summary. The chrome is built once and updated in place so the view below
 * is never destroyed by market ticks.
 */
import { icon } from './icons.js';
import { money, moneyCompact, num, pct } from '../core/format.js';
import { formatMarketDate, sessionClock, TICKS_PER_DAY } from '../market/calendar.js';
import { equity } from '../trading/account.js';
import { levelInfo } from '../education/progress.js';
import { isUnitComplete } from '../education/lessonEngine.js';
import { isToolUnlocked } from '../education/unlockManager.js';
import { isCompanyUnlocked } from '../market/marketAccess.js';

const NAV_ITEMS = [
  { id: 'dashboard', path: '/dashboard', labelKey: 'nav.dashboard', icon: 'dashboard' },
  { id: 'academy', path: '/academy', labelKey: 'nav.academy', icon: 'academy' },
  { id: 'branches', path: '/branches', labelKey: 'nav.branches', icon: 'academy', requiresUnit: 'u32' },
  { id: 'career', path: '/career', labelKey: 'nav.career', icon: 'portfolio' },
  { id: 'fund', path: '/fund', labelKey: 'nav.fund', icon: 'portfolio' },
  { id: 'quant', path: '/quant', labelKey: 'nav.quant', icon: 'options', requiresUnit: 'u16' },
  { id: 'history', path: '/history', labelKey: 'nav.history', icon: 'roadmap' },
  { id: 'market', path: '/market', labelKey: 'nav.market', icon: 'market' },
  { id: 'macro', path: '/macro', labelKey: 'nav.macro', icon: 'roadmap', requiresUnit: 'u13' },
  { id: 'multiasset', path: '/multiasset', labelKey: 'nav.multiasset', icon: 'portfolio', requiresUnit: 'u13' },
  { id: 'trading', path: '/trade', labelKey: 'nav.trading', icon: 'trading' },
  { id: 'portfolio', path: '/portfolio', labelKey: 'nav.portfolio', icon: 'portfolio' },
  { id: 'sandbox', path: '/sandbox', labelKey: 'nav.sandbox', icon: 'sparkle' },
  { id: 'news', path: '/news', labelKey: 'nav.news', icon: 'news' },
  { id: 'options', path: '/options', labelKey: 'nav.options', icon: 'options', toolId: 'options.trade' },
  { id: 'futures', path: '/futures', labelKey: 'nav.futures', icon: 'challenges', toolId: 'trade.futures' },
  { id: 'challenges', path: '/challenges', labelKey: 'nav.challenges', icon: 'challenges' },
  { id: 'glossary', path: '/glossary', labelKey: 'nav.glossary', icon: 'glossary' },
  { id: 'settings', path: '/settings', labelKey: 'nav.settings', icon: 'settings' },
];

export function createShell({
  i18n, store, bus, clock, router, actions, sandbox = false,
}) {
  let rootEl = null;
  let viewEl = null;
  let navEl = null;
  let footerEl = null;
  let tapeTrack = null;

  function t(key, params) {
    return i18n.t(key, params);
  }

  function currentSection(path) {
    if (path.startsWith('/academy')) return 'academy';
    if (path.startsWith('/branches')) return 'academy';
    if (path.startsWith('/career')) return 'career';
    if (path.startsWith('/fund')) return 'fund';
    if (path.startsWith('/quant')) return 'quant';
    if (path.startsWith('/trade')) return 'trading';
    if (path.startsWith('/market')) return 'market';
    if (path.startsWith('/macro')) return 'macro';
    if (path.startsWith('/multiasset')) return 'multiasset';
    if (path.startsWith('/portfolio')) return 'portfolio';
    if (path.startsWith('/sandbox')) return 'sandbox';
    if (path.startsWith('/news')) return 'news';
    if (path.startsWith('/options')) return 'options';
    if (path.startsWith('/futures')) return 'futures';
    if (path.startsWith('/challenges')) return 'challenges';
    if (path.startsWith('/boundaries')) return 'settings';
    if (path.startsWith('/history')) return 'history';
    if (path.startsWith('/glossary')) return 'glossary';
    if (path.startsWith('/settings')) return 'settings';
    if (path.startsWith('/roadmap')) return 'roadmap';
    return 'dashboard';
  }

  function navHtml() {
    const state = store.get();
    const active = currentSection(router.current);
    return NAV_ITEMS.map((item) => {
      const locked = item.toolId
        ? !isToolUnlocked(state, item.toolId)
        : item.requiresUnit
          ? !isUnitComplete(state, item.requiresUnit)
          : Boolean(item.locked);
      return `
        <a class="nav-item ${active === item.id ? 'is-active' : ''} ${locked ? 'is-locked' : ''}"
           href="#${item.path}" data-nav="${item.id}">
          <span class="nav-item__icon">${icon(item.icon, { size: 19 })}</span>
          <span class="nav-item__label">${t(item.labelKey)}</span>
          ${locked ? `<span class="nav-item__lock">${icon('lock', { size: 12 })}</span>` : ''}
        </a>`;
    }).join('');
  }

  function footerHtml() {
    const state = store.get();
    const level = levelInfo(state.education.xp || 0);
    const stageOne = ['u1', 'u2', 'u3', 'u4'].every((id) => isUnitComplete(state, id));
    return `
      <div class="rail-level">
        <div class="rail-level__head">
          <span class="rail-level__label">${t('shell.level')}</span>
          <strong class="rail-level__value">${level.level}</strong>
          <span class="rail-level__xp">${num(level.xp, i18n.locale, 0)} XP</span>
        </div>
        <div class="progress">
          <div class="progress__track"><div class="progress__fill progress__fill--accent" style="width:${level.pct}%"></div></div>
        </div>
        ${stageOne ? `<span class="rail-level__credential">${icon('sparkle', { size: 14 })} ${t('shell.stageOneBadge')}</span>` : ''}
        ${sandbox ? `<button class="link-btn rail-sandbox__exit" type="button" data-sandbox-exit>${t('sandbox.exit')}</button>` : ''}
      </div>
      <p class="rail-disclaimer">${t('shell.disclaimer')}</p>`;
  }

  function clockHtml() {
    const state = store.get();
    const market = state.market;
    return `
      <div class="clock">
        <span class="status-dot ${clock.running ? 'is-live' : ''}" id="clock-dot"></span>
        <div class="clock__meta">
          <span class="clock__date" id="clock-date">${formatMarketDate(market.day, i18n.locale)}</span>
          <span class="clock__session" id="clock-session">${sessionClock(market.tick)} · ${t('clock.day', { day: market.day + 1 })}</span>
        </div>
        <div class="clock__controls">
          <button class="icon-btn" type="button" data-clock="toggle" id="clock-toggle" title="${t(clock.running ? 'clock.pause' : 'clock.play')}">
            ${icon(clock.running ? 'pause' : 'play', { size: 16 })}
          </button>
          <div class="speed-group">
            ${[1, 5, 20].map((speed) => `<button class="speed-btn ${clock.speed === speed && clock.running ? 'is-active' : ''}" type="button" data-speed="${speed}">${speed}×</button>`).join('')}
          </div>
          <button class="icon-btn" type="button" data-clock="next" title="${t('clock.nextDay')}">${icon('next', { size: 16 })}</button>
        </div>
      </div>`;
  }

  function accountHtml() {
    const state = store.get();
    const total = equity(state.account, state.market.quotes);
    const prevValue = state.account.cash
      + Object.entries(state.account.positions).reduce((sum, [ticker, pos]) => {
        const quote = state.market.quotes[ticker];
        return sum + (quote ? pos.qty * quote.prevClose : 0);
      }, 0);
    const dayChange = total - prevValue;
    const dayPct = prevValue ? (dayChange / prevValue) * 100 : 0;
    return `
      <div class="acct">
        <div class="acct__main">
          <span class="acct__label">${t('shell.equity')}</span>
          <strong class="acct__value" id="acct-equity">${money(total, i18n.locale)}</strong>
        </div>
        <div class="acct__sub">
          <span class="acct__label">${t('shell.today')}</span>
          <span class="delta ${dayChange > 0 ? 'up' : dayChange < 0 ? 'down' : 'flat'}" id="acct-change">
            ${pct(dayPct, i18n.locale, 2)} · ${money(dayChange, i18n.locale)}
          </span>
        </div>
      </div>`;
  }

  function tapeHtml() {
    const state = store.get();
    return Object.values(state.market.quotes)
      .filter((quote) => isCompanyUnlocked(state, quote.ticker))
      .map((quote) => `
      <button class="tape-chip" type="button" data-tape="${quote.ticker}">
        <span class="tape-chip__ticker">${quote.ticker}</span>
        <span class="tape-chip__price">${money(quote.last, i18n.locale)}</span>
        <span class="tape-chip__change ${quote.changePct > 0 ? 'up' : quote.changePct < 0 ? 'down' : 'flat'}">${pct(quote.changePct, i18n.locale, 2)}</span>
      </button>`).join('');
  }

  function frameHtml() {
    const state = store.get();
    return `
      <div class="app-frame">
        <aside class="rail" id="rail">
          <a class="rail__brand" href="#/dashboard">
            <span class="brand-mark">SMA</span>
            <span class="brand-text">
              <strong>${t('app.name')}</strong>
              <span>${t('app.tagline')}</span>
            </span>
          </a>
          <nav class="rail__nav" id="rail-nav">${navHtml()}</nav>
          <div class="rail__footer" id="rail-footer">${footerHtml()}</div>
        </aside>
        <div class="workspace">
          <header class="topbar">
            <span class="mode-chip" id="mode-chip" hidden>${t('history.topbarChip')}</span>
            ${sandbox ? `<span class="mode-chip mode-chip--sandbox">${t('sandbox.modeBadge')}</span>` : ''}
            <div id="clock-slot">${clockHtml()}</div>
            <div id="acct-slot">${accountHtml()}</div>
            <div class="topbar__tools">
              <button class="lang-btn" type="button" id="lang-toggle">${icon('globe', { size: 15 })} <span>${i18n.locale === 'en' ? '中文' : 'EN'}</span></button>
              <button class="icon-btn icon-btn--ghost" type="button" id="go-settings" title="${t('nav.settings')}">${icon('settings', { size: 17 })}</button>
            </div>
          </header>
          <div class="tape">
            <span class="tape__label">${t('shell.marketTape')}</span>
            <div class="tape__track" id="tape-track">${tapeHtml()}</div>
          </div>
          <main class="view" id="view"></main>
        </div>
      </div>`;
  }

  function mount(root) {
    rootEl = root;
    rootEl.innerHTML = frameHtml();
    navEl = rootEl.querySelector('#rail-nav');
    footerEl = rootEl.querySelector('#rail-footer');
    tapeTrack = rootEl.querySelector('#tape-track');
    viewEl = rootEl.querySelector('#view');

    rootEl.addEventListener('click', (event) => {
      const clockButton = event.target.closest('[data-clock]');
      if (clockButton) {
        if (clockButton.dataset.clock === 'toggle') actions.toggleClock();
        if (clockButton.dataset.clock === 'next') actions.nextDay();
        refreshClock();
        return;
      }
      const speedButton = event.target.closest('[data-speed]');
      if (speedButton) {
        actions.setSpeed(Number(speedButton.dataset.speed));
        refreshClock();
        return;
      }
      const tapeButton = event.target.closest('[data-tape]');
      if (tapeButton) {
        router.go(`/trade/${tapeButton.dataset.tape}`);
        return;
      }
      if (event.target.closest('#lang-toggle')) {
        actions.setLocale(i18n.otherLocale());
        return;
      }
      if (event.target.closest('#go-settings')) {
        router.go('/settings');
      }
      if (event.target.closest('[data-sandbox-exit]')) {
        actions.exitSandbox();
      }
    });
  }

  function refreshClock() {
    const slot = rootEl?.querySelector('#clock-slot');
    if (slot) slot.innerHTML = clockHtml();
    const dot = rootEl?.querySelector('#clock-dot');
    if (dot) dot.classList.toggle('is-live', Boolean(clock.running));
  }

  function updateAccount() {
    const state = store.get();
    const total = equity(state.account, state.market.quotes);
    const prevValue = state.account.cash
      + Object.entries(state.account.positions).reduce((sum, [ticker, pos]) => {
        const quote = state.market.quotes[ticker];
        return sum + (quote ? pos.qty * quote.prevClose : 0);
      }, 0);
    const dayChange = total - prevValue;
    const dayPct = prevValue ? (dayChange / prevValue) * 100 : 0;
    const equityNode = rootEl?.querySelector('#acct-equity');
    const changeNode = rootEl?.querySelector('#acct-change');
    if (equityNode) equityNode.textContent = money(total, i18n.locale);
    if (changeNode) {
      changeNode.textContent = `${pct(dayPct, i18n.locale, 2)} · ${money(dayChange, i18n.locale)}`;
      changeNode.classList.toggle('up', dayChange > 0);
      changeNode.classList.toggle('down', dayChange < 0);
      changeNode.classList.toggle('flat', dayChange === 0);
    }
  }

  function updateClockMeta() {
    const state = store.get();
    const dateNode = rootEl?.querySelector('#clock-date');
    const sessionNode = rootEl?.querySelector('#clock-session');
    if (dateNode) dateNode.textContent = formatMarketDate(state.market.day, i18n.locale);
    if (sessionNode) sessionNode.textContent = `${sessionClock(state.market.tick)} · ${t('clock.day', { day: state.market.day + 1 })}`;
    const dot = rootEl?.querySelector('#clock-dot');
    if (dot) dot.classList.toggle('is-live', Boolean(clock.running));
    const toggle = rootEl?.querySelector('#clock-toggle');
    if (toggle) toggle.innerHTML = icon(clock.running ? 'pause' : 'play', { size: 16 });
    rootEl?.querySelectorAll('[data-speed]').forEach((button) => {
      button.classList.toggle('is-active', clock.running && Number(button.dataset.speed) === clock.speed);
    });
  }

  function updateTape() {
    const state = store.get();
    if (!tapeTrack) return;
    for (const quote of Object.values(state.market.quotes)) {
      const chip = tapeTrack.querySelector(`[data-tape="${quote.ticker}"]`);
      if (!chip) continue;
      const price = chip.querySelector('.tape-chip__price');
      const change = chip.querySelector('.tape-chip__change');
      if (price) price.textContent = money(quote.last, i18n.locale);
      if (change) {
        change.textContent = pct(quote.changePct, i18n.locale, 2);
        change.classList.toggle('up', quote.changePct > 0);
        change.classList.toggle('down', quote.changePct < 0);
        change.classList.toggle('flat', quote.changePct === 0);
      }
    }
  }

  function updateNavActive() {
    if (!navEl) return;
    const active = currentSection(router.current);
    navEl.querySelectorAll('[data-nav]').forEach((node) => {
      node.classList.toggle('is-active', node.dataset.nav === active);
    });
    const state = store.get();
    navEl.querySelectorAll('[data-nav]').forEach((node) => {
      const item = NAV_ITEMS.find((entry) => entry.id === node.dataset.nav);
      const locked = item?.toolId
        ? !isToolUnlocked(state, item.toolId)
        : item?.requiresUnit
          ? !isUnitComplete(state, item.requiresUnit)
          : Boolean(item?.locked);
      node.classList.toggle('is-locked', locked);
    });
    applyHistoryMode(active);
  }

  function applyHistoryMode(section = currentSection(router.current)) {
    if (!rootEl) return;
    const historyMode = section === 'history';
    const clockSlot = rootEl.querySelector('#clock-slot');
    const acctSlot = rootEl.querySelector('#acct-slot');
    const tape = rootEl.querySelector('.tape');
    const chip = rootEl.querySelector('#mode-chip');
    if (clockSlot) clockSlot.hidden = historyMode;
    if (acctSlot) acctSlot.hidden = historyMode;
    if (tape) tape.hidden = historyMode;
    if (chip) chip.hidden = !historyMode;
  }

  function refresh() {
    if (!rootEl) return;
    navEl.innerHTML = navHtml();
    footerEl.innerHTML = footerHtml();
    updateNavActive();
    const brand = rootEl.querySelector('.brand-text');
    if (brand) {
      brand.innerHTML = `<strong>${t('app.name')}</strong><span>${t('app.tagline')}</span>`;
    }
    const lang = rootEl.querySelector('#lang-toggle span');
    if (lang) lang.textContent = i18n.locale === 'en' ? '中文' : 'EN';
    const tapeLabel = rootEl.querySelector('.tape__label');
    if (tapeLabel) tapeLabel.textContent = t('shell.marketTape');
    const acctSlot = rootEl.querySelector('#acct-slot');
    if (acctSlot) acctSlot.innerHTML = accountHtml();
    tapeTrack.innerHTML = tapeHtml();
    refreshClock();
    updateAccount();
    applyHistoryMode();
  }

  function onTick() {
    updateAccount();
    updateClockMeta();
    updateTape();
  }

  function onState() {
    updateNavActive();
    footerEl.innerHTML = footerHtml();
    if (tapeTrack) tapeTrack.innerHTML = tapeHtml();
  }

  return {
    mount,
    refresh,
    updateNavActive,
    onTick,
    onState,
    syncClock: refreshClock,
    get viewEl() {
      return viewEl;
    },
    get railEl() {
      return rootEl?.querySelector('#rail');
    },
    TICKS_PER_DAY,
    moneyCompact,
  };
}
