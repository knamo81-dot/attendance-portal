/* AIC config
   포탈 상단 subtab은 사용하지 않는 단순 채팅형 모듈입니다.
   그래도 포탈 통신 규격을 맞추기 위해 빈 tabs를 전달합니다.
*/
(function () {
  'use strict';

  window.AIC_CONFIG = {
    source: 'aic',
    tabs: [],
    defaultSettings: {
      defaultLang: 'ko',
      direction: 'auto',
      tone: 'business',
      display: 'both',
      autoTranslate: true
    }
  };

  window.portalTabs = window.AIC_CONFIG.tabs;
})();
