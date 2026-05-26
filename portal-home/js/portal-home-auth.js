/* portal-home-auth.js | tenant hostname ready
   - users.company_id 조회
   - companies.company_code/company_name 조회
   - window.portalSession / window.currentCompanyId 전역 세션 제공
   - iframe 앱 전달용 querystring 생성 헬퍼 제공 */

(function(){
  const SUPABASE_URL = "https://mbqpsovlwvedwrtbbauj.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1icXBzb3Zsd3ZlZHdydGJiYXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTI2NTksImV4cCI6MjA5MTM4ODY1OX0.B3VWnRUn-A9hABLrx5ysFDQeAJvP_rTktzGiuz5LeTY";

  function initAuth() {
    const fallbackOverlay = document.getElementById('authOverlay');
    const fallbackLoginCard = document.getElementById('loginCard');
    const fallbackLoginError = document.getElementById('loginError');

    if (!window.supabase || !window.supabase.createClient) {
      document.body.classList.remove('auth-loading');
      if (fallbackOverlay) fallbackOverlay.hidden = false;
      if (fallbackLoginCard) fallbackLoginCard.hidden = false;
      if (fallbackLoginError) {
        fallbackLoginError.textContent = 'Supabase 라이브러리를 불러오지 못했습니다. 인터넷 연결 또는 브라우저 보안 설정을 확인해 주세요.';
        fallbackLoginError.classList.add('show');
      }
      return;
    }

    let supabaseClient = window.portalSupabase;
    if (!supabaseClient) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      window.portalSupabase = supabaseClient;
    }

    const els = {
      overlay: document.getElementById('authOverlay'),
      loginCard: document.getElementById('loginCard'),
      passwordCard: document.getElementById('passwordCard'),
      loginEmail: document.getElementById('loginEmail'),
      loginPassword: document.getElementById('loginPassword'),
      loginButton: document.getElementById('loginButton'),
      loginError: document.getElementById('loginError'),
      newPassword: document.getElementById('newPassword'),
      confirmPassword: document.getElementById('confirmPassword'),
      changePasswordButton: document.getElementById('changePasswordButton'),
      passwordError: document.getElementById('passwordError'),
      passwordSuccess: document.getElementById('passwordSuccess'),
      settingsNavBtn: document.getElementById('settingsNavBtn'),
      logoutNavBtn: document.getElementById('logoutNavBtn'),
      topUserBar: document.getElementById('topUserBar'),
      userChip: document.getElementById('userChip'),
      homeNavBtn: document.getElementById('homeNavBtn'),
      wastewaterNavBtn: document.getElementById('wastewaterNavBtn'),
      attendanceNavBtn: document.getElementById('attendanceNavBtn'),
      mealNavBtn: document.getElementById('mealNavBtn'),
      suppliesNavBtn: document.getElementById('suppliesNavBtn'),
      docsNavBtn: document.getElementById('docsNavBtn')
    };

    let currentProfile = null;
    let currentUser = null;
    let currentCompany = null;
    let currentRequestedCompany = null;
    let requestedCompanyPromise = null;
    let authBusy = false;

    const TENANT_BASE_DOMAIN = 'ops.exelolab.com';
    const currentTenantSubdomain = getTenantSubdomainFromHost();

    console.log('[Portal Tenant] 현재 HOST:', window.location.hostname);
    console.log('[Portal Tenant] 요청 회사 서브도메인:', currentTenantSubdomain || '(기본 주소)');

    function getTenantSubdomainFromHost() {
      const host = String(window.location.hostname || '').toLowerCase().replace(/:\d+$/, '');

      if (!host || host === 'localhost' || host === '127.0.0.1') return null;
      if (host === TENANT_BASE_DOMAIN) return null;

      const suffix = '.' + TENANT_BASE_DOMAIN;
      if (!host.endsWith(suffix)) return null;

      const beforeBaseDomain = host.slice(0, -suffix.length);
      const firstLabel = beforeBaseDomain.split('.').filter(Boolean)[0] || '';

      const reserved = new Set(['www', 'ops', 'app', 'apps', 'admin', 'login']);
      if (!firstLabel || reserved.has(firstLabel)) return null;

      return firstLabel;
    }

    function buildPortalSession() {
      const companyId = currentProfile?.company_id || currentCompany?.id || null;
      const companyCode = currentCompany?.company_code || currentProfile?.company_code || null;
      const companyName = currentCompany?.company_name || currentProfile?.company_name || null;
      const role = currentProfile?.role || 'viewer';

      return {
        user: currentUser,
        profile: currentProfile,
        company: currentCompany,
        companyId,
        company_id: companyId,
        companyCode,
        company_code: companyCode,
        companyName,
        company_name: companyName,
        requestedSubdomain: currentTenantSubdomain,
        requestedCompany: currentRequestedCompany,
        role,
        supabase: supabaseClient
      };
    }

    function publishPortalSession() {
      const session = buildPortalSession();
      window.portalSession = session;
      window.currentPortalSession = session;
      window.currentCompanyId = session.companyId;
      window.currentCompanyCode = session.companyCode;
      window.currentCompanyName = session.companyName;
      window.currentUserRole = session.role;
      window.dispatchEvent(new CustomEvent('portal-session-ready', { detail: session }));
      return session;
    }

    window.getPortalAuthContext = function getPortalAuthContext() {
      return buildPortalSession();
    };

    window.getPortalSession = function getPortalSession() {
      return buildPortalSession();
    };

    window.getCompanyAppUrl = function getCompanyAppUrl(appUrl) {
      const session = buildPortalSession();
      if (!appUrl || !session.companyId) return appUrl;
      const separator = String(appUrl).includes('?') ? '&' : '?';
      return `${appUrl}${separator}company_id=${encodeURIComponent(session.companyId)}`;
    };

    function setBoxMessage(target, message) {
      if (!target) return;
      target.textContent = message || '';
      target.classList.toggle('show', !!message);
    }


    function clearLoginInputs(options = {}) {
      const keepEmail = options.keepEmail === true;
      const clearEmail = !keepEmail;
      const fields = [els.loginPassword, els.newPassword, els.confirmPassword];

      if (clearEmail && els.loginEmail) {
        els.loginEmail.value = '';
        els.loginEmail.defaultValue = '';
        els.loginEmail.setAttribute('autocomplete', 'off');
      }

      fields.forEach((field) => {
        if (!field) return;
        field.value = '';
        field.defaultValue = '';
        field.setAttribute('autocomplete', 'new-password');
      });
    }

    function roleLabel(role) {
      if (role === 'admin') return '관리자';
      if (role === 'operator') return '운영자';
      if (role === 'supervisor') return '책임자';
      if (role === 'viewer') return '일반사용자';
      return '일반사용자';
    }

    function clearPortalSession() {
      currentProfile = null;
      currentCompany = null;
      window.portalSession = null;
      window.currentPortalSession = null;
      window.currentCompanyId = null;
      window.currentCompanyCode = null;
      window.currentCompanyName = null;
      window.currentUserRole = null;
    }

    function showLogin(message = '') {
      document.body.classList.add('auth-loading');
      clearLoginInputs();
      setTimeout(() => clearLoginInputs(), 80);
      setTimeout(() => clearLoginInputs(), 350);
      if (els.overlay) els.overlay.hidden = false;
      if (els.loginCard) els.loginCard.hidden = false;
      if (els.passwordCard) els.passwordCard.hidden = true;
      setBoxMessage(els.loginError, message);
      setBoxMessage(els.passwordError, '');
      setBoxMessage(els.passwordSuccess, '');
      if (els.topUserBar) els.topUserBar.hidden = true;
    }

    function showPasswordChange(message = '') {
      document.body.classList.add('auth-loading');
      if (els.overlay) els.overlay.hidden = false;
      if (els.loginCard) els.loginCard.hidden = true;
      if (els.passwordCard) els.passwordCard.hidden = false;
      setBoxMessage(els.passwordError, message);
      setBoxMessage(els.passwordSuccess, '');
    }

    function showPortal() {
      document.body.classList.remove('auth-loading');
      if (els.overlay) els.overlay.hidden = true;
      if (els.loginCard) els.loginCard.hidden = true;
      if (els.passwordCard) els.passwordCard.hidden = true;
    }

    function applyRoleUI(profile) {
      const role = profile?.role || 'viewer';
      state.page = 'home';

      if (els.topUserBar && els.userChip) {
        els.topUserBar.hidden = false;
        const displayName = profile?.name || currentUser?.email || '사용자';
        const companyLabel = currentCompany?.company_name ? `<span class="role">${currentCompany.company_name}</span>` : '';
        els.userChip.innerHTML = `<span>${displayName}</span>${companyLabel}<span class="role">${roleLabel(role)}</span>`;
      }
    }

    async function fetchCompany(companyId) {
      if (!companyId) return null;
      const { data, error } = await supabaseClient
        .from('companies')
        .select('id,company_name,company_code,subdomain,is_active')
        .eq('id', companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    }

    async function fetchCompanyBySubdomain(subdomain) {
      if (!subdomain) return null;
      const { data, error } = await supabaseClient
        .from('companies')
        .select('id,company_name,company_code,subdomain,is_active')
        .eq('subdomain', subdomain)
        .maybeSingle();
      if (error) throw error;
      return data;
    }

    async function loadRequestedCompany() {
      if (!currentTenantSubdomain) {
        currentRequestedCompany = null;
        return null;
      }

      const company = await fetchCompanyBySubdomain(currentTenantSubdomain);
      currentRequestedCompany = company || null;

      if (!company) {
        throw new Error(`등록되지 않은 접속주소입니다: ${currentTenantSubdomain}.ops.exelolab.com`);
      }

      if (company.is_active === false) {
        throw new Error(`비활성화된 회사 접속주소입니다: ${currentTenantSubdomain}.ops.exelolab.com`);
      }

      console.log('[Portal Tenant] 요청 회사:', company.company_name, company.id);
      return company;
    }

    function ensureRequestedCompanyLoaded() {
      if (!requestedCompanyPromise) {
        requestedCompanyPromise = loadRequestedCompany().catch((error) => {
          requestedCompanyPromise = null;
          throw error;
        });
      }
      return requestedCompanyPromise;
    }

    async function fetchProfile(email) {
      const { data, error } = await supabaseClient
        .from('users')
        .select('email,name,role,is_active,must_change_password,company_id')
        .eq('email', email)
        .maybeSingle();
      if (error) throw error;
      return data;
    }

    async function handleSession(user) {
      currentUser = user || null;
      currentProfile = null;
      currentCompany = null;

      try {
        await ensureRequestedCompanyLoaded();
      } catch (tenantError) {
        console.error('tenant resolve error:', tenantError);
        await supabaseClient.auth.signOut();
        clearPortalSession();
        showLogin(tenantError?.message || '접속 주소의 회사 정보를 확인하지 못했습니다.');
        return;
      }

      if (!user) {
        const injectedEmail = typeof getPortalInjectedEmail === 'function' ? getPortalInjectedEmail() : '';
        if (injectedEmail) {
          currentUser = { email: injectedEmail };
          try {
            const injectedProfile = await fetchProfile(injectedEmail);
            if (injectedProfile) {
              currentProfile = injectedProfile;
              currentCompany = await fetchCompany(injectedProfile.company_id);
              publishPortalSession();
              applyRoleUI(injectedProfile);
            } else {
              publishPortalSession();
            }
            showPortal();
            if (typeof window.loadPortalServerData === 'function') {
              await window.loadPortalServerData();
            }
          } catch (loadErr) {
            console.error('loadPortalServerData with injected email', loadErr);
            publishPortalSession();
            showPortal();
          }
          return;
        }

        clearPortalSession();
        showLogin('');
        return;
      }

      try {
        const profile = await fetchProfile(user.email);
        if (!profile) {
          await supabaseClient.auth.signOut();
          showLogin('users 테이블에 등록되지 않은 이메일입니다. 관리자에게 계정 등록을 요청해 주세요.');
          return;
        }
        if (profile.is_active === false) {
          await supabaseClient.auth.signOut();
          showLogin('비활성화된 계정입니다. 관리자에게 문의해 주세요.');
          return;
        }

        if (!profile.company_id) {
          await supabaseClient.auth.signOut();
          showLogin('회사 정보가 연결되지 않은 계정입니다. users.company_id를 확인해 주세요.');
          return;
        }

        const company = await fetchCompany(profile.company_id);
        if (!company) {
          await supabaseClient.auth.signOut();
          showLogin('회사 정보를 찾지 못했습니다. companies 테이블과 users.company_id 연결을 확인해 주세요.');
          return;
        }
        if (company.is_active === false) {
          await supabaseClient.auth.signOut();
          showLogin('비활성화된 회사입니다. 관리자에게 문의해 주세요.');
          return;
        }

        if (currentRequestedCompany && String(company.id) !== String(currentRequestedCompany.id)) {
          await supabaseClient.auth.signOut();
          showLogin(`${currentRequestedCompany.company_name || '현재 접속 회사'} 전용 주소입니다. 해당 회사 계정으로 로그인해 주세요.`);
          return;
        }

        currentProfile = profile;
        currentCompany = company;
        publishPortalSession();
        applyRoleUI(profile);

        if (profile.must_change_password) {
          showPasswordChange('');
          return;
        }

        showPortal();
        try {
          if (typeof window.loadPortalServerData === 'function') {
            await window.loadPortalServerData();
          }
        } catch (loadErr) {
          console.error('loadPortalServerData', loadErr);
        }
      } catch (error) {
        console.error('handleSession error:', error);
        await supabaseClient.auth.signOut();
        clearPortalSession();
        showLogin('사용자 권한 정보를 확인하지 못했습니다. users 테이블의 이메일, 권한, 회사 정보를 확인해 주세요.');
      }
    }

    async function login() {
      if (authBusy) return;

      const email = (els.loginEmail?.value || '').trim();
      const password = els.loginPassword?.value || '';

      if (!email || !password) {
        setBoxMessage(els.loginError, '이메일과 비밀번호를 입력해 주세요.');
        return;
      }

      authBusy = true;
      if (els.loginButton) els.loginButton.disabled = true;
      setBoxMessage(els.loginError, '');

      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        clearLoginInputs();
        await handleSession(data?.user || null);
      } catch (error) {
        console.error('login error:', error);
        let msg = error?.message || '로그인에 실패했습니다.';
        if (msg === 'Invalid login credentials') {
          msg = '로그인 정보가 맞지 않습니다. Supabase Authentication > Users에 계정이 있는지, 비밀번호가 실제로 저장된 값과 같은지 다시 확인해 주세요.';
        }
        setBoxMessage(els.loginError, msg);
      } finally {
        authBusy = false;
        if (els.loginButton) els.loginButton.disabled = false;
      }
    }

    async function changePassword() {
      const newPassword = els.newPassword?.value || '';
      const confirmPassword = els.confirmPassword?.value || '';

      if (newPassword.length < 6) {
        setBoxMessage(els.passwordError, '비밀번호는 6자 이상으로 입력해 주세요.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setBoxMessage(els.passwordError, '새 비밀번호와 확인 값이 서로 다릅니다.');
        return;
      }

      if (els.changePasswordButton) els.changePasswordButton.disabled = true;
      setBoxMessage(els.passwordError, '');
      setBoxMessage(els.passwordSuccess, '');

      try {
        const { error: pwError } = await supabaseClient.auth.updateUser({ password: newPassword });
        if (pwError) throw pwError;

        if (currentUser?.email) {
          const { error: profileError } = await supabaseClient
            .from('users')
            .update({ must_change_password: false })
            .eq('email', currentUser.email);
          if (profileError) throw profileError;
        }

        currentProfile = { ...(currentProfile || {}), must_change_password: false };
        publishPortalSession();
        applyRoleUI(currentProfile);
        setBoxMessage(els.passwordSuccess, '비밀번호가 변경되었습니다. 포털로 이동합니다.');
        setTimeout(() => {
          showPortal();
          if (typeof window.loadPortalServerData === 'function') {
            window.loadPortalServerData().catch((e) => console.error(e));
          }
        }, 700);
      } catch (error) {
        console.error('changePassword error:', error);
        setBoxMessage(els.passwordError, error?.message || '비밀번호 변경 중 오류가 발생했습니다.');
      } finally {
        if (els.changePasswordButton) els.changePasswordButton.disabled = false;
      }
    }

async function logout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  clearPortalSession();
  clearLoginInputs();
  try {
    localStorage.removeItem('portalLastPage');
    localStorage.removeItem('reagent_current_user');
  } catch (_) {}
  if (els.topUserBar) els.topUserBar.hidden = true;
  showLogin('로그아웃되었습니다.');
  setTimeout(() => clearLoginInputs(), 80);
  setTimeout(() => clearLoginInputs(), 350);
}

window.portalLogout = logout;

    els.loginButton?.addEventListener('click', login);
    els.loginPassword?.addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
    els.loginEmail?.addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
    els.changePasswordButton?.addEventListener('click', changePassword);
    els.confirmPassword?.addEventListener('keydown', (e) => { if (e.key === 'Enter') changePassword(); });
    els.logoutNavBtn?.addEventListener('click', logout);

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      handleSession(session?.user || null);
    });

    supabaseClient.auth.getSession()
      .then(({ data }) => handleSession(data?.session?.user || null))
      .catch((error) => {
        console.error('getSession error:', error);
        showLogin('인증 세션을 확인하지 못했습니다.');
      });

    window.portalSupabase = supabaseClient;
    window.currentTenantSubdomain = currentTenantSubdomain;
    window.currentRequestedCompany = currentRequestedCompany;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth, { once: true });
  } else {
    initAuth();
  }
})();
