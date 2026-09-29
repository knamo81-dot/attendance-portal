(function(){
  'use strict';
  if(window.__travelExpenseDedicatedMobileUiInstalled) return;
  window.__travelExpenseDedicatedMobileUiInstalled = true;

  const MOBILE_QUERY = '(max-width:768px)';
  const body = document.body;

  function isMobile(){
    try { return window.matchMedia(MOBILE_QUERY).matches; }
    catch (_) { return window.innerWidth <= 760; }
  }

  function applicantFormPanel(){ return document.querySelector('.user-view .form-panel'); }
  function adminLayout(){ return document.querySelector('.admin-view .admin-review-layout'); }

  function ensureApplicantDetailNav(){
    const panel = applicantFormPanel();
    if(!panel || panel.querySelector('.travel-mobile-detail-nav')) return;
    const nav = document.createElement('div');
    nav.className = 'travel-mobile-detail-nav';
    nav.innerHTML = '<button type="button" data-travel-mobile-back>← 목록</button><strong>출장비 작성 / 상세</strong>';
    panel.prepend(nav);
    nav.querySelector('[data-travel-mobile-back]')?.addEventListener('click', showApplicantList);
  }

  function showApplicantList(){
    if(!isMobile() || body.classList.contains('admin')) return;
    body.classList.add('travel-mobile-list');
    body.classList.remove('travel-mobile-detail');
    try { window.scrollTo({top:0, behavior:'smooth'}); }
    catch (_) { window.scrollTo(0,0); }
  }

  function showApplicantDetail(){
    if(!isMobile() || body.classList.contains('admin')) return;
    body.classList.remove('travel-mobile-list');
    body.classList.add('travel-mobile-detail');
    try { window.scrollTo({top:0, behavior:'smooth'}); }
    catch (_) { window.scrollTo(0,0); }
  }

  function ensureAdminDetailNav(){
    const layout = adminLayout();
    if(!layout || layout.querySelector('.travel-mobile-admin-detail-nav')) return;
    const nav = document.createElement('div');
    nav.className = 'travel-mobile-admin-detail-nav';
    nav.innerHTML = '<button type="button" data-travel-admin-back>← 목록</button><strong>검토 상세</strong>';
    const detail = layout.querySelector('.admin-detail-panel');
    if(detail) layout.insertBefore(nav, detail);
    else layout.prepend(nav);
    nav.querySelector('[data-travel-admin-back]')?.addEventListener('click', showAdminList);
  }

  function showAdminList(){
    body.classList.remove('travel-admin-detail');
    try { window.scrollTo({top:0, behavior:'smooth'}); }
    catch (_) { window.scrollTo(0,0); }
  }

  function showAdminDetail(){
    if(!isMobile() || !body.classList.contains('admin')) return;
    ensureAdminDetailNav();
    body.classList.add('travel-admin-detail');
    try { window.scrollTo({top:0, behavior:'smooth'}); }
    catch (_) { window.scrollTo(0,0); }
  }

  function applyBase(){
    body.classList.toggle('travel-mobile-ui', isMobile());
    if(!isMobile()){
      body.classList.remove('travel-admin-detail');
      return;
    }
    ensureApplicantDetailNav();
    ensureAdminDetailNav();
    if(!body.classList.contains('admin') && !body.classList.contains('travel-mobile-list') && !body.classList.contains('travel-mobile-detail')){
      body.classList.add('travel-mobile-list');
    }
  }

  function wrapApplicantActions(){
    ['newRequest','loadTravelExpenseRequest','startTravelExpenseEdit'].forEach(function(name){
      const original = window[name];
      if(typeof original !== 'function' || original.__travelDedicatedApplicantWrapped) return;
      window[name] = function(){
        const result = original.apply(this, arguments);
        Promise.resolve(result).catch(function(){}).finally(function(){ setTimeout(showApplicantDetail, 0); });
        return result;
      };
      window[name].__travelDedicatedApplicantWrapped = true;
    });
  }

  function wrapSetMode(){
    const original = window.setMode;
    if(typeof original !== 'function' || original.__travelDedicatedMobileWrapped) return;
    window.setMode = function(mode){
      const result = original.apply(this, arguments);
      body.classList.remove('travel-admin-detail');
      setTimeout(function(){
        applyBase();
        if(mode !== 'admin' && isMobile()) showApplicantList();
      },0);
      return result;
    };
    window.setMode.__travelDedicatedMobileWrapped = true;
  }

  function wrapAdminSelect(){
    const names = ['selectTravelExpenseAdminRequest','adminSelectDetailById'];
    names.forEach(function(name){
      const original = window[name];
      if(typeof original !== 'function' || original.__travelDedicatedMobileWrapped) return;
      window[name] = function(){
        const result = original.apply(this, arguments);
        Promise.resolve(result).catch(function(){}).finally(function(){ setTimeout(showAdminDetail, 0); });
        return result;
      };
      window[name].__travelDedicatedMobileWrapped = true;
    });
  }

  // 일부 버전은 함수가 늦게 설치되므로 클릭 이벤트도 보조 트리거로 사용합니다.
  document.addEventListener('click', function(event){
    if(!isMobile()) return;
    if(body.classList.contains('admin')){
      const row = event.target?.closest?.('.admin-trip-row');
      if(row && !event.target.closest('input,button,a,label')) setTimeout(showAdminDetail, 80);
      return;
    }
    const card = event.target?.closest?.('.submission-scroll .list-card');
    if(card && !event.target.closest('button,.card-menu,.dropdown-menu,a,input,select,textarea,label')){
      setTimeout(showApplicantDetail, 100);
    }
  }, true);

  // 관리팀 상세 화면에서 오른쪽 스와이프로 목록 복귀.
  let sx = null, sy = null, st = 0;
  document.addEventListener('touchstart', function(event){
    if(!isMobile() || !body.classList.contains('admin') || !body.classList.contains('travel-admin-detail')) return;
    if(!event.touches || event.touches.length !== 1) return;
    if(event.target?.closest?.('.modal-backdrop,.dropdown-menu,input,textarea,select')) return;
    const t = event.touches[0];
    sx = t.clientX; sy = t.clientY; st = Date.now();
  }, {passive:true});

  document.addEventListener('touchend', function(event){
    if(sx == null || sy == null) return;
    const x0 = sx, y0 = sy, t0 = st;
    sx = sy = null; st = 0;
    if(!isMobile() || !body.classList.contains('admin') || !body.classList.contains('travel-admin-detail')) return;
    const t = event.changedTouches && event.changedTouches[0];
    if(!t) return;
    const dx = t.clientX - x0;
    const dy = Math.abs(t.clientY - y0);
    if(dx >= 75 && dy <= 65 && Date.now() - t0 <= 900) showAdminList();
  }, {passive:true});

  function install(){
    applyBase();
    wrapApplicantActions();
    wrapSetMode();
    wrapAdminSelect();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();

  [250,800,1600,2600].forEach(function(delay){ setTimeout(install, delay); });
  window.addEventListener('resize', applyBase);
  window.addEventListener('orientationchange', function(){ setTimeout(applyBase, 200); });

  window.travelExpenseMobileApplicantList = showApplicantList;
  window.travelExpenseMobileApplicantDetail = showApplicantDetail;
  window.travelExpenseMobileAdminList = showAdminList;
  window.travelExpenseMobileAdminDetail = showAdminDetail;
})();
