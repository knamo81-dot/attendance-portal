/* AIC portal bridge
   포탈 index의 portal-tabs-request 규격에 응답합니다.
*/
(function () {
  'use strict';

  function notifyTabsReady() {
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage({
      type: 'portal-tabs-ready',
      source: 'aic',
      tabs: [],
      activeTabId: ''
    }, '*');
  }

  window.aicNotifyTabsReady = notifyTabsReady;

  window.addEventListener('message', function (event) {
    var data = event && event.data ? event.data : {};
    if (data.type === 'portal-tabs-request') {
      notifyTabsReady();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', notifyTabsReady);
  } else {
    notifyTabsReady();
  }

  setTimeout(notifyTabsReady, 300);
  setTimeout(notifyTabsReady, 1000);
})();
