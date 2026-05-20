(function () {
  'use strict';

  function getLocaleUrl(lang) {
    const path = window.location.pathname || '';
    const prefix = path.includes('/assets/') ? '../' : (path.split('/').length > 2 ? '../' : '');
    const candidates = [
      `${prefix}assets/i18n/locales/${lang}.json`,
      `../assets/i18n/locales/${lang}.json`,
      `assets/i18n/locales/${lang}.json`
    ];
    return candidates;
  }

  const I18N = {
    currentLang: 'ko',
    translations: {},

    async load(lang = 'ko') {
      const nextLang = String(lang || 'ko').trim() || 'ko';
      const urls = getLocaleUrl(nextLang);
      let lastError = null;

      for (const url of urls) {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          this.translations = await response.json();
          this.currentLang = nextLang;
          this.apply();
          return;
        } catch (error) {
          lastError = error;
        }
      }

      console.error('[i18n] load error:', lastError);
    },

    t(key) {
      return this.translations[key] || key;
    },

    apply() {
      document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.dataset.i18n;
        el.textContent = this.t(key);
      });

      document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.dataset.i18nPlaceholder;
        el.placeholder = this.t(key);
      });

      document.querySelectorAll('[data-i18n-title]').forEach((el) => {
        const key = el.dataset.i18nTitle;
        el.title = this.t(key);
      });
    },

    async changeLanguage(lang) {
      const nextLang = String(lang || 'ko').trim() || 'ko';
      await this.load(nextLang);
      localStorage.setItem('portal_lang', nextLang);
    },

    init() {
      let saved = localStorage.getItem('portal_lang') || 'ko';
      try {
        const parentSettings = window.parent?.getPortalSettings?.();
        saved = parentSettings?.language || parentSettings?.lang || saved;
      } catch (_) {}

      this.load(saved);
    }
  };

  window.I18N = I18N;

  window.addEventListener('message', function (event) {
    const payload = event?.data || {};
    if (payload.type !== 'portal-language-changed' && payload.type !== 'portal-auth') return;

    const lang = payload.language || payload.lang || payload.settings?.language || payload.settings?.lang || payload.user?.language || payload.user?.preferred_language;
    if (!lang) return;
    I18N.changeLanguage(lang);
  });

  document.addEventListener('DOMContentLoaded', function () {
    I18N.init();
  });
})();
