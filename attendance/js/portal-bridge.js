/* ===== portal-bridge.js | extracted from attendance.js | step2 ===== */
(function(){
  if (window.__ATTENDANCE_PORTAL_BRIDGE_LOADED__) return;
  window.__ATTENDANCE_PORTAL_BRIDGE_LOADED__ = true;
})();

/* ===== extracted inline script #8 (id="attendance-portal-bridge") ===== */

(function () {
  'use strict';

  const BASE_TABS = [
    { id: 'attendance', label: '근태관리' },
    { id: 'dashboard', label: '분석대시보드' },
    { id: 'deep-analysis', label: '심층분석' },
    { id: 'trend-analysis', label: '트렌드분석' },
    { id: 'attendance-missing', label: '출퇴근 누락 분석' }
  ];

  const ADMIN_TAB = { id: 'admin', label: '관리자 기능' };

  function isAdminOperatorRoleText(value) {
    const text = compact(value).toLowerCase();
    return text.includes('관리자') || text.includes('운영자') || text.includes('admin') || text.includes('operator');
  }

  function hasAdminOperatorRoleInDom() {
    const candidates = [
      document.body,
      document.querySelector('.top-user-bar'),
      document.querySelector('.user-chip'),
      document.querySelector('.role'),
      document.querySelector('[data-role]'),
      document.querySelector('[data-user-role]'),
      document.querySelector('[data-authority]')
    ].filter(Boolean);

    return candidates.some(function (el) {
      const text = [
        el.textContent || '',
        el.getAttribute?.('data-role') || '',
        el.getAttribute?.('data-user-role') || '',
        el.getAttribute?.('data-authority') || ''
      ].join(' ');
      return isAdminOperatorRoleText(text);
    });
  }

  function hasAdminOperatorRoleInState() {
    try {
      const sources = [
        window.currentAccess,
        window.ATTENDANCE_EFFECTIVE_ACCESS,
        window.currentUser,
        window.portalUser,
        window.USER,
        window.user
      ].filter(Boolean);

      return sources.some(function (obj) {
        if (!obj || typeof obj !== 'object') return false;
        const roleText = [
          obj.role,
          obj.primaryRole,
          obj.systemRole,
          obj.system_role,
          obj.userRole,
          obj.user_role,
          obj.authority,
          obj.accessRole,
          obj.access_role,
          obj?.profile?.role,
          obj?.profile?.authority,
          obj?.user?.role,
          obj?.user?.authority
        ].filter(Boolean).join(' ');
        return obj.isAdmin === true || obj.isOperator === true || isAdminOperatorRoleText(roleText);
      });
    } catch (_) {
      return false;
    }
  }

  function getInternalAdminTab() {
    return document.querySelector('.mainTab[data-main="admin"]');
  }

  function getInternalAdminPanel() {
    return document.getElementById('main-admin');
  }

  function isInternalAdminTabAllowed() {
    const tab = getInternalAdminTab();
    const panel = getInternalAdminPanel();

    if (!tab && !panel) return false;

    if (tab) {
      const hidden = tab.dataset.adminHidden === 'Y' || tab.getAttribute('aria-hidden') === 'true';
      const styleHidden = tab.style && tab.style.display === 'none';
      if (!hidden && !tab.disabled && !styleHidden) return true;
    }

    if (panel) {
      const hidden = panel.dataset.adminHidden === 'Y' || panel.getAttribute('aria-hidden') === 'true';
      const styleHidden = panel.style && panel.style.display === 'none';
      if (!hidden && !styleHidden) return true;
    }

    return false;
  }

  function canShowAdminTab() {
    return isInternalAdminTabAllowed() || hasAdminOperatorRoleInState() || hasAdminOperatorRoleInDom();
  }

  function ensureInternalAdminVisible() {
    if (!canShowAdminTab()) return;

    const tab = getInternalAdminTab();
    const panel = getInternalAdminPanel();

    if (tab) {
      tab.dataset.adminHidden = 'N';
      tab.setAttribute('aria-hidden', 'false');
      tab.disabled = false;
      tab.style.display = '';
    }

    if (panel) {
      panel.dataset.adminHidden = 'N';
      panel.setAttribute('aria-hidden', 'false');
      panel.style.display = '';
    }
  }

  async function refreshAdminView() {
    ensureInternalAdminVisible();

    try {
      if (typeof window.renderAdmin === 'function') window.renderAdmin();
    } catch (_) {}

    try {
      if (typeof window.renderEmpMaster === 'function') window.renderEmpMaster();
    } catch (_) {}

    try {
      if (typeof window.renderOrgTree === 'function') window.renderOrgTree();
    } catch (_) {}

    try {
      if (typeof window.refreshAdminUploadManagement === 'function') {
        await window.refreshAdminUploadManagement(false);
      } else if (typeof window.refreshAdminMonthCardsImmediately === 'function') {
        await window.refreshAdminMonthCardsImmediately({ forceYearReload: false });
      }
    } catch (error) {
      console.warn('[portal-bridge] refresh admin upload management failed:', error);
    }
  }

  function getPortalTabs() {
    return canShowAdminTab() ? BASE_TABS.concat([ADMIN_TAB]) : BASE_TABS.slice();
  }

  const TAB_ALIASES = {
    attendance: ['attendance', '근태관리'],
    dashboard: ['dashboard', '분석대시보드'],
    'deep-analysis': ['deep-analysis', 'deep', '심층분석'],
    'trend-analysis': ['trend-analysis', 'trend', '트렌드분석'],
    'attendance-missing': ['attendance-missing', 'missing', 'missing-analysis', '출퇴근 누락 분석', '출퇴근누락분석'],
    admin: ['admin', '관리자 기능', '관리자기능', '설정', '관리']
  };

  function compact(value) {
    return String(value || '').replace(/\s+/g, '').trim();
  }

  function normalizeTabId(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'attendance';

    for (const [id, aliases] of Object.entries(TAB_ALIASES)) {
      if (raw === id || aliases.includes(raw) || aliases.map(compact).includes(compact(raw))) return id;
    }

    return raw;
  }

  function getActiveTabId() {
    const active = document.querySelector('.mainTab.active[data-main]');
    return normalizeTabId(active?.getAttribute('data-main') || 'attendance');
  }

  function postTabs() {
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage({
      type: 'portal-tabs-ready',
      tabs: getPortalTabs(),
      activeTabId: getActiveTabId(),
      source: 'attendance'
    }, '*');
  }

  function postActiveTab(tabId) {
    if (!window.parent || window.parent === window) return;
    const id = normalizeTabId(tabId);
    window.parent.postMessage({
      type: 'portal-tab-active',
      activeTabId: id,
      tabId: id,
      source: 'attendance'
    }, '*');
  }

  function isReportModalOpen() {
    var modal = document.getElementById('attendanceReportModal');
    return !!(modal && (modal.classList.contains('show') || modal.getAttribute('aria-hidden') === 'false'));
  }

  const __BRIDGE_STARTED_AT = Date.now();
  let __lastBridgeRenderKey = '';
  let __lastBridgeRenderAt = 0;

  function getBridgeRenderKey(tabId) {
    return [
      normalizeTabId(tabId),
      document.querySelector('#period')?.value || '',
      document.querySelector('#division')?.value || '',
      document.querySelector('#team')?.value || ''
    ].join('|');
  }

  function hasRenderedContent(tabId) {
    const id = normalizeTabId(tabId);

    if (id === 'attendance') {
      const kpis = document.querySelector('#attendanceKpis');
      const panel = document.querySelector('#main-attendance');
      return !!(
        (kpis && kpis.children && kpis.children.length > 0) ||
        (panel && panel.querySelector('svg')) ||
        (panel && panel.querySelector('table tbody tr'))
      );
    }

    if (id === 'dashboard') {
      const panel = document.querySelector('#main-dashboard');
      return !!(panel && (panel.querySelector('svg') || panel.querySelector('.kpiCard') || panel.querySelector('.riskItem')));
    }

    if (id === 'deep-analysis') {
      const panel = document.querySelector('#main-deep-analysis');
      return !!(panel && (panel.querySelector('svg') || panel.querySelector('.riskItem') || panel.querySelector('table tbody tr')));
    }

    if (id === 'trend-analysis') {
      const panel = document.querySelector('#main-trend-analysis');
      return !!(panel && panel.querySelector('svg'));
    }

    if (id === 'attendance-missing') {
      const panel = document.querySelector('#main-attendance-missing');
      return !!(panel && (panel.querySelector('svg') || panel.querySelector('table tbody tr')));
    }

    if (id === 'admin') {
      const panel = document.querySelector('#main-admin');
      return !!(panel && (panel.querySelector('table tbody tr') || panel.querySelector('.card') || panel.querySelector('[id*="admin"]')));
    }

    return false;
  }

  function shouldSkipBridgeRender(tabId) {
    const now = Date.now();
    const key = getBridgeRenderKey(tabId);

    // 초기 로딩 직후에는 attendance.js 자체 초기 렌더와 bridge 렌더가 겹치기 쉽습니다.
    // 이미 화면 요소가 그려진 경우 bridge가 같은 화면을 다시 그리지 않도록 막습니다.
    if (now - __BRIDGE_STARTED_AT < 2500 && hasRenderedContent(tabId)) {
      __lastBridgeRenderKey = key;
      __lastBridgeRenderAt = now;
      return true;
    }

    // 같은 탭/같은 필터 기준으로 짧은 시간 안에 들어오는 중복 렌더 방지
    if (key === __lastBridgeRenderKey && now - __lastBridgeRenderAt < 1200) {
      return true;
    }

    __lastBridgeRenderKey = key;
    __lastBridgeRenderAt = now;
    return false;
  }

  function renderCurrentTab(tabId) {
    if (isReportModalOpen()) return;
    if (shouldSkipBridgeRender(tabId)) return;

    const id = normalizeTabId(tabId);

    try {
      if (typeof window.trendUpdatePeriodControlVisibility === 'function') {
        window.trendUpdatePeriodControlVisibility();
      }
    } catch (_) {}

    try {
      if (id === 'attendance' && typeof window.render === 'function') {
        window.render();
      }
    } catch (_) {}

    try {
      if ((id === 'dashboard' || id === 'deep-analysis') && typeof window.rerenderDashboardVisibleCharts === 'function') {
        window.rerenderDashboardVisibleCharts();
      }
    } catch (_) {}

    try {
      if (id === 'trend-analysis' && typeof window.renderTrendAnalysis === 'function') {
        window.renderTrendAnalysis();
      }
    } catch (_) {}

    try {
      if (id === 'attendance-missing' && typeof window.renderAttendanceMissingAnalysis === 'function') {
        window.renderAttendanceMissingAnalysis();
      }
    } catch (_) {}

    try {
      if (id === 'admin') {
        refreshAdminView();
      }
    } catch (_) {}
  }

  let __bridgeRenderTimer = null;

  function scheduleBridgeRender(tabId) {
    if (isReportModalOpen()) return;

    const id = normalizeTabId(tabId);

    if (__bridgeRenderTimer) {
      clearTimeout(__bridgeRenderTimer);
      __bridgeRenderTimer = null;
    }

    // 포탈 공통 버튼/iframe 패널 전환이 먼저 그려지도록 한 프레임 양보한 뒤
    // 무거운 근태/트렌드/누락 렌더를 실행합니다.
    requestAnimationFrame(function () {
      __bridgeRenderTimer = setTimeout(function () {
        __bridgeRenderTimer = null;
        renderCurrentTab(id);
      }, 120);
    });
  }

  function activateTab(tabId) {
    const id = normalizeTabId(tabId);
    let ok = false;

    if (id === 'admin') {
      ensureInternalAdminVisible();
      setTimeout(function () { refreshAdminView(); }, 0);
      setTimeout(function () { refreshAdminView(); }, 350);
    }

    try {
      if (typeof window.activateMainTabWithoutRender === 'function') {
        ok = window.activateMainTabWithoutRender(id) === true;
      }
    } catch (_) {}

    if (!ok) {
      const btn = document.querySelector('.mainTab[data-main="' + id + '"]');
      const panel = document.getElementById('main-' + id);
      if (btn && panel) {
        document.querySelectorAll('.mainTab').forEach(function (el) { el.classList.remove('active'); });
        document.querySelectorAll('.mainPanel').forEach(function (el) { el.classList.remove('active'); });
        btn.classList.add('active');
        panel.classList.add('active');
        ok = true;
      }
    }

    try {
      if (typeof window.saveAttendanceMainTab === 'function') {
        window.saveAttendanceMainTab(id);
      }
    } catch (_) {}

    postActiveTab(id);
    postTabs();
    postFilters();
    scheduleBridgeRender(id);

    return ok;
  }

  function findOne(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function getFilterElements() {
    return {
      period: findOne(['#period', '#stickyPeriod', '#periodSelect', '#monthSelect']),
      division: findOne(['#division', '#stickyDivision', '#divisionFilter', '#filterDivision']),
      team: findOne(['#team', '#stickyTeam', '#teamFilter', '#filterTeam'])
    };
  }

  function optionList(selectEl) {
    if (!selectEl) return [];
    return Array.from(selectEl.options || []).map(function (option) {
      return {
        value: option.value,
        label: option.textContent || option.value
      };
    });
  }

  function fallbackOptions(kind) {
    if (kind === 'period') {
      // 기간 필터는 본부/팀 필터와 함께 처음부터 표시하되,
      // 실제 월 옵션이 준비되기 전에는 임시 안내값만 보여줍니다.
      return [{ value: '', label: '기준월 불러오는 중...' }];
    }

    try {
      const rows = []
        .concat(window.EMPLOYEES || [])
        .concat(window.employees || [])
        .concat(window.ROWS || [])
        .concat(window.rows || []);

      const key = kind === 'division' ? ['division', 'department'] : ['team'];
      const values = Array.from(new Set(rows.map(function (row) {
        for (const k of key) {
          if (row && row[k]) return row[k];
        }
        return '';
      }).filter(Boolean))).sort();

      return [{ value: '', label: '전체' }].concat(values.map(function (v) {
        return { value: v, label: v };
      }));
    } catch (_) {
      return [];
    }
  }

  function getFilters() {
    const els = getFilterElements();

    const periodOptions = optionList(els.period);
    const divisionOptions = optionList(els.division);
    const teamOptions = optionList(els.team);

    return [
      {
        id: 'period',
        label: '기간',
        type: 'select',
        value: els.period ? els.period.value : (window.STATE?.period || ''),
        options: periodOptions.length ? periodOptions : fallbackOptions('period')
      },
      {
        id: 'division',
        label: '본부',
        type: 'select',
        value: els.division ? els.division.value : (window.STATE?.division || ''),
        options: divisionOptions.length ? divisionOptions : fallbackOptions('division')
      },
      {
        id: 'team',
        label: '팀',
        type: 'select',
        value: els.team ? els.team.value : (window.STATE?.team || ''),
        options: teamOptions.length ? teamOptions : fallbackOptions('team')
      }
    ].filter(function (filter) {
      return Array.isArray(filter.options) && filter.options.length > 0;
    });
  }

  function postFilters() {
    if (!window.parent || window.parent === window) return;
    const filters = getFilters();
    window.parent.postMessage({
      type: 'portal-filters-ready',
      enabled: filters.length > 0,
      filters: filters,
      source: 'attendance'
    }, '*');
  }

  function fireChange(el) {
    if (!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setSelectValue(el, value) {
    if (!el) return;
    const exists = Array.from(el.options || []).some(function (option) {
      return option.value === value;
    });
    if (exists || value === '') {
      el.value = value;
      fireChange(el);
    }
  }

  function setFilter(filterId, value) {
    const id = String(filterId || '');
    const kind = id === 'division' || id.includes('division')
      ? 'division'
      : (id === 'team' || id.includes('team') ? 'team' : 'period');

    const nextValue = String(value ?? '');

    try {
      if (window.STATE) window.STATE[kind] = nextValue;
    } catch (_) {}

    const selectorMap = {
      period: ['#period', '#stickyPeriod', '#periodSelect', '#monthSelect'],
      division: ['#division', '#stickyDivision', '#divisionFilter', '#filterDivision'],
      team: ['#team', '#stickyTeam', '#teamFilter', '#teamSelect']
    };

    (selectorMap[kind] || []).forEach(function (selector) {
      setSelectValue(document.querySelector(selector), nextValue);
    });

    const activeTab = getActiveTabId();

    // 포탈 공통 필터 변경 시에는 단순 차트 재렌더가 아니라,
    // attendance.js의 전체 파생 데이터 갱신 흐름을 먼저 태워야 합니다.
    // 그렇지 않으면 분석대시보드가 근태관리 탭에서 갱신된 데이터만 따라가는 문제가 생깁니다.
    try {
      if (typeof window.invalidateAttendanceRenderCache === 'function') {
        window.invalidateAttendanceRenderCache();
      }
    } catch (_) {}

    try {
      if (!isReportModalOpen() && typeof window.updateAttendanceViewsAfterDataChange === 'function') {
        Promise.resolve(window.updateAttendanceViewsAfterDataChange({
          refreshFilters: false,
          keepMainTab: activeTab
        })).then(function () {
          postFilters();
        }).catch(function (error) {
          console.warn('[portal-bridge] updateAttendanceViewsAfterDataChange failed:', error);
          scheduleBridgeRender(activeTab);
        });
      } else if (!isReportModalOpen()) {
        scheduleBridgeRender(activeTab);
      }
    } catch (error) {
      console.warn('[portal-bridge] filter render failed:', error);
      if (!isReportModalOpen()) scheduleBridgeRender(activeTab);
    }

    setTimeout(postFilters, 150);
  }

  window.portalTabs = getPortalTabs();
  window.portalGetTabs = getPortalTabs;
  window.portalRefreshAdminView = refreshAdminView;
  window.portalActivateTab = activateTab;
  window.portalFilters = getFilters;
  window.portalSetFilter = setFilter;

  window.addEventListener('message', function (event) {
    const payload = event && event.data ? event.data : {};

    if (payload.type === 'portal-tabs-request') {
      postTabs();
      return;
    }

    if (payload.type === 'portal-filters-request') {
      postFilters();
      return;
    }

    if (payload.type === 'portal-tab-change') {
      activateTab(payload.tabId || payload.tab || '');
      return;
    }

    if (payload.type === 'portal-filter-change') {
      setFilter(payload.filterId || '', payload.value || '');
    }
  });

  document.addEventListener('click', function (event) {
    const btn = event.target && event.target.closest ? event.target.closest('.mainTab[data-main]') : null;
    if (!btn) return;

    setTimeout(function () {
      postActiveTab(btn.getAttribute('data-main'));
      postFilters();
    }, 0);
  });

  document.addEventListener('change', function (event) {
    if (!event.target || event.target.tagName !== 'SELECT') return;
    setTimeout(postFilters, 0);
  });

  function notifyAll() {
    postTabs();
    postFilters();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', notifyAll);
  } else {
    notifyAll();
  }

  setTimeout(notifyAll, 250);
  setTimeout(notifyAll, 1200);
  setTimeout(notifyAll, 2500);
})();
