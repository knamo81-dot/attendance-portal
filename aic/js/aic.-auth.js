/* AIC auth bridge
   포탈 index의 postAuthToFrame()에서 전달하는 portal-auth를 수신합니다.
*/
(function () {
  'use strict';

  function readQuery() {
    var q = new URLSearchParams(location.search);
    return {
      email: q.get('email') || '',
      company_id: q.get('company_id') || q.get('companyId') || '',
      company_code: q.get('company_code') || q.get('companyCode') || '',
      company_name: q.get('company_name') || q.get('companyName') || '',
      role: q.get('role') || ''
    };
  }

  function fallbackUser() {
    var q = readQuery();
    return {
      email: q.email,
      company_id: q.company_id,
      company_code: q.company_code,
      company_name: q.company_name,
      role: q.role || 'viewer',
      name: q.email ? q.email.split('@')[0] : '사용자'
    };
  }

  window.aicAuth = {
    user: fallbackUser(),
    company: null
  };

  window.addEventListener('message', function (event) {
    var data = event && event.data ? event.data : {};

    if (data.type === 'portal-auth') {
      window.aicAuth.user = data.user || window.aicAuth.user;
      window.aicAuth.company = data.company || null;

      if (!window.aicAuth.user.name && window.aicAuth.user.email) {
        window.aicAuth.user.name = String(window.aicAuth.user.email).split('@')[0];
      }

      if (typeof window.aicRender === 'function') {
        window.aicRender();
      }
    }
  });
})();
