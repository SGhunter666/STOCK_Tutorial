/**
 * First-run onboarding: the player chooses a language, then the simulated
 * account is created. No state exists yet, so this screen only depends on i18n.
 */
export function showOnboarding({ appRoot, i18n, initialLocale }) {
  i18n.setLocale(initialLocale);
  document.documentElement.lang = initialLocale;

  return new Promise((resolve) => {
    const t = (key, params) => i18n.t(key, params);

    function bind() {
      appRoot.querySelectorAll('[data-onboarding-lang]').forEach((button) => {
        button.addEventListener('click', () => {
          const locale = button.dataset.onboardingLang;
          if (i18n.locale === locale) return;
          i18n.setLocale(locale);
          document.documentElement.lang = locale;
          render();
        });
      });
      appRoot.querySelector('#onboarding-start')?.addEventListener('click', () => {
        resolve({ locale: i18n.locale });
      });
    }

    function render() {
      appRoot.innerHTML = `
        <div class="onboarding">
          <div class="onboarding__panel">
            <div class="onboarding__brand">
              <span class="boot-mark">SMA</span>
              <div>
                <strong>Stock Market Academy</strong>
                <span class="muted">Financial Empire</span>
              </div>
            </div>
            <p class="eyebrow">${t('onboarding.eyebrow')}</p>
            <h1 class="onboarding__title">${t('onboarding.title')}</h1>
            <p class="onboarding__intro">${t('onboarding.intro')}</p>
            <span class="field-label">${t('onboarding.languageTitle')}</span>
            <div class="onboarding__langs">
              <button class="onboarding__lang ${i18n.locale === 'zh-CN' ? 'is-active' : ''}" type="button" data-onboarding-lang="zh-CN">
                <span class="language-card__code">zh-CN</span>
                <strong>简体中文</strong>
                <span class="muted">${t('onboarding.languageZhNote')}</span>
              </button>
              <button class="onboarding__lang ${i18n.locale === 'en' ? 'is-active' : ''}" type="button" data-onboarding-lang="en">
                <span class="language-card__code">en</span>
                <strong>English</strong>
                <span class="muted">${t('onboarding.languageEnNote')}</span>
              </button>
            </div>
            <ul class="onboarding__points">
              <li>${t('onboarding.point1')}</li>
              <li>${t('onboarding.point2')}</li>
              <li>${t('onboarding.point3')}</li>
            </ul>
            <button class="btn btn--primary btn--block" type="button" id="onboarding-start">${t('onboarding.start')}</button>
            <p class="onboarding__note muted">${t('onboarding.note')}</p>
          </div>
        </div>`;
      bind();
    }

    render();
  });
}
