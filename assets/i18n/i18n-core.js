(function () {
  'use strict';

  const I18N = {
    currentLang: 'ko',
    translations: {},

    async load(lang = 'ko') {
      try {
        const response = await fetch(`../assets/i18n/locales/${lang}.json`);
        this.translations = await response.json();
        this.currentLang = lang;

        this.apply();
      } catch (error) {
        console.error('[i18n] load error:', error);
      }
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
    },

    async changeLanguage(lang) {
      await this.load(lang);
      localStorage.setItem('portal_lang', lang);
    },

    init() {
      const saved = localStorage.getItem('portal_lang') || 'ko';
      this.load(saved);
    }
  };

  window.I18N = I18N;
})();
