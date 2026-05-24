(function () {
  'use strict';

  const MOBILE_QUERY = '(max-width: 768px)';
  const CELL_SELECTOR = [
    '.calendar-day',
    '.calendar-cell',
    '.day-cell',
    '.month-day',
    '.schedule-day',
    '[data-date]',
    '[data-day]'
  ].join(',');

  const GRID_SELECTOR = [
    '.calendar-grid',
    '.schedule-calendar-grid',
    '.month-grid',
    '[class*="calendar"][class*="grid"]',
    '[class*="month"][class*="grid"]'
  ].join(',');

  function isMobile() {
    return window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
  }

  function getRoot() {
    return document.querySelector('#tab-content') || document.body;
  }

  function getActiveTabId() {
    const active = document.querySelector('.workspace-tabs .pill.active[data-tab], .pill.active[data-tab], [data-tab].active');
    return active ? active.getAttribute('data-tab') : '';
  }

  function isScheduleAreaVisible() {
    const activeTab = getActiveTabId();
    if (activeTab) return activeTab === 'schedule' || activeTab === 'reservation';

    const root = getRoot();
    const text = (root.innerText || '').replace(/\s+/g, ' ');
    return text.includes('스케줄') || text.includes('예약') || text.includes('이전달') || text.includes('다음달');
  }

  function getCalendarGrid(el) {
    return el && el.closest ? el.closest(GRID_SELECTOR) : null;
  }

  function isCalendarGrid(el) {
    return !!(el && el.matches && el.matches(GRID_SELECTOR));
  }

  function isCalendarContainer(el) {
    if (!el) return true;
    if (isCalendarGrid(el)) return true;

    const nestedCandidates = el.querySelectorAll ? el.querySelectorAll(CELL_SELECTOR) : [];
    if (nestedCandidates.length >= 3) return true;

    return false;
  }

  function extractDay(el) {
    const dataDate = el.getAttribute('data-date') || '';
    const dataDay = el.getAttribute('data-day') || '';
    let m = dataDate.match(/(?:^|-)0?([1-9]|[12][0-9]|3[01])$/) || dataDay.match(/^0?([1-9]|[12][0-9]|3[01])$/);
    if (m) return String(Number(m[1]));

    const text = (el.innerText || '').trim().replace(/\s+/g, ' ');
    m = text.match(/^([1-9]|[12][0-9]|3[01])(?=\s|건|일정|$)/);
    if (m) return String(Number(m[1]));

    const first = Array.from(el.querySelectorAll ? el.querySelectorAll('span, div, strong, b') : []).find(function (node) {
      const t = (node.innerText || '').trim();
      return /^([1-9]|[12][0-9]|3[01])$/.test(t);
    });
    return first ? String(Number(first.innerText.trim())) : '';
  }

  function hasEvent(el) {
    const text = (el.innerText || '').trim();
    if (/([1-9][0-9]*건)/.test(text) && !/0건/.test(text)) return true;
    if (el.querySelector && el.querySelector('.event, .schedule-item, .calendar-item, [class*="event"], [class*="schedule-item"]')) return true;
    return false;
  }

  function collectCells() {
    const root = getRoot();
    const bySelector = Array.from(root.querySelectorAll(CELL_SELECTOR));
    const byText = Array.from(root.querySelectorAll('button, div, li, td')).filter(function (el) {
      if (!getCalendarGrid(el)) return false;
      const text = (el.innerText || '').trim().replace(/\s+/g, ' ');
      if (!text) return false;
      if (/^(일|월|화|수|목|금|토)$/.test(text)) return false;
      return /^([1-9]|[12][0-9]|3[01])(\s|건|일정|$)/.test(text);
    });

    return Array.from(new Set(bySelector.concat(byText))).filter(function (el) {
      if (!el || !el.closest) return false;
      if (el.closest('.mobile-memo-filter-bar')) return false;
      if (el.closest('.workspace-tabs')) return false;
      if (!getCalendarGrid(el)) return false;
      if (isCalendarContainer(el)) return false;
      return true;
    });
  }

  function normalizeGridBlankCells() {
    const root = getRoot();
    const grids = Array.from(root.querySelectorAll(GRID_SELECTOR));

    grids.forEach(function (grid) {
      Array.from(grid.children || []).forEach(function (child) {
        if (!child || !child.classList) return;
        if (/^(일|월|화|수|목|금|토)$/.test((child.innerText || '').trim())) return;
        if (isCalendarContainer(child)) return;

        const day = extractDay(child);
        const hasVisibleText = (child.innerText || '').trim().length > 0;
        const looksLikeBlank = !day && !hasVisibleText;

        if (looksLikeBlank) {
          child.classList.add('mobile-calendar-date-only', 'mobile-calendar-empty-cell', 'is-empty');
          child.innerHTML = '';
          child.dataset.mobileProcessedDay = '';
        }
      });
    });
  }

  function compactCalendar() {
    const enabled = isMobile() && isScheduleAreaVisible();
    document.body.classList.toggle('mobile-schedule-compact', enabled);

    if (!enabled) return;

    const cells = collectCells();

    cells.forEach(function (cell) {
      const day = extractDay(cell);
      const eventState = !!day && hasEvent(cell) ? '1' : '0';
      const signature = day + '|' + eventState;

      cell.classList.add('mobile-calendar-date-only');
      cell.classList.toggle('mobile-calendar-empty-cell', !day);
      cell.classList.toggle('is-empty', !day);
      cell.classList.toggle('has-event', eventState === '1');

      /* 이미 같은 날짜 상태로 처리된 셀은 다시 그리지 않음: 클릭 깜빡임 방지 */
      if (cell.dataset.mobileProcessedSignature === signature && cell.querySelector('.mobile-calendar-date-number')) {
        return;
      }

      cell.dataset.mobileProcessedSignature = signature;
      cell.innerHTML = day ? '<span class="mobile-calendar-date-number">' + day + '</span>' : '';
    });

    normalizeGridBlankCells();
  }

  let raf = 0;
  function scheduleCompact() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      compactCalendar();
    });
  }

  /* 클릭마다 달력을 다시 쓰지 않음. 실제 DOM 교체가 생길 때 observer가 1회 보정 */
  window.addEventListener('resize', scheduleCompact);
  window.addEventListener('orientationchange', scheduleCompact);
  window.addEventListener('message', scheduleCompact);

  const observer = new MutationObserver(function (mutations) {
    if (!isMobile()) return;

    const needsCalendarPatch = mutations.some(function (mutation) {
      const target = mutation.target;
      if (target && target.closest && target.closest('.mobile-memo-filter-bar')) return false;
      if (target && target.closest && target.closest(GRID_SELECTOR)) return true;

      return Array.from(mutation.addedNodes || []).some(function (node) {
        if (!node || node.nodeType !== 1) return false;
        return (node.matches && node.matches(GRID_SELECTOR + ',' + CELL_SELECTOR)) ||
               (node.querySelector && node.querySelector(GRID_SELECTOR + ',' + CELL_SELECTOR));
      });
    });

    if (needsCalendarPatch) scheduleCompact();
  });

  function init() {
    observer.observe(getRoot(), { childList: true, subtree: true });
    compactCalendar();
    requestAnimationFrame(compactCalendar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();



(function () {
  'use strict';

  const MOBILE_QUERY = '(max-width: 768px)';
  const CARD_SELECTOR = '.memo-card, .memo-item, .note-card, [data-memo-id], [data-note-id]';
  const COLOR_KEYS = [
    { key: 'yellow', label: '노랑', tokens: ['yellow', 'memo-yellow', 'note-yellow', '#facc15', '#fde68a', '255, 243', '254, 249'] },
    { key: 'blue', label: '파랑', tokens: ['blue', 'memo-blue', 'note-blue', '#60a5fa', '#bfdbfe', '219, 234', '239, 246'] },
    { key: 'green', label: '초록', tokens: ['green', 'memo-green', 'note-green', '#4ade80', '#bbf7d0', '220, 252', '240, 253'] },
    { key: 'pink', label: '분홍', tokens: ['pink', 'rose', 'memo-pink', 'note-pink', '#f9a8d4', '#fecdd3', '252, 231', '253, 242'] },
    { key: 'purple', label: '보라', tokens: ['purple', 'violet', 'memo-purple', 'note-purple', '#c084fc', '#e9d5ff', '243, 232'] },
    { key: 'white', label: '흰색', tokens: ['white', 'memo-white', 'note-white', '#ffffff', '255, 255, 255'] }
  ];

  let activeFilter = 'all';
  let rafId = 0;

  function isMobile() {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  function hasMemoContext() {
    const activeTab = document.querySelector('.workspace-tabs .pill.active[data-tab]');
    const activeTabId = activeTab ? activeTab.getAttribute('data-tab') : 'memo';
    return activeTabId === 'memo' || !!document.querySelector(CARD_SELECTOR);
  }

  function getContentRoot() {
    return document.getElementById('tab-content') || document.body;
  }

  function normalizeColor(card) {
    const raw = [
      card.dataset ? (card.dataset.color || card.dataset.memoColor || card.dataset.noteColor || card.dataset.bg || '') : '',
      card.className || '',
      card.getAttribute('style') || '',
      window.getComputedStyle(card).backgroundColor || ''
    ].join(' ').toLowerCase();

    const matched = COLOR_KEYS.find(item => item.tokens.some(token => raw.includes(token.toLowerCase())));
    return matched ? matched.key : 'white';
  }

  function getCards() {
    return Array.from(document.querySelectorAll(CARD_SELECTOR)).filter(card => {
      if (!card || card.classList.contains('mobile-memo-filter-chip')) return false;
      if (card.closest('.mobile-memo-filter-bar')) return false;
      return true;
    });
  }

  function ensureTitleFallback(card) {
    const hasTitle = card.querySelector('.memo-title, .note-title, [class*="title"]');
    if (hasTitle) return;

    const text = (card.innerText || '').trim().split('\n').map(v => v.trim()).filter(Boolean)[0] || '제목 없는 메모';
    const title = document.createElement('div');
    title.className = 'memo-title mobile-generated-title';
    title.textContent = text.length > 28 ? text.slice(0, 28) + '…' : text;
    card.insertBefore(title, card.firstChild);
  }

  function ensureFilterBar(colors) {
    const root = getContentRoot();
    let bar = document.querySelector('.mobile-memo-filter-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'mobile-memo-filter-bar';
      bar.setAttribute('role', 'tablist');
      bar.setAttribute('aria-label', '메모 색상 필터');
      root.insertBefore(bar, root.firstChild);
    }

    const items = [{ key: 'all', label: '전체' }].concat(
      COLOR_KEYS.filter(item => colors.has(item.key)).map(item => ({ key: item.key, label: item.label }))
    );

    const currentKeys = Array.from(bar.querySelectorAll('button')).map(btn => btn.dataset.filter).join('|');
    const nextKeys = items.map(item => item.key).join('|');
    if (currentKeys !== nextKeys) {
      bar.innerHTML = '';
      items.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mobile-memo-filter-chip';
        btn.dataset.filter = item.key;
        btn.textContent = item.label;
        btn.addEventListener('click', function () {
          activeFilter = item.key;
          applyMobileMemoUi();
        });
        bar.appendChild(btn);
      });
    }

    Array.from(bar.querySelectorAll('button')).forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.filter === activeFilter);
    });
  }

  function applyMobileMemoUi() {
    rafId = 0;
    const root = getContentRoot();
    const cards = getCards();
    const enabled = isMobile() && hasMemoContext() && cards.length > 0;

    document.body.classList.toggle('mobile-memo-list-mode', enabled);

    const bar = document.querySelector('.mobile-memo-filter-bar');
    if (!enabled) {
      if (bar) bar.hidden = true;
      cards.forEach(card => {
        card.classList.remove('mobile-memo-hidden', 'mobile-memo-open');
      });
      return;
    }

    const colors = new Set();
    cards.forEach(card => {
      const color = normalizeColor(card);
      card.dataset.mobileMemoColor = color;
      colors.add(color);
      ensureTitleFallback(card);
      card.classList.toggle('mobile-memo-hidden', activeFilter !== 'all' && color !== activeFilter);
    });

    ensureFilterBar(colors);
    const nextBar = document.querySelector('.mobile-memo-filter-bar');
    if (nextBar) nextBar.hidden = false;

    root.classList.add('mobile-memo-ready');
  }

  function scheduleApply() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(applyMobileMemoUi);
  }

  document.addEventListener('click', function (event) {
    if (!isMobile() || !document.body.classList.contains('mobile-memo-list-mode')) return;
    if (event.target.closest('.mobile-memo-filter-bar')) return;
    if (event.target.closest('button, a, input, textarea, select, label')) return;

    const card = event.target.closest(CARD_SELECTOR);
    if (!card || card.classList.contains('mobile-memo-hidden')) return;

    getCards().forEach(item => {
      if (item !== card) item.classList.remove('mobile-memo-open');
    });
    card.classList.toggle('mobile-memo-open');
  }, true);

  window.addEventListener('resize', scheduleApply);
  window.addEventListener('orientationchange', scheduleApply);
  document.addEventListener('DOMContentLoaded', scheduleApply);
  document.addEventListener('click', function (event) {
    if (event.target.closest('.workspace-tabs .pill')) {
      setTimeout(scheduleApply, 80);
    }
  });

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'data-color', 'data-memo-color', 'data-note-color'] });

  setTimeout(scheduleApply, 250);
  setTimeout(scheduleApply, 900);
  setTimeout(scheduleApply, 1600);
})();



(function () {
  'use strict';

  var MOBILE_QUERY = '(max-width: 768px)';

  function isMobile() {
    return window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
  }

  function keepInputFontSize() {
    if (!isMobile()) return;
    var fields = document.querySelectorAll('input, textarea, select');
    fields.forEach(function (field) {
      field.style.fontSize = '16px';
    });
  }

  document.addEventListener('focusin', keepInputFontSize, true);
  document.addEventListener('DOMContentLoaded', keepInputFontSize);
  window.addEventListener('resize', keepInputFontSize);

  var observer = new MutationObserver(function () {
    if (!isMobile()) return;
    window.requestAnimationFrame(keepInputFontSize);
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();



(function () {
  'use strict';

  var MOBILE_QUERY = '(max-width: 768px)';
  var CARD_SELECTOR = [
    '#tab-content .selected-date-panel .schedule-item',
    '#tab-content .selected-schedule-panel .schedule-item',
    '#tab-content .daily-schedule-panel .schedule-item',
    '#tab-content .schedule-list .schedule-item',
    '#tab-content .selected-date-panel .event-item',
    '#tab-content .selected-schedule-panel .event-item',
    '#tab-content .daily-schedule-panel .event-item'
  ].join(',');

  function isMobile() {
    return window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
  }

  function isEditDeleteButton(button) {
    var text = (button.innerText || button.textContent || '').replace(/\s+/g, '').trim();
    return text === '수정' || text === '삭제';
  }

  function normalizeScheduleActionButtons() {
    if (!isMobile()) return;

    var cards = Array.prototype.slice.call(document.querySelectorAll(CARD_SELECTOR));
    cards.forEach(function (card) {
      if (!card || !card.querySelectorAll) return;

      var buttons = Array.prototype.slice.call(card.querySelectorAll('button')).filter(isEditDeleteButton);
      if (buttons.length === 0) return;

      var row = card.querySelector(':scope > .mobile-schedule-action-row');
      if (!row) {
        row = document.createElement('div');
        row.className = 'mobile-schedule-action-row';
        card.appendChild(row);
      }

      buttons.forEach(function (button) {
        if (button.parentElement !== row) row.appendChild(button);
      });
    });
  }

  var raf = 0;
  function scheduleNormalize() {
    if (raf) return;
    raf = window.requestAnimationFrame(function () {
      raf = 0;
      normalizeScheduleActionButtons();
    });
  }

  document.addEventListener('DOMContentLoaded', scheduleNormalize);
  document.addEventListener('click', function () {
    setTimeout(scheduleNormalize, 60);
  }, true);
  window.addEventListener('resize', scheduleNormalize);
  window.addEventListener('orientationchange', scheduleNormalize);

  var observer = new MutationObserver(function () {
    if (!isMobile()) return;
    scheduleNormalize();
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  setTimeout(scheduleNormalize, 250);
  setTimeout(scheduleNormalize, 900);
})();



/* =========================================================
   Mobile Calendar Swipe Month Move v17
   - 모바일 달력 영역 좌우 스와이프로 이전/다음달 이동
   - 기존 버튼 로직을 그대로 사용: 버튼은 CSS에서 숨김
========================================================= */
(function () {
  'use strict';

  var MOBILE_QUERY = '(max-width: 768px)';
  var startX = 0;
  var startY = 0;
  var startTime = 0;
  var tracking = false;

  function isMobile() {
    return window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
  }

  function getCalendarGridFromTarget(target) {
    if (!target || !target.closest) return null;
    return target.closest('#tab-content .calendar-grid, #tab-content .schedule-calendar-grid, #tab-content .month-grid');
  }

  function moveMonth(direction) {
    var btn = direction === 'next'
      ? document.getElementById('calendar-next-month')
      : document.getElementById('calendar-prev-month');

    if (btn) {
      btn.click();
      if (navigator.vibrate) {
        try { navigator.vibrate(8); } catch (_) {}
      }
    }
  }

  document.addEventListener('touchstart', function (event) {
    if (!isMobile()) return;
    var grid = getCalendarGridFromTarget(event.target);
    if (!grid) return;
    if (!event.touches || event.touches.length !== 1) return;

    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
    startTime = Date.now();
    tracking = true;
  }, { passive: true });

  document.addEventListener('touchend', function (event) {
    if (!tracking || !isMobile()) return;
    tracking = false;

    var grid = getCalendarGridFromTarget(event.target);
    if (!grid) return;
    if (!event.changedTouches || event.changedTouches.length !== 1) return;

    var dx = event.changedTouches[0].clientX - startX;
    var dy = event.changedTouches[0].clientY - startY;
    var dt = Date.now() - startTime;

    if (dt > 700) return;
    if (Math.abs(dx) < 55) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.35) return;

    if (dx < 0) moveMonth('next');
    else moveMonth('prev');
  }, { passive: true });
})();
