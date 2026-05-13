/* portal-home-auth.js | Phase 1 split from original portal-home.html
   원본 inline script #5를 실행 순서 그대로 외부 파일로 분리했습니다. */

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

    window.getPortalAuthContext = function getPortalAuthContext() {
      return {
        user: currentUser,
        profile: currentProfile,
        supabase: supabaseClient
      };
    };
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
    let authBusy = false;

    function setBoxMessage(target, message) {
      if (!target) return;
      target.textContent = message || '';
      target.classList.toggle('show', !!message);
    }

    function roleLabel(role) {
      if (role === 'admin') return '관리자';
      if (role === 'operator') return '운영자';
      return '일반사용자';
    }

    function showLogin(message = '') {
      document.body.classList.add('auth-loading');
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
        els.userChip.innerHTML = `<span>${displayName}</span><span class="role">${roleLabel(role)}</span>`;
      }
    }

    async function fetchProfile(email) {
      const { data, error } = await supabaseClient
        .from('users')
        .select('email,name,role,is_active,must_change_password')
        .eq('email', email)
        .maybeSingle();
      if (error) throw error;
      return data;
    }

    async function handleSession(user) {
      currentUser = user || null;
      currentProfile = null;

      if (!user) {
        const injectedEmail = typeof getPortalInjectedEmail === 'function' ? getPortalInjectedEmail() : '';
        if (injectedEmail) {
          currentUser = { email: injectedEmail };
          showPortal();
          try {
            if (typeof window.loadPortalServerData === 'function') {
              await window.loadPortalServerData();
            }
          } catch (loadErr) {
            console.error('loadPortalServerData with injected email', loadErr);
          }
          return;
        }

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

        currentProfile = profile;
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
        showLogin('사용자 권한 정보를 확인하지 못했습니다. users 테이블의 이메일과 권한 정보를 확인해 주세요.');
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
  currentProfile = null;
  if (els.topUserBar) els.topUserBar.hidden = true;
  showLogin('로그아웃되었습니다.');
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth, { once: true });
  } else {
    initAuth();
  }
})();
