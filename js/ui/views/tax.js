/**
 * Tax Lab: an educational UK 2026/27 estimate for the simulated share ledger.
 * The page is read-only; it never changes cash, positions or the save file.
 */
import { num } from '../../core/format.js';
import { pageHead, card, statCard, table, keyValueList } from '../kit.js';
import { esc } from '../dom.js';
import { formatMarketDate } from '../../market/calendar.js';
import { COMPANIES } from '../../data/companies.js';
import { estimateUkTax } from '../../tax/ukTaxEngine.js';

const UK_SHARE_TICKERS = COMPANIES
  .filter((company) => !company.isEtf)
  .map((company) => company.ticker);

function gbp(value, locale, digits = 2) {
  const safe = Number.isFinite(value) ? value : 0;
  const sign = safe < 0 ? '-' : '';
  return `${sign}£${num(Math.abs(safe), locale, digits)}`;
}

function signedGbp(value, locale) {
  const safe = Number.isFinite(value) ? value : 0;
  const sign = safe > 0 ? '+' : safe < 0 ? '-' : '';
  return `${sign}£${num(Math.abs(safe), locale, 2)}`;
}

export function createTaxView(ctx) {
  const { i18n, store } = ctx;
  const t = (key, params) => i18n.t(key, params);
  let container;
  let onChange = null;
  let onSubmit = null;

  function configDefaults() {
    return {
      accountType: 'gia',
      incomeBand: 'basic',
      taxableIncome: 0,
      fxRate: 0.79,
      isaContributions: 0,
      ukShares: true,
    };
  }

  function readConfig() {
    const defaults = configDefaults();
    const form = container && container.querySelector('[data-tax-form]');
    if (!form) return defaults;
    const el = (name) => form.elements[name];
    return {
      accountType: el('accountType') ? el('accountType').value : defaults.accountType,
      incomeBand: el('incomeBand') ? el('incomeBand').value : defaults.incomeBand,
      taxableIncome: el('taxableIncome') ? Number(el('taxableIncome').value) : defaults.taxableIncome,
      fxRate: el('fxRate') ? Number(el('fxRate').value) : defaults.fxRate,
      isaContributions: el('isaContributions') ? Number(el('isaContributions').value) : defaults.isaContributions,
      ukShares: el('ukShares') ? el('ukShares').checked : defaults.ukShares,
    };
  }

  function summaryCards(result) {
    const locale = i18n.locale;
    return `
      <div class="stat-grid">
        ${statCard({
          label: t('tax.cgt'),
          value: gbp(result.summary.cgt, locale),
          sub: t('tax.cgtSub'),
          iconName: 'trading',
          id: 'tax-cgt',
        })}
        ${statCard({
          label: t('tax.dividendTax'),
          value: gbp(result.summary.dividendTax, locale),
          sub: t('tax.dividendTaxSub'),
          iconName: 'news',
          id: 'tax-dividend',
        })}
        ${statCard({
          label: t('tax.sdrt'),
          value: gbp(result.summary.sdrt, locale),
          sub: t('tax.sdrtSub'),
          iconName: 'market',
          id: 'tax-sdrt',
        })}
        ${statCard({
          label: t('tax.totalTax'),
          value: gbp(result.summary.totalTax, locale),
          sub: t('tax.totalTaxSub'),
          iconName: 'portfolio',
          id: 'tax-total',
        })}
      </div>`;
  }

  function cgtCard(result) {
    const locale = i18n.locale;
    const rows = [
      [t('tax.grossProceeds'), gbp(result.cgt.grossProceeds, locale)],
      [t('tax.allowableCosts'), gbp(result.cgt.allowableCosts, locale)],
      [t('tax.gains'), gbp(result.cgt.gains, locale)],
      [t('tax.losses'), gbp(result.cgt.losses, locale)],
      [t('tax.netGain'), gbp(result.cgt.netGain, locale)],
      [t('tax.aea'), gbp(result.cgt.annualExemptAmountUsed, locale)],
      [t('tax.taxableGain'), gbp(result.cgt.taxableGain, locale)],
      [t('tax.basicSlice'), `${gbp(result.cgt.basicPart, locale)} · ${gbp(result.cgt.basicTax, locale)}`],
      [t('tax.higherSlice'), `${gbp(result.cgt.higherPart, locale)} · ${gbp(result.cgt.higherTax, locale)}`],
      [t('tax.cgtDue'), gbp(result.cgt.tax, locale)],
    ];
    return card({
      title: t('tax.cgtTitle'),
      subtitle: t('tax.cgtSubtitle'),
      body: `${result.cgt.exempt ? `<p class="pill pill--ok">${t('tax.isaExempt')}</p>` : ''}${keyValueList(rows)}`,
    });
  }

  function disposalsCard(result) {
    const locale = i18n.locale;
    return card({
      title: t('tax.disposalsTitle'),
      subtitle: t('tax.disposalsSubtitle', { count: result.disposals.length }),
      body: table({
        head: [
          t('tax.date'),
          t('tax.ticker'),
          t('tax.quantity'),
          t('tax.proceeds'),
          t('tax.costBasis'),
          t('tax.gain'),
          t('tax.matching'),
        ],
        rows: result.disposals.map((row) => `
          <tr>
            <td>${formatMarketDate(row.day, locale)}</td>
            <td>${esc(row.ticker)}</td>
            <td class="num">${num(row.qty, locale, 0)}</td>
            <td class="num">${gbp(row.proceeds, locale)}</td>
            <td class="num">${gbp(row.costBasis, locale)}</td>
            <td class="num ${row.gain > 0 ? 'up' : row.gain < 0 ? 'down' : ''}">${signedGbp(row.gain, locale)}</td>
            <td class="muted">${t('tax.matchDetail', {
              sameDay: num(row.matches.sameDay.qty, locale, 0),
              thirtyDay: num(row.matches.thirtyDay.qty, locale, 0),
              pool: num(row.matches.pool.qty, locale, 0),
            })}</td>
          </tr>`),
        empty: `<p class="muted">${t('tax.noDisposals')}</p>`,
      }),
    });
  }

  function dividendsCard(result) {
    const locale = i18n.locale;
    const summary = keyValueList([
      [t('tax.dividendGross'), gbp(result.dividends.gross, locale)],
      [t('tax.dividendAllowance'), gbp(result.dividends.allowanceUsed, locale)],
      [t('tax.dividendTaxable'), gbp(result.dividends.taxable, locale)],
      [t('tax.dividendBasic'), `${gbp(result.dividends.basicPart, locale)} · ${gbp(result.dividends.basicTax, locale)}`],
      [t('tax.dividendHigher'), `${gbp(result.dividends.higherPart, locale)} · ${gbp(result.dividends.higherTax, locale)}`],
      [t('tax.dividendAdditional'), `${gbp(result.dividends.additionalPart, locale)} · ${gbp(result.dividends.additionalTax, locale)}`],
      [t('tax.dividendTaxDue'), gbp(result.dividends.tax, locale)],
    ]);
    const rows = result.dividends.rows.map((row) => `
      <tr>
        <td>${formatMarketDate(row.day, locale)}</td>
        <td>${esc(row.ticker)}</td>
        <td class="num">${gbp(row.amount, locale)}</td>
      </tr>`);
    return card({
      title: t('tax.dividendsTitle'),
      subtitle: t('tax.dividendsSubtitle'),
      body: `
        ${result.dividends.exempt ? `<p class="pill pill--ok">${t('tax.isaExempt')}</p>` : ''}
        ${summary}
        ${rows.length ? table({
          head: [t('tax.date'), t('tax.ticker'), t('tax.dividendAmount')],
          rows,
        }) : `<p class="muted">${t('tax.noDividends')}</p>`}`,
    });
  }

  function isaCard(result) {
    const locale = i18n.locale;
    const monthly = keyValueList([
      [t('tax.isaAllowance'), gbp(result.isa.allowance, locale)],
      [t('tax.isaUsed'), gbp(result.isa.contributions, locale)],
      [t('tax.isaRemaining'), gbp(result.isa.remaining, locale)],
      [t('tax.isaExcess'), gbp(result.isa.excess, locale)],
    ]);
    return card({
      title: t('tax.isaTitle'),
      subtitle: t('tax.isaNote'),
      body: monthly,
    });
  }

  function warningsCard(result) {
    if (!result.warnings.length) return '';
    return card({
      title: t('tax.warningTitle'),
      body: `<ul class="tax-list">${result.warnings.map((warning) => (
        `<li>${t(`tax.warning.${warning.code}`, warning.params)}</li>`
      )).join('')}</ul>`,
    });
  }

  function aboutCard(result) {
    return card({
      title: t('tax.aboutTitle'),
      subtitle: t('tax.aboutSubtitle'),
      body: `
        <p class="muted">${t('tax.disclaimer')}</p>
        <ul class="tax-list">${result.limitations.map((code) => `<li>${t(`tax.limitation.${code}`)}</li>`).join('')}</ul>
        <div class="tax-sources">
          ${result.sources.map((source) => (
            `<a class="link-btn" href="${source.url}" target="_blank" rel="noopener noreferrer">${t(`tax.source.${source.id}`)} ↗</a>`
          )).join('')}
        </div>`,
    });
  }

  function renderResults(state = store.get()) {
    const target = container && container.querySelector('#tax-results');
    if (!target) return;
    const config = readConfig();
    const result = estimateUkTax({
      taxYear: '2026/27',
      accountType: config.accountType,
      incomeBand: config.incomeBand,
      taxableIncome: config.taxableIncome,
      trades: state.account.trades || [],
      dividends: state.account.dividends || [],
      isaContributions: config.isaContributions,
      fxRate: config.fxRate,
      currency: 'USD',
      ukShareTickers: config.ukShares ? UK_SHARE_TICKERS : [],
    });
    if (!result.ok) {
      target.innerHTML = card({
        title: t('tax.errorTitle'),
        body: `<p class="muted">${t(result.error)}</p><p class="muted">${t('tax.errorHint')}</p>`,
      });
      return;
    }
    const empty = !(state.account.trades || []).length && !(state.account.dividends || []).length;
    target.innerHTML = `
      ${empty ? `<p class="muted tax-empty">${t('tax.empty')}</p>` : ''}
      ${summaryCards(result)}
      ${cgtCard(result)}
      ${disposalsCard(result)}
      ${dividendsCard(result)}
      ${isaCard(result)}
      ${warningsCard(result)}
      ${aboutCard(result)}`;
  }

  function formCard() {
    const config = configDefaults();
    return card({
      title: t('tax.formTitle'),
      subtitle: t('tax.formSubtitle'),
      body: `
        <form class="tax-form" data-tax-form>
          <label class="field">
            <span class="field-label">${t('tax.accountType')}</span>
            <select class="input input--select" name="accountType">
              <option value="gia">${t('tax.gia')}</option>
              <option value="isa">${t('tax.isaOption')}</option>
            </select>
          </label>
          <label class="field">
            <span class="field-label">${t('tax.incomeBand')}</span>
            <select class="input input--select" name="incomeBand">
              <option value="basic">${t('tax.bandBasic')}</option>
              <option value="higher">${t('tax.bandHigher')}</option>
              <option value="additional">${t('tax.bandAdditional')}</option>
            </select>
          </label>
          <label class="field">
            <span class="field-label">${t('tax.taxableIncome')}</span>
            <input class="input" type="number" name="taxableIncome" min="0" step="1" value="${config.taxableIncome}">
            <span class="muted">${t('tax.taxableIncomeHint')}</span>
          </label>
          <label class="field">
            <span class="field-label">${t('tax.fxRate')}</span>
            <input class="input" type="number" name="fxRate" min="0.01" step="0.0001" value="${config.fxRate}">
            <span class="muted">${t('tax.fxRateHint')}</span>
          </label>
          <label class="field">
            <span class="field-label">${t('tax.isaContributions')}</span>
            <input class="input" type="number" name="isaContributions" min="0" step="1" value="${config.isaContributions}">
            <span class="muted">${t('tax.isaHint')}</span>
          </label>
          <label class="switch-row field--wide">
            <input type="checkbox" name="ukShares" ${config.ukShares ? 'checked' : ''}>
            <span>
              <strong>${t('tax.ukShares')}</strong>
              <span class="muted">${t('tax.ukSharesHint')}</span>
            </span>
          </label>
          <div class="field--wide">
            <button class="btn btn--primary" type="submit">${t('tax.recalculate')}</button>
          </div>
        </form>`,
    });
  }

  function template() {
    return `
      <div class="tax-page">
        ${pageHead({
          eyebrow: t('tax.eyebrow'),
          title: t('tax.title'),
          subtitle: t('tax.subtitle'),
          actions: `<span class="pill pill--warn">${t('tax.estimateBadge')}</span>`,
        })}
        ${formCard()}
        <div id="tax-results"></div>
      </div>`;
  }

  function mount(target) {
    target.innerHTML = template();
    container = target.querySelector('.tax-page');
    const form = container.querySelector('[data-tax-form]');
    onChange = () => renderResults();
    onSubmit = (event) => {
      event.preventDefault();
      renderResults();
    };
    form.addEventListener('change', onChange);
    form.addEventListener('submit', onSubmit);
    renderResults();
  }

  function render(state) {
    renderResults(state);
  }

  function destroy() {
    const form = container && container.querySelector('[data-tax-form]');
    if (form && onChange) form.removeEventListener('change', onChange);
    if (form && onSubmit) form.removeEventListener('submit', onSubmit);
    onChange = null;
    onSubmit = null;
  }

  return { mount, render, destroy };
}
