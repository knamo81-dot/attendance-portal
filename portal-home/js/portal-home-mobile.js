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
  const CARD_SELECTOR = '.memo-note, .memo-card, .memo-item, .note-card, [data-memo-id], [data-note-id]';
  const COLOR_KEYS = [
    { key: 'yellow', label: '노랑', tokens: ['yellow', 'memo-yellow', 'note-yellow', '#facc15', '#fde68a', '#fef3c7', 'rgb(254, 243', '254, 243', '255, 243', '254, 249'] },
    { key: 'blue', label: '파랑', tokens: ['blue', 'memo-blue', 'note-blue', '#60a5fa', '#bfdbfe', '#dbeafe', 'rgb(219, 234', '219, 234', '239, 246'] },
    { key: 'green', label: '초록', tokens: ['green', 'memo-green', 'note-green', '#4ade80', '#bbf7d0', '#dcfce7', 'rgb(220, 252', '220, 252', '240, 253'] },
    { key: 'pink', label: '분홍', tokens: ['pink', 'rose', 'memo-pink', 'note-pink', '#f9a8d4', '#fecdd3', '#fce7f3', 'rgb(252, 231', '252, 231', '253, 242'] },
    { key: 'purple', label: '보라', tokens: ['purple', 'violet', 'memo-purple', 'note-purple', '#c084fc', '#e9d5ff', '#f3e8ff', 'rgb(243, 232', '243, 232'] },
    { key: 'white', label: '흰색', tokens: ['white', 'memo-white', 'note-white', '#ffffff', 'rgb(255, 255, 255', '255, 255, 255'] }
  ];

  let activeFilter = 'all';
  let rafId = 0;

  function isMobile() {
    return window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
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
    if (!card) return 'white';

    const raw = [
      card.dataset ? (card.dataset.mobileMemoColor || card.dataset.color || card.dataset.memoColor || card.dataset.noteColor || card.dataset.bg || '') : '',
      card.className || '',
      card.getAttribute('style') || '',
      window.getComputedStyle(card).backgroundColor || ''
    ].join(' ').toLowerCase();

    const matched = COLOR_KEYS.find(item => item.tokens.some(token => raw.includes(token.toLowerCase())));
    return matched ? matched.key : 'white';
  }

  function getCards() {
    return Array.from(document.querySelectorAll(CARD_SELECTOR)).filter(card => {
      if (!card) return false;
      if (card.classList && card.classList.contains('mobile-memo-filter-chip')) return false;
      if (card.closest && card.closest('.mobile-memo-filter-bar')) return false;
      if (card.closest && card.closest('.mobile-memo-unified-modal')) return false;
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

    const currentKeys = Array.from(bar.querySelectorAll('button[data-filter]')).map(btn => btn.dataset.filter).join('|');
    const nextKeys = items.map(item => item.key).join('|');
    if (currentKeys !== nextKeys) {
      bar.innerHTML = '';
      items.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mobile-memo-filter-chip';
        btn.dataset.filter = item.key;
        btn.textContent = item.label;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', item.key === activeFilter ? 'true' : 'false');
        bar.appendChild(btn);
      });
    }

    Array.from(bar.querySelectorAll('button[data-filter]')).forEach(btn => {
      const isActive = btn.dataset.filter === activeFilter;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function applyFilterToCards(cards) {
    cards.forEach(card => {
      const color = normalizeColor(card);
      card.dataset.mobileMemoColor = color;

      const shouldHide = activeFilter !== 'all' && color !== activeFilter;
      card.classList.toggle('mobile-memo-hidden', shouldHide);
      card.hidden = shouldHide;
      card.style.display = shouldHide ? 'none' : '';
      if (shouldHide) card.classList.remove('mobile-memo-open');
    });
  }

  function resetCards(cards) {
    cards.forEach(card => {
      card.classList.remove('mobile-memo-hidden', 'mobile-memo-open');
      card.hidden = false;
      card.style.display = '';
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
      resetCards(cards);
      return;
    }

    const colors = new Set();
    cards.forEach(card => {
      const color = normalizeColor(card);
      card.dataset.mobileMemoColor = color;
      colors.add(color);
      ensureTitleFallback(card);
    });

    ensureFilterBar(colors);
    applyFilterToCards(cards);

    const nextBar = document.querySelector('.mobile-memo-filter-bar');
    if (nextBar) nextBar.hidden = false;

    root.classList.add('mobile-memo-ready');
  }

  function scheduleApply() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(applyMobileMemoUi);
  }

  document.addEventListener('click', function (event) {
    const filterBtn = event.target && event.target.closest
      ? event.target.closest('.mobile-memo-filter-chip, .mobile-memo-filter-bar button[data-filter]')
      : null;

    if (filterBtn && filterBtn.dataset && filterBtn.dataset.filter) {
      if (!isMobile()) return;
      event.preventDefault();
      event.stopPropagation();
      activeFilter = filterBtn.dataset.filter || 'all';
      applyMobileMemoUi();
      return;
    }

    if (!isMobile() || !document.body.classList.contains('mobile-memo-list-mode')) return;
    if (event.target.closest('.mobile-memo-filter-bar')) return;
    if (event.target.closest('button, a, input, textarea, select, label')) return;

    const card = event.target.closest(CARD_SELECTOR);
    if (!card || card.classList.contains('mobile-memo-hidden') || card.hidden) return;

    getCards().forEach(item => {
      if (item !== card) item.classList.remove('mobile-memo-open');
    });
    card.classList.toggle('mobile-memo-open');
  }, true);

  window.addEventListener('resize', scheduleApply);
  window.addEventListener('orientationchange', scheduleApply);
  document.addEventListener('DOMContentLoaded', scheduleApply);
  document.addEventListener('click', function (event) {
    if (event.target.closest && event.target.closest('.workspace-tabs .pill')) {
      setTimeout(scheduleApply, 80);
    }
  });

  const observer = new MutationObserver(function (mutations) {
    if (!isMobile()) return;
    const shouldApply = mutations.some(function (mutation) {
      const target = mutation.target;
      if (target && target.closest && target.closest('.mobile-memo-filter-bar')) return false;
      if (target && target.closest && target.closest('.mobile-memo-unified-modal')) return false;
      return true;
    });
    if (shouldApply) scheduleApply();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'data-color', 'data-memo-color', 'data-note-color', 'data-mobile-memo-color']
  });

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

      var body = card.querySelector('.schedule-body') || card;
      var row = body.querySelector(':scope > .mobile-schedule-action-row');
      if (!row) {
        row = document.createElement('div');
        row.className = 'mobile-schedule-action-row';
        body.appendChild(row);
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
   Mobile Calendar Swipe Month Move v19
   - 모바일 달력 영역 좌우 스와이프로 이전/다음달 이동
   - 기존 버튼 click 로직 재사용
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



/* =========================================================
   Mobile Unified Memo State Bridge v33
   - 메모 클릭/추가/수정/삭제를 원본 state.notes + 서버 함수에 직접 연결
   - 내용은 note.content에서 직접 불러옴
   - 저장은 updateMemoOnServer/createMemoOnServer API를 통해 서버 반영
========================================================= */
(function () {
  'use strict';

  var MOBILE_QUERY = '(max-width: 768px)';
  var CARD_SELECTOR = '.memo-note, .memo-card, .memo-item, .note-card, [data-note-id], [data-memo-id]';

  var modal = null;
  var mode = 'add';
  var currentNoteId = null;

  var colorMap = [
    { key: 'yellow', label: '노랑', color: '#fef3c7' },
    { key: 'blue', label: '파랑', color: '#dbeafe' },
    { key: 'green', label: '초록', color: '#dcfce7' },
    { key: 'pink', label: '분홍', color: '#fce7f3' },
    { key: 'purple', label: '보라', color: '#f3e8ff' },
    { key: 'white', label: '흰색', color: '#ffffff' }
  ];

  function isMobile() {
    return window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
  }

  function api() {
    return window.portalMemoMobileApi || null;
  }

  function textOf(el) {
    return (el && (el.innerText || el.textContent) || '').trim();
  }

  function normText(el) {
    return textOf(el).replace(/\s+/g, '');
  }

  function getCardId(card) {
    if (!card) return '';
    return card.dataset.noteId || card.dataset.memoId || card.dataset.memoServerId || card.getAttribute('data-note-id') || card.getAttribute('data-memo-id') || '';
  }

  function getNoteByCard(card) {
    var id = getCardId(card);
    var memoApi = api();
    if (memoApi && typeof memoApi.getNoteById === 'function') {
      var found = memoApi.getNoteById(id);
      if (found) return found;
    }

    return {
      id: id,
      serverId: card.dataset.memoServerId || id,
      title: card.dataset.memoTitle || '',
      tag: card.dataset.memoTag || '메모',
      content: card.dataset.memoContent || '',
      pinned: card.dataset.memoPinned === 'true',
      layout: { color: card.dataset.memoColor || '' },
      createdAt: '',
      updatedAt: ''
    };
  }

  function colorKeyFromColor(value) {
    var raw = String(value || '').toLowerCase();
    if (raw.indexOf('blue') >= 0 || raw.indexOf('dbeafe') >= 0 || raw.indexOf('60a5fa') >= 0) return 'blue';
    if (raw.indexOf('green') >= 0 || raw.indexOf('dcfce7') >= 0 || raw.indexOf('4ade80') >= 0) return 'green';
    if (raw.indexOf('pink') >= 0 || raw.indexOf('rose') >= 0 || raw.indexOf('fce7f3') >= 0 || raw.indexOf('f9a8d4') >= 0) return 'pink';
    if (raw.indexOf('purple') >= 0 || raw.indexOf('violet') >= 0 || raw.indexOf('f3e8ff') >= 0 || raw.indexOf('c084fc') >= 0) return 'purple';
    if (raw.indexOf('white') >= 0 || raw.indexOf('ffffff') >= 0 || raw.indexOf('255, 255, 255') >= 0) return 'white';
    return 'yellow';
  }

  function colorValueFromKey(key) {
    var found = colorMap.find(function (item) { return item.key === key; });
    return found ? found.color : '#fef3c7';
  }

  function ensureModal() {
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'mobile-memo-unified-modal';
    modal.innerHTML = [
      '<div class="mobile-memo-unified-header">',
      '  <div class="mobile-memo-unified-title">메모</div>',
      '  <button type="button" class="mobile-memo-unified-close">닫기</button>',
      '</div>',
      '<div class="mobile-memo-unified-body">',
      '  <div class="mobile-memo-field mobile-memo-color-field">',
      '    <div class="mobile-memo-field-title">색상 선택</div>',
      '    <div class="mobile-memo-color-row"></div>',
      '  </div>',
      '  <div class="mobile-memo-field">',
      '    <label>제목</label>',
      '    <input class="mobile-memo-input mobile-memo-title-input" type="text" placeholder="제목을 입력하세요">',
      '  </div>',
      '  <div class="mobile-memo-field">',
      '    <label>태그</label>',
      '    <input class="mobile-memo-input mobile-memo-tag-input" type="text" placeholder="태그를 입력하세요">',
      '  </div>',
      '  <div class="mobile-memo-field">',
      '    <label>이미지 업로드</label>',
      '    <div class="mobile-memo-file-row">이미지는 PC 화면 또는 기존 입력폼에서 처리됩니다</div>',
      '  </div>',
      '  <div class="mobile-memo-field">',
      '    <label>내용</label>',
      '    <textarea class="mobile-memo-textarea mobile-memo-content-input" placeholder="메모 내용을 입력하세요"></textarea>',
      '  </div>',
      '  <label class="mobile-memo-checkbox-row">',
      '    <input class="mobile-memo-pin-input" type="checkbox">',
      '    <span>상단 고정 메모로 추가</span>',
      '  </label>',
      '  <div class="mobile-memo-modal-meta"></div>',
      '</div>',
      '<div class="mobile-memo-unified-actions">',
      '  <button type="button" class="mobile-memo-btn-delete">삭제</button>',
      '  <button type="button" class="mobile-memo-btn-secondary">취소</button>',
      '  <button type="button" class="mobile-memo-btn-primary">저장</button>',
      '</div>'
    ].join('');

    document.body.appendChild(modal);

    modal.querySelector('.mobile-memo-unified-close').addEventListener('click', closeModal);
    modal.querySelector('.mobile-memo-btn-secondary').addEventListener('click', closeModal);
    modal.querySelector('.mobile-memo-btn-primary').addEventListener('click', saveModal);
    modal.querySelector('.mobile-memo-btn-delete').addEventListener('click', deleteMemo);

    var row = modal.querySelector('.mobile-memo-color-row');
    colorMap.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mobile-memo-color-chip';
      btn.dataset.color = item.key;
      btn.style.setProperty('--mobile-memo-color', item.color);
      btn.textContent = item.label;
      btn.addEventListener('click', function () {
        setColor(item.key);
      });
      row.appendChild(btn);
    });

    return modal;
  }

  function setColor(colorKey) {
    var m = ensureModal();
    m.dataset.color = colorKey || 'yellow';
    Array.prototype.slice.call(m.querySelectorAll('.mobile-memo-color-chip')).forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.color === m.dataset.color);
    });
  }

  function setBusy(isBusy) {
    if (!modal) return;
    Array.prototype.slice.call(modal.querySelectorAll('button, input, textarea')).forEach(function (el) {
      el.disabled = !!isBusy;
    });
    modal.classList.toggle('is-busy', !!isBusy);
  }

  function fillModalFromNote(note) {
    var m = ensureModal();

    var title = note && note.title ? String(note.title) : '';
    var tag = note && note.tag ? String(note.tag) : '메모';
    var content = note && note.content ? String(note.content) : '';
    var pinned = !!(note && note.pinned);
    var colorKey = colorKeyFromColor((note && note.layout && note.layout.color) || note.color || '');

    m.querySelector('.mobile-memo-unified-title').textContent = mode === 'add' ? '메모 추가' : (title || '메모');
    m.querySelector('.mobile-memo-title-input').value = title;
    m.querySelector('.mobile-memo-tag-input').value = tag;
    m.querySelector('.mobile-memo-content-input').value = content;
    m.querySelector('.mobile-memo-pin-input').checked = pinned;

    var meta = [];
    if (note && note.createdAt) {
      try { meta.push('작성: ' + new Date(note.createdAt).toLocaleDateString()); } catch (_) {}
    }
    if (note && note.updatedAt) {
      try { meta.push('수정: ' + new Date(note.updatedAt).toLocaleDateString()); } catch (_) {}
    }
    m.querySelector('.mobile-memo-modal-meta').textContent = meta.join('\n');

    m.querySelector('.mobile-memo-btn-delete').style.display = mode === 'add' ? 'none' : '';
    m.querySelector('.mobile-memo-btn-primary').textContent = mode === 'add' ? '추가' : '저장';
    setColor(colorKey);
  }

  function openMemoModal(nextMode, note) {
    if (!isMobile()) return;

    mode = nextMode || 'add';
    currentNoteId = note ? (note.serverId || note.id) : null;

    ensureModal();
    fillModalFromNote(note || { title: '', tag: '메모', content: '', pinned: false, layout: { color: '#fef3c7' } });

    modal.classList.add('is-open');
    document.body.classList.add('mobile-memo-modal-lock');

    setTimeout(function () {
      var first = mode === 'add' ? modal.querySelector('.mobile-memo-title-input') : modal.querySelector('.mobile-memo-content-input');
      if (first) {
        try { first.focus({ preventScroll: true }); } catch (_) {}
      }
    }, 120);
  }

  function closeModal() {
    if (window.mobileMemoInputZoomGuard) window.mobileMemoInputZoomGuard.closeKeyboardAndRestore();
    if (!modal) return;
    modal.classList.remove('is-open');
    document.body.classList.remove('mobile-memo-modal-lock');
    currentNoteId = null;
    setBusy(false);
  }

  function modalPayload() {
    var colorKey = modal.dataset.color || 'yellow';
    return {
      title: modal.querySelector('.mobile-memo-title-input').value || '',
      tag: modal.querySelector('.mobile-memo-tag-input').value || '메모',
      content: modal.querySelector('.mobile-memo-content-input').value || '',
      pinned: !!modal.querySelector('.mobile-memo-pin-input').checked,
      layout: {
        color: colorValueFromKey(colorKey)
      },
      color: colorValueFromKey(colorKey)
    };
  }

  async function saveModal() {
    /* v34: blur before memo save */
    if (window.mobileMemoInputZoomGuard) window.mobileMemoInputZoomGuard.closeKeyboardAndRestore();
    var memoApi = api();
    if (!memoApi) {
      alert('모바일 메모 저장 연결을 찾지 못했습니다.');
      return;
    }

    setBusy(true);
    try {
      var payload = modalPayload();

      if (mode === 'add') {
        var newMemo = typeof memoApi.getNewMemo === 'function' ? (memoApi.getNewMemo() || {}) : {};
        var createPayload = Object.assign({}, newMemo, payload, {
          layout: Object.assign({}, newMemo.layout || {}, payload.layout || {}, {
            x: newMemo.layout?.x ?? 40,
            y: newMemo.layout?.y ?? 40,
            w: newMemo.layout?.w ?? 260,
            h: newMemo.layout?.h ?? 170,
            rotate: newMemo.layout?.rotate ?? 0
          }),
          boardType: newMemo.boardType || 'personal',
          memoDate: newMemo.memoDate,
          imageOnly: !!newMemo.imageOnly,
          image: newMemo.image || ''
        });
        await memoApi.createMemo(createPayload);
      } else {
        var note = typeof memoApi.getNoteById === 'function' ? memoApi.getNoteById(currentNoteId) : null;
        var updatePayload = Object.assign({}, payload, {
          layout: Object.assign({}, note?.layout || {}, payload.layout || {})
        });
        await memoApi.updateMemo(currentNoteId, updatePayload);
      }

      closeModal();
    } catch (err) {
      console.error(err);
      alert(err && err.message ? err.message : '메모 저장 중 오류가 발생했습니다.');
      setBusy(false);
    }
  }

  async function deleteMemo() {
    if (window.mobileMemoInputZoomGuard) window.mobileMemoInputZoomGuard.closeKeyboardAndRestore();
    if (mode === 'add') {
      closeModal();
      return;
    }

    var memoApi = api();
    if (!memoApi || !currentNoteId) return;

    if (!confirm('이 메모를 삭제할까요?')) return;

    setBusy(true);
    try {
      await memoApi.deleteMemo(currentNoteId);
      closeModal();
    } catch (err) {
      console.error(err);
      alert(err && err.message ? err.message : '메모 삭제 중 오류가 발생했습니다.');
      setBusy(false);
    }
  }

  document.addEventListener('click', function (event) {
    if (!isMobile()) return;
    if (event.target.closest('.mobile-memo-unified-modal')) return;

    var control = event.target.closest('button, a, [role="button"]');
    if (control && normText(control) === '메모추가') {
      event.preventDefault();
      event.stopPropagation();
      openMemoModal('add', null);
      return;
    }

    if (event.target.closest('.mobile-memo-filter-bar')) return;
    if (event.target.closest('button, a, input, textarea, select, label')) return;

    var card = event.target.closest(CARD_SELECTOR);
    if (!card || card.classList.contains('mobile-memo-hidden')) return;
    if (!document.body.classList.contains('mobile-memo-list-mode')) return;

    var note = getNoteByCard(card);
    if (!note) return;

    event.preventDefault();
    event.stopPropagation();

    openMemoModal('edit', note);
  }, true);

  window.addEventListener('resize', function () {
    if (!isMobile()) closeModal();
  });
})();



/* =========================================================
   Mobile Input Zoom Guard JS v34
   - iPhone/Android 입력창 포커스 확대 잔상 방지
   - 저장/닫기/취소/삭제 시 activeElement blur
   - visualViewport 변화 후 scroll/scale 잔상 정리
========================================================= */
(function () {
  'use strict';

  var MOBILE_QUERY = '(max-width: 768px)';
  var lastScrollY = 0;
  var restoreTimer = 0;

  function isMobile() {
    return window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
  }

  function isMemoModalOpen() {
    return !!document.querySelector('.mobile-memo-unified-modal.is-open');
  }

  function blurActiveElement() {
    try {
      var active = document.activeElement;
      if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) {
        active.blur();
      }
    } catch (_) {}
  }

  function rememberScroll() {
    if (!isMobile()) return;
    lastScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  }

  function restoreViewport() {
    if (!isMobile()) return;

    document.body.classList.add('mobile-input-zoom-guard');

    try {
      document.documentElement.style.webkitTextSizeAdjust = '100%';
      document.documentElement.style.textSizeAdjust = '100%';
      document.body.style.webkitTextSizeAdjust = '100%';
      document.body.style.textSizeAdjust = '100%';
    } catch (_) {}

    window.clearTimeout(restoreTimer);
    restoreTimer = window.setTimeout(function () {
      try {
        if (!isMemoModalOpen()) {
          window.scrollTo(0, lastScrollY || 0);
        }
      } catch (_) {}

      window.setTimeout(function () {
        document.body.classList.remove('mobile-input-zoom-guard');
      }, 120);
    }, 80);
  }

  function closeKeyboardAndRestore() {
    if (!isMobile()) return;
    blurActiveElement();
    restoreViewport();
  }

  document.addEventListener('focusin', function (event) {
    if (!isMobile()) return;

    var field = event.target;
    if (!field || !/^(INPUT|TEXTAREA|SELECT)$/.test(field.tagName)) return;

    rememberScroll();

    try {
      field.style.fontSize = '16px';
      field.style.lineHeight = field.tagName === 'TEXTAREA' ? '1.55' : '1.5';
      field.style.transform = 'none';
      field.style.zoom = '1';
    } catch (_) {}

    document.body.classList.add('mobile-input-zoom-guard');
  }, true);

  document.addEventListener('focusout', function () {
    if (!isMobile()) return;
    restoreViewport();
  }, true);

  document.addEventListener('click', function (event) {
    if (!isMobile()) return;

    var btn = event.target && event.target.closest
      ? event.target.closest('.mobile-memo-unified-close, .mobile-memo-btn-secondary, .mobile-memo-btn-primary, .mobile-memo-btn-delete')
      : null;

    if (btn) {
      closeKeyboardAndRestore();
      window.setTimeout(restoreViewport, 180);
      window.setTimeout(restoreViewport, 420);
    }
  }, true);

  document.addEventListener('keydown', function (event) {
    if (!isMobile()) return;
    if (event.key === 'Escape') {
      closeKeyboardAndRestore();
    }
  }, true);

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () {
      if (!isMobile()) return;
      window.clearTimeout(restoreTimer);
      restoreTimer = window.setTimeout(function () {
        if (!isMemoModalOpen()) restoreViewport();
      }, 120);
    });

    window.visualViewport.addEventListener('scroll', function () {
      if (!isMobile()) return;
      if (!isMemoModalOpen()) restoreViewport();
    });
  }

  window.addEventListener('orientationchange', function () {
    if (!isMobile()) return;
    closeKeyboardAndRestore();
    window.setTimeout(restoreViewport, 300);
  });

  window.addEventListener('resize', function () {
    if (!isMobile()) return;
    if (!isMemoModalOpen()) restoreViewport();
  });

  window.mobileMemoInputZoomGuard = {
    blur: blurActiveElement,
    restore: restoreViewport,
    closeKeyboardAndRestore: closeKeyboardAndRestore
  };
})();



/* =========================================================
   Mobile Memo Layout Reset JS v39
   - 모바일에서 PC 자유배치 inline style(left/top/width/transform 등)을 직접 초기화
   - PC 화면에서는 원래 inline style을 data 속성에 보관 후 복구
   - CSS만으로 안 잡히는 오른쪽 쏠림/좌표 잔상 방지
========================================================= */
(function () {
  'use strict';

  var MOBILE_QUERY = '(max-width: 768px)';
  var NOTE_SELECTOR = '#memo-board .memo-note, #memo-board-notes .memo-note, .memo-board .memo-note, .memo-board-notes .memo-note, [data-note-id], [data-memo-id]';
  var BOARD_SELECTOR = '#memo-board, .memo-board, #memo-board-notes, .memo-board-notes';

  var raf = 0;
  var resizeTimer = 0;

  function isMobile() {
    return window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
  }

  function isMemoMode() {
    return document.body && document.body.classList.contains('mobile-memo-list-mode');
  }

  function getViewportHeight() {
    return (window.visualViewport && window.visualViewport.height) || window.innerHeight || document.documentElement.clientHeight || 0;
  }

  function saveOriginalInline(el) {
    if (!el || el.dataset.mobileMemoOriginalStyleSaved === '1') return;
    el.dataset.mobileMemoOriginalStyleSaved = '1';
    el.dataset.mobileMemoOriginalStyle = el.getAttribute('style') || '';
  }

  function restoreOriginalInline(el) {
    if (!el || el.dataset.mobileMemoOriginalStyleSaved !== '1') return;
    var original = el.dataset.mobileMemoOriginalStyle || '';
    if (original) el.setAttribute('style', original);
    else el.removeAttribute('style');
    delete el.dataset.mobileMemoOriginalStyleSaved;
    delete el.dataset.mobileMemoOriginalStyle;
  }

  function resetInlineForMobile(el) {
    if (!el) return;
    saveOriginalInline(el);

    el.style.position = 'relative';
    el.style.left = '0px';
    el.style.top = 'auto';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.width = '100%';
    el.style.maxWidth = '100%';
    el.style.minWidth = '0';
    el.style.height = 'auto';
    el.style.maxHeight = 'none';
    el.style.transform = 'none';
    el.style.translate = 'none';
    el.style.rotate = '0deg';
    el.style.margin = '0 0 10px 0';
    el.style.boxSizing = 'border-box';
  }

  function resetBoardInlineForMobile(el) {
    if (!el) return;
    saveOriginalInline(el);

    if (el.matches && (el.matches('#memo-board-notes') || el.matches('.memo-board-notes'))) {
      el.style.position = 'static';
      el.style.left = 'auto';
      el.style.top = 'auto';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.width = '100%';
      el.style.maxWidth = '100%';
      el.style.minWidth = '0';
      el.style.height = 'auto';
      el.style.maxHeight = 'none';
      el.style.transform = 'none';
      el.style.pointerEvents = 'auto';
      el.style.overflow = 'visible';
      el.style.boxSizing = 'border-box';
      return;
    }

    el.style.position = 'relative';
    el.style.left = '0px';
    el.style.top = 'auto';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.width = '100%';
    el.style.maxWidth = '100%';
    el.style.minWidth = '0';
    el.style.transform = 'none';
    el.style.overflowX = 'hidden';
    el.style.overflowY = 'auto';
    el.style.boxSizing = 'border-box';
  }

  function applyHeight() {
    var wrap = document.querySelector('#tab-content .memo-wrap, #tab-content .card.memo-wrap, .memo-wrap');
    if (!wrap || !isMobile() || !isMemoMode()) {
      document.documentElement.style.removeProperty('--mobile-memo-wrap-height');
      return;
    }

    var rect = wrap.getBoundingClientRect();
    var viewportH = getViewportHeight();
    var bottomGap = 12;
    var available = Math.floor(viewportH - rect.top - bottomGap);

    var minHeight = Math.min(540, Math.max(380, Math.floor(viewportH * 0.58)));
    var maxHeight = Math.max(360, Math.floor(viewportH - 90));

    if (!available || available < minHeight) available = minHeight;
    if (available > maxHeight) available = maxHeight;

    document.documentElement.style.setProperty('--mobile-memo-wrap-height', available + 'px');
  }

  function applyMobileLayout() {
    raf = 0;

    var notes = Array.prototype.slice.call(document.querySelectorAll(NOTE_SELECTOR));
    var boards = Array.prototype.slice.call(document.querySelectorAll(BOARD_SELECTOR));

    if (!isMobile() || !isMemoMode()) {
      notes.forEach(restoreOriginalInline);
      boards.forEach(restoreOriginalInline);
      document.documentElement.style.removeProperty('--mobile-memo-wrap-height');
      return;
    }

    boards.forEach(resetBoardInlineForMobile);
    notes.forEach(resetInlineForMobile);
    applyHeight();
  }

  function scheduleApply() {
    if (raf) return;
    raf = window.requestAnimationFrame(applyMobileLayout);
  }

  function scheduleMultiApply() {
    scheduleApply();
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(scheduleApply, 80);
    window.setTimeout(scheduleApply, 220);
    window.setTimeout(scheduleApply, 520);
  }

  window.addEventListener('resize', scheduleMultiApply);
  window.addEventListener('orientationchange', scheduleMultiApply);
  document.addEventListener('DOMContentLoaded', scheduleMultiApply);
  document.addEventListener('click', function () {
    window.setTimeout(scheduleApply, 30);
    window.setTimeout(scheduleApply, 140);
  }, true);

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleMultiApply);
    window.visualViewport.addEventListener('scroll', scheduleApply);
  }

  var observer = new MutationObserver(function () {
    if (!isMobile()) return;
    scheduleApply();
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-note-id', 'data-memo-id']
    });
  }

  setTimeout(scheduleMultiApply, 250);
  setTimeout(scheduleMultiApply, 900);
  setTimeout(scheduleMultiApply, 1600);

  window.mobileMemoLayoutReset = {
    apply: applyMobileLayout,
    schedule: scheduleMultiApply
  };
})();



/* =========================================================
   Mobile Memo Viewport Width Clamp JS v40
   - 실제 #tab-content / home-root 폭을 측정해 memo-wrap 폭 CSS 변수 주입
   - 메모 상단 버튼 줄 때문에 viewport보다 넓어지는 현상 방지
   - 색상 필터 바도 같은 폭 기준 사용
========================================================= */
(function () {
  'use strict';

  var MOBILE_QUERY = '(max-width: 768px)';
  var raf = 0;

  function isMobile() {
    return window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
  }

  function isMemoMode() {
    return document.body && document.body.classList.contains('mobile-memo-list-mode');
  }

  function getRootWidth() {
    var root = document.querySelector('#tab-content.content') ||
               document.querySelector('#tab-content') ||
               document.querySelector('#home-page.home-root') ||
               document.body;

    var rect = root.getBoundingClientRect();
    var viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
    var width = Math.floor(Math.min(rect.width || viewportW, viewportW));

    if (width >= viewportW - 1) width = viewportW - 20;
    return Math.max(280, width);
  }

  function clampInlineWidth(el) {
    if (!el) return;
    el.style.maxWidth = '100%';
    el.style.minWidth = '0';
    el.style.left = '0px';
    el.style.right = 'auto';
    el.style.transform = 'none';
    el.style.translate = 'none';
    el.style.boxSizing = 'border-box';
  }

  function applyFilterScroll(bar, width) {
    if (!bar) return;
    bar.style.width = width + 'px';
    bar.style.maxWidth = width + 'px';
    bar.style.minWidth = '0';
    bar.style.overflowX = 'auto';
    bar.style.overflowY = 'hidden';
    bar.style.whiteSpace = 'nowrap';
    bar.style.display = 'flex';
    bar.style.flexWrap = 'nowrap';
    bar.style.boxSizing = 'border-box';
    bar.style.webkitOverflowScrolling = 'touch';

    Array.prototype.slice.call(bar.querySelectorAll('.mobile-memo-filter-chip, button')).forEach(function (chip) {
      chip.style.flex = '0 0 auto';
      chip.style.whiteSpace = 'nowrap';
      chip.style.maxWidth = 'none';
      chip.style.minWidth = 'max-content';
    });
  }

  function applyWidthClamp() {
    raf = 0;

    if (!isMobile() || !isMemoMode()) {
      document.documentElement.style.removeProperty('--mobile-memo-wrap-width');
      return;
    }

    var width = getRootWidth();
    document.documentElement.style.setProperty('--mobile-memo-wrap-width', width + 'px');

    [
      '.memo-wrap',
      '#memo-board',
      '.memo-board',
      '#memo-board-notes',
      '.memo-board-notes'
    ].forEach(function (selector) {
      Array.prototype.slice.call(document.querySelectorAll(selector)).forEach(clampInlineWidth);
    });

    Array.prototype.slice.call(document.querySelectorAll('#memo-board .memo-note, #memo-board-notes .memo-note, .memo-wrap [data-note-id], .memo-wrap [data-memo-id]')).forEach(function (note) {
      clampInlineWidth(note);
      note.style.width = '100%';
    });

    Array.prototype.slice.call(document.querySelectorAll('.mobile-memo-filter-bar')).forEach(function (bar) {
      applyFilterScroll(bar, width);
    });
  }

  function scheduleApply() {
    if (raf) return;
    raf = window.requestAnimationFrame(applyWidthClamp);
  }

  function scheduleMultiApply() {
    scheduleApply();
    setTimeout(scheduleApply, 80);
    setTimeout(scheduleApply, 220);
    setTimeout(scheduleApply, 520);
  }

  window.addEventListener('resize', scheduleMultiApply);
  window.addEventListener('orientationchange', scheduleMultiApply);
  document.addEventListener('DOMContentLoaded', scheduleMultiApply);
  document.addEventListener('click', function () {
    setTimeout(scheduleApply, 30);
    setTimeout(scheduleApply, 160);
  }, true);

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleMultiApply);
    window.visualViewport.addEventListener('scroll', scheduleApply);
  }

  var observer = new MutationObserver(function () {
    if (!isMobile()) return;
    scheduleApply();
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
  }

  setTimeout(scheduleMultiApply, 250);
  setTimeout(scheduleMultiApply, 900);
  setTimeout(scheduleMultiApply, 1600);

  window.mobileMemoViewportWidthClamp = {
    apply: applyWidthClamp,
    schedule: scheduleMultiApply
  };
})();
