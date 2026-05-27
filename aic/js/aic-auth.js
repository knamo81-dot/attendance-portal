/* AIC auth bridge | tenant/company session ready
   - 포탈 부모 portalSession 우선 사용
   - portal-auth / portal-session-ready / portal-company-changed 메시지 수신
   - AIC 전역 인증 컨텍스트(window.aicAuth) 표준화
*/
(function () {
  'use strict';

  function safeParent(fn) {
    try {
      if (window.parent && window.parent !== window) return fn(window.parent);
    } catch (_) {}
    return null;
  }

  function readQuery() {
    var q = new URLSearchParams(location.search);
    return {
      email: q.get('email') || q.get('portalEmail') || q.get('portal_email') || '',
      name: q.get('name') || q.get('portalName') || q.get('portal_name') || '',
      company_id: q.get('company_id') || q.get('companyId') || '',
      company_code: q.get('company_code') || q.get('companyCode') || '',
      company_name: q.get('company_name') || q.get('companyName') || '',
      role: q.get('role') || ''
    };
  }

  function getParentPortalSession() {
    return safeParent(function (parent) {
      if (typeof parent.getPortalSession === 'function') return parent.getPortalSession();
      return parent.portalSession || parent.currentPortalSession || null;
    }) || window.portalSession || window.currentPortalSession || null;
  }

  function resolveCompanyId(session, company, user, query) {
    return String(
      session?.activeCompanyId ||
      session?.active_company_id ||
      session?.selectedCompanyId ||
      session?.selected_company_id ||
      session?.companyId ||
      session?.company_id ||
      session?.company?.id ||
      session?.company?.company_id ||
      session?.profile?.company_id ||
      company?.id ||
      company?.company_id ||
      user?.company_id ||
      user?.companyId ||
      query?.company_id ||
      window.currentCompanyId ||
      ''
    ).trim();
  }

  function normalizeAuth(input) {
    input = input || {};
    var query = readQuery();
    var session = input.session || getParentPortalSession() || {};
    var company = input.company || session.activeCompany || session.active_company || session.company || null;
    var user = input.user || session.user || session.profile || {};

    var email = String(
      user.email ||
      session.email ||
      session.user?.email ||
      session.profile?.email ||
      query.email ||
      ''
    ).trim();

    var name = String(
      user.name ||
      user.user_name ||
      session.profile?.name ||
      session.user?.name ||
      session.user_name ||
      query.name ||
      (email ? email.split('@')[0] : '사용자')
    ).trim();

    var companyId = resolveCompanyId(session, company, user, query);
    var companyCode = String(
      session.activeCompanyCode || session.active_company_code ||
      session.companyCode || session.company_code ||
      company?.company_code || company?.code ||
      user.company_code || user.companyCode ||
      query.company_code ||
      window.currentCompanyCode ||
      ''
    ).trim();
    var companyName = String(
      session.activeCompanyName || session.active_company_name ||
      session.companyName || session.company_name ||
      company?.company_name || company?.name ||
      user.company_name || user.companyName ||
      query.company_name ||
      window.currentCompanyName ||
      ''
    ).trim();
    var role = String(user.role || session.role || query.role || window.currentUserRole || 'viewer').trim() || 'viewer';

    var normalizedUser = Object.assign({}, user, {
      email: email,
      name: name,
      role: role,
      company_id: companyId,
      companyId: companyId,
      company_code: companyCode,
      companyCode: companyCode,
      company_name: companyName,
      companyName: companyName
    });

    var normalizedCompany = Object.assign({}, company || {}, {
      id: companyId || company?.id || '',
      company_id: companyId || company?.company_id || '',
      company_code: companyCode || company?.company_code || '',
      company_name: companyName || company?.company_name || ''
    });

    var mergedSession = Object.assign({}, session, {
      user: session.user || normalizedUser,
      profile: session.profile || normalizedUser,
      role: role,
      company: normalizedCompany,
      activeCompany: normalizedCompany,
      active_company: normalizedCompany,
      companyId: companyId,
      company_id: companyId,
      activeCompanyId: companyId,
      active_company_id: companyId,
      companyCode: companyCode,
      company_code: companyCode,
      companyName: companyName,
      company_name: companyName,
      supabase: session.supabase || safeParent(function (parent) { return parent.portalSupabase; }) || window.portalSupabase || null
    });

    return {
      user: normalizedUser,
      company: normalizedCompany,
      session: mergedSession
    };
  }

  function publishAuth(input) {
    var auth = normalizeAuth(input || {});
    window.aicAuth = auth;
    window.portalSession = auth.session;
    window.currentPortalSession = auth.session;
    window.currentCompanyId = auth.session.companyId || '';
    window.currentCompanyCode = auth.session.companyCode || '';
    window.currentCompanyName = auth.session.companyName || '';
    window.currentUserRole = auth.session.role || 'viewer';
    window.dispatchEvent(new CustomEvent('aic-auth-ready', { detail: auth }));
    if (typeof window.aicRender === 'function') window.aicRender();
    if (typeof window.aicReloadFromServer === 'function') window.aicReloadFromServer();
    return auth;
  }

  window.getAicAuth = function getAicAuth() {
    return publishAuth(window.aicAuth || {});
  };

  window.aicAuth = normalizeAuth({});

  window.addEventListener('message', function (event) {
    var data = event && event.data ? event.data : {};
    if (
      data.type === 'portal-auth' ||
      data.type === 'PORTAL_AUTH_USER' ||
      data.type === 'portal-session-ready' ||
      data.type === 'portal-session-changed' ||
      data.type === 'portal-active-company-changed' ||
      data.type === 'portal-company-changed'
    ) {
      publishAuth({
        user: data.user || data.payload || data.profile || null,
        company: data.company || null,
        session: data.session || data.detail || null
      });
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { publishAuth({}); }, { once: true });
  } else {
    publishAuth({});
  }

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'portal-auth-request', app: 'aic', source: 'aic' }, '*');
      window.parent.postMessage({ type: 'portal-session-request', app: 'aic', source: 'aic' }, '*');
    }
  } catch (_) {}
})();
