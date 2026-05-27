/* portal-home-auth.js | iframe tenant session bridge
   - 업무 iframe 내부 로그인/회사검증 제거
   - 최상위 포탈(index.html)의 portalSession만 사용
   - 하위 업무 앱에 company_id / activeCompanyId / role / supabase 제공 */
(function () {
  'use strict';

  const SUPABASE_URL = "https://mbqpsovlwvedwrtbbauj.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";

  function getParentPortalSession() {
    try {
      if (window.parent && window.parent !== window && typeof window.parent.getPortalSession === 'function') {
        return window.parent.getPortalSession();
      }
    } catch (_) {}

    try {
      if (window.parent && window.parent !== window && window.parent.portalSession) {
        return window.parent.portalSession;
      }
    } catch (_) {}

    return window.portalSession || window.currentPortalSession || null;
  }

  function getSupabaseClient(session) {
    try {
      if (session && session.supabase) return session.supabase;
      if (window.parent && window.parent !== window && window.parent.portalSupabase) return window.parent.portalSupabase;
    } catch (_) {}

    if (window.portalSupabase) return window.portalSupabase;

    if (window.supabase && typeof window.supabase.createClient === 'function') {
      window.portalSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return window.portalSupabase;
    }

    return null;
  }

  function resolveActiveCompany(session) {
    const activeCompany =
      session?.activeCompany ||
      session?.active_company ||
      session?.selectedCompany ||
      session?.selected_company ||
      session?.company ||
      null;

    const activeCompanyId =
      session?.activeCompanyId ||
      session?.active_company_id ||
      session?.selectedCompanyId ||
      session?.selected_company_id ||
      activeCompany?.id ||
      activeCompany?.company_id ||
      session?.companyId ||
      session?.company_id ||
      session?.profile?.company_id ||
      null;

    const activeCompanyName =
      session?.activeCompanyName ||
      session?.active_company_name ||
      session?.selectedCompanyName ||
      session?.selected_company_name ||
      activeCompany?.company_name ||
      activeCompany?.name ||
      session?.companyName ||
      session?.company_name ||
      session?.company?.company_name ||
      null;

    const activeCompanyCode =
      session?.activeCompanyCode ||
      session?.active_company_code ||
      activeCompany?.company_code ||
      session?.companyCode ||
      session?.company_code ||
      session?.company?.company_code ||
      null;

    const activeCompanySubdomain =
      session?.activeCompanySubdomain ||
      session?.active_company_subdomain ||
      activeCompany?.subdomain ||
      session?.companySubdomain ||
      session?.company_subdomain ||
      session?.company?.subdomain ||
      null;

    return {
      company: activeCompany || session?.company || null,
      companyId: activeCompanyId,
      companyName: activeCompanyName,
      companyCode: activeCompanyCode,
      companySubdomain: activeCompanySubdomain
    };
  }

  function buildChildSession(parentSession) {
    const session = parentSession || getParentPortalSession() || {};
    const sb = getSupabaseClient(session);
    const active = resolveActiveCompany(session);
    const role = session.role || session.profile?.role || 'viewer';

    return {
      ...session,
      user: session.user || null,
      profile: session.profile || null,
      role,
      supabase: sb,
      company: active.company,
      activeCompany: active.company,
      active_company: active.company,
      companyId: active.companyId,
      company_id: active.companyId,
      activeCompanyId: active.companyId,
      active_company_id: active.companyId,
      companyName: active.companyName,
      company_name: active.companyName,
      activeCompanyName: active.companyName,
      active_company_name: active.companyName,
      companyCode: active.companyCode,
      company_code: active.companyCode,
      activeCompanyCode: active.companyCode,
      active_company_code: active.companyCode,
      companySubdomain: active.companySubdomain,
      company_subdomain: active.companySubdomain,
      activeCompanySubdomain: active.companySubdomain,
      active_company_subdomain: active.companySubdomain
    };
  }

  function publishSession(parentSession) {
    const session = buildChildSession(parentSession);

    window.portalSession = session;
    window.currentPortalSession = session;
    window.portalSupabase = session.supabase || window.portalSupabase || null;
    window.currentCompanyId = session.activeCompanyId || session.companyId || null;
    window.currentCompanyCode = session.activeCompanyCode || session.companyCode || null;
    window.currentCompanyName = session.activeCompanyName || session.companyName || null;
    window.currentCompanySubdomain = session.activeCompanySubdomain || session.companySubdomain || null;
    window.currentUserRole = session.role || 'viewer';

    window.dispatchEvent(new CustomEvent('portal-session-ready', { detail: session }));
    window.dispatchEvent(new CustomEvent('portal-company-changed', { detail: session }));
    return session;
  }

  function hideInternalAuthOverlay() {
    document.body.classList.remove('auth-loading');

    const overlay = document.getElementById('authOverlay');
    const loginCard = document.getElementById('loginCard');
    const passwordCard = document.getElementById('passwordCard');
    const loginError = document.getElementById('loginError');

    if (overlay) overlay.hidden = true;
    if (loginCard) loginCard.hidden = true;
    if (passwordCard) passwordCard.hidden = true;
    if (loginError) {
      loginError.textContent = '';
      loginError.classList.remove('show');
    }
  }

  async function bootFromParentSession() {
    const session = publishSession();
    hideInternalAuthOverlay();

    if (!session || !session.user) {
      console.warn('[portal-home-auth] parent portal session is not ready yet.');
      return;
    }

    try {
      if (typeof window.loadPortalServerData === 'function') {
        await window.loadPortalServerData();
      }
    } catch (error) {
      console.error('[portal-home-auth] loadPortalServerData failed:', error);
    }
  }

  window.getPortalAuthContext = function getPortalAuthContext() {
    return buildChildSession();
  };

  window.getPortalSession = function getPortalSession() {
    return buildChildSession();
  };

  window.getCompanyAppUrl = function getCompanyAppUrl(appUrl) {
    const session = buildChildSession();
    const companyId = session.activeCompanyId || session.companyId || '';
    if (!appUrl || !companyId) return appUrl;
    const separator = String(appUrl).includes('?') ? '&' : '?';
    return `${appUrl}${separator}company_id=${encodeURIComponent(companyId)}`;
  };

  window.portalLogout = async function portalLogout() {
    try {
      if (window.parent && window.parent !== window && typeof window.parent.portalLogout === 'function') {
        await window.parent.portalLogout();
        return;
      }
      const session = buildChildSession();
      if (session.supabase && session.supabase.auth) {
        await session.supabase.auth.signOut();
      }
    } catch (error) {
      console.error('[portal-home-auth] logout failed:', error);
    }
  };

  window.addEventListener('message', function (event) {
    const payload = event && event.data ? event.data : {};
    if (
      payload.type === 'portal-session-ready' ||
      payload.type === 'portal-session-changed' ||
      payload.type === 'portal-active-company-changed' ||
      payload.type === 'portal-company-changed'
    ) {
      publishSession(payload.session || payload.detail || null);
      hideInternalAuthOverlay();
      if (typeof window.loadPortalServerData === 'function') {
        window.loadPortalServerData().catch((error) => console.error('[portal-home-auth] reload failed:', error));
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootFromParentSession, { once: true });
  } else {
    bootFromParentSession();
  }
})();
