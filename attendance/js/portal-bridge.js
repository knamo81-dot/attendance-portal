/* ===== portal-bridge.js | extracted from attendance.js | step2 ===== */
(function(){
  if (window.__ATTENDANCE_PORTAL_BRIDGE_LOADED__) return;
  window.__ATTENDANCE_PORTAL_BRIDGE_LOADED__ = true;
})();

/* ===== extracted inline script #8 (id="attendance-portal-bridge") ===== */

(function () {
  'use strict';

  const TABS = [
    { id: 'attendance', label: '근태관리' },
    { id: 'dashboard', label: '분석대시보드' },
    { id: 'deep-analysis', label: '심층분석' },
    { id: 'trend-analysis', label: '트렌드분석' },
    { id: 'attendance-missing', label: '출퇴근 누락 분석' }
  ];

  const TAB_ALIASES = {
    attendance: ['attendance', '근태관리'],
    dashboard: ['dashboard', '분석대시보드'],
    'deep-analysis': ['deep-analysis', 'deep', '심층분석'],
    'trend-analysis': ['trend-analysis', 'trend', '트렌드분석'],
    'attendance-missing': ['attendance-missing', 'missing', 'missing-analysis', '출퇴근 누락 분석', '출퇴근누락분석']
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
      tabs: TABS,
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

  function renderCurrentTab(tabId) {
    if (isReportModalOpen()) return;

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
        setTimeout(window.rerenderDashboardVisibleCharts, 120);
      }
    } catch (_) {}

    try {
      if (id === 'trend-analysis' && typeof window.renderTrendAnalysis === 'function') {
        window.renderTrendAnalysis();
        setTimeout(window.renderTrendAnalysis, 120);
      }
    } catch (_) {}

    try {
      if (id === 'attendance-missing' && typeof window.renderAttendanceMissingAnalysis === 'function') {
        window.renderAttendanceMissingAnalysis();
      }
    } catch (_) {}
  }

  function activateTab(tabId) {
    const id = normalizeTabId(tabId);
    let ok = false;

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

    renderCurrentTab(id);
    postActiveTab(id);
    postTabs();
    postFilters();

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
      const current = window.STATE?.period || '';
      const base = [
        { value: '1M', label: '1개월' },
        { value: '3M', label: '3개월' },
        { value: '6M', label: '6개월' },
        { value: '12M', label: '12개월' }
      ];
      if (current && !base.some(function (x) { return x.value === current; })) {
        base.unshift({ value: current, label: current });
      }
      return base;
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

    try {
      if (typeof window.render === 'function') window.render();
    } catch (_) {}

    if (!isReportModalOpen()) renderCurrentTab(getActiveTabId());

    setTimeout(postFilters, 150);
  }

  window.portalTabs = TABS;
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
