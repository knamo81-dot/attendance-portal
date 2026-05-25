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
   Mobile Memo Fullscreen Modal Improve v22
   - 메모 클릭 시 전체화면 내용 수정 모달
   - textarea 활성화
   - 삭제/수정/저장 버튼 동작 보정
========================================================= */
(function () {
  'use strict';

  var MOBILE_QUERY = '(max-width: 768px)';
  var CARD_SELECTOR = '.memo-card, .memo-item, .note-card, [data-memo-id], [data-note-id]';
  var modal = null;
  var currentCard = null;

  function isMobile() {
    return window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
  }

  function textOf(el) {
    return (el && (el.innerText || el.textContent) || '').trim();
  }

  function q(card, selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var found = card.querySelector(selectors[i]);
      if (found) return found;
    }
    return null;
  }

  function findButton(card, names) {
    var buttons = Array.prototype.slice.call(card.querySelectorAll('button'));
    return buttons.find(function (btn) {
      var t = textOf(btn).replace(/\s+/g, '');
      return names.indexOf(t) >= 0;
    }) || null;
  }

  function getMemoTitle(card) {
    var el = q(card, ['.memo-title', '.note-title', '[class*="title"]']);
    var txt = textOf(el);
    if (txt && txt !== '상세보기' && txt !== '열기') return txt;

    var lines = textOf(card).split('\n').map(function (v) { return v.trim(); }).filter(Boolean);
    lines = lines.filter(function (v) {
      return v !== '상세보기' && v !== '열기' && v !== '닫기' && v !== '수정' && v !== '삭제';
    });
    return lines[0] || '메모';
  }

  function getMemoContent(card) {
    var el = q(card, [
      '.memo-content',
      '.memo-body',
      '.memo-text',
      '.memo-detail',
      '.note-content',
      '.note-body',
      '.note-text',
      '.note-detail',
      'textarea'
    ]);

    if (el) {
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value || '';
      return textOf(el);
    }

    var title = getMemoTitle(card);
    var lines = textOf(card).split('\n').map(function (v) { return v.trim(); }).filter(Boolean);
    var filtered = lines.filter(function (v) {
      return v !== title &&
        v !== '상세보기' &&
        v !== '열기' &&
        v !== '닫기' &&
        v !== '수정' &&
        v !== '삭제' &&
        !/^#?메모$/.test(v) &&
        !/^최근 메모$/.test(v) &&
        !/^작성:/.test(v) &&
        !/^수정:/.test(v);
    });

    return filtered.join('\n').trim();
  }

  function getMemoMeta(card) {
    var lines = textOf(card).split('\n').map(function (v) { return v.trim(); }).filter(Boolean);
    return lines.filter(function (v) {
      return /^작성:/.test(v) || /^수정:/.test(v);
    }).join('\n');
  }

  function ensureModal() {
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'mobile-memo-fullscreen-modal';
    modal.innerHTML = [
      '<div class="mobile-memo-modal-header">',
      '  <div class="mobile-memo-modal-title">메모</div>',
      '  <button type="button" class="mobile-memo-modal-close">닫기</button>',
      '</div>',
      '<div class="mobile-memo-modal-body">',
      '  <div class="mobile-memo-modal-content-label">내용</div>',
      '  <textarea class="mobile-memo-modal-textarea" placeholder="메모 내용을 입력하세요"></textarea>',
      '  <div class="mobile-memo-modal-meta"></div>',
      '</div>',
      '<div class="mobile-memo-modal-actions">',
      '  <button type="button" class="mobile-memo-modal-delete">삭제</button>',
      '  <button type="button" class="mobile-memo-modal-edit">수정</button>',
      '  <button type="button" class="mobile-memo-modal-save">저장</button>',
      '</div>'
    ].join('');

    document.body.appendChild(modal);

    modal.querySelector('.mobile-memo-modal-close').addEventListener('click', closeModal);
    modal.querySelector('.mobile-memo-modal-delete').addEventListener('click', deleteMemo);
    modal.querySelector('.mobile-memo-modal-edit').addEventListener('click', focusContent);
    modal.querySelector('.mobile-memo-modal-save').addEventListener('click', saveModal);

    return modal;
  }

  function openModal(card) {
    if (!card || !isMobile()) return;

    currentCard = card;
    var m = ensureModal();

    var title = getMemoTitle(card);
    var content = getMemoContent(card);
    var meta = getMemoMeta(card);

    m.querySelector('.mobile-memo-modal-title').textContent = title || '메모';
    m.querySelector('.mobile-memo-modal-textarea').value = content || '';
    m.querySelector('.mobile-memo-modal-meta').textContent = meta || '';

    m.classList.add('is-open');
    document.body.classList.add('mobile-memo-modal-lock');
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-open');
    document.body.classList.remove('mobile-memo-modal-lock');
    currentCard = null;
  }

  function focusContent() {
    if (!modal) return;
    var ta = modal.querySelector('.mobile-memo-modal-textarea');
    if (ta) {
      ta.disabled = false;
      ta.readOnly = false;
      ta.focus();
      try {
        ta.setSelectionRange(ta.value.length, ta.value.length);
      } catch (_) {}
    }
  }

  function setNativeValue(el, value) {
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function saveModal() {
    if (!currentCard || !modal) return;

    var content = modal.querySelector('.mobile-memo-modal-textarea').value || '';

    var contentEl = q(currentCard, [
      '.memo-content',
      '.memo-body',
      '.memo-text',
      '.memo-detail',
      '.note-content',
      '.note-body',
      '.note-text',
      '.note-detail',
      'textarea'
    ]);

    if (contentEl) {
      if (contentEl.tagName === 'INPUT' || contentEl.tagName === 'TEXTAREA') setNativeValue(contentEl, content);
      else contentEl.textContent = content;
    }

    var editBtn = findButton(currentCard, ['수정', '저장', '수정저장']);
    closeModal();

    if (editBtn) {
      setTimeout(function () {
        try { editBtn.click(); } catch (_) {}
      }, 30);
    }
  }

  function deleteMemo() {
    if (!currentCard) return;
    var btn = findButton(currentCard, ['삭제', '휴지통']);
    if (btn) {
      closeModal();
      setTimeout(function () {
        try { btn.click(); } catch (_) {}
      }, 30);
    }
  }

  document.addEventListener('click', function (event) {
    if (!isMobile()) return;
    if (event.target.closest('.mobile-memo-fullscreen-modal')) return;
    if (event.target.closest('.mobile-memo-filter-bar')) return;
    if (event.target.closest('button, a, input, textarea, select, label')) return;

    var card = event.target.closest(CARD_SELECTOR);
    if (!card || card.classList.contains('mobile-memo-hidden')) return;
    if (!document.body.classList.contains('mobile-memo-list-mode')) return;

    event.preventDefault();
    event.stopPropagation();

    Array.prototype.slice.call(document.querySelectorAll(CARD_SELECTOR)).forEach(function (item) {
      item.classList.remove('mobile-memo-open');
    });

    openModal(card);
  }, true);

  window.addEventListener('resize', function () {
    if (!isMobile()) closeModal();
  });
})();



/* =========================================================
   Mobile Memo Add Screen v28
   - 모바일에서 메모 추가 폼을 전체화면 입력 화면으로 전환
   - 기존 추가/취소 버튼 로직은 그대로 재사용
========================================================= */
(function () {
  'use strict';

  var MOBILE_QUERY = '(max-width: 768px)';
  var activeForm = null;

  function isMobile() {
    return window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
  }

  function normText(el) {
    return (el && (el.innerText || el.textContent) || '').replace(/\s+/g, '').trim();
  }

  function isMemoAddButton(el) {
    if (!el || !el.matches || !el.matches('button, a, [role="button"]')) return false;
    var t = normText(el);
    return t === '메모추가' || t === '추가';
  }

  function looksLikeMemoAddForm(el) {
    if (!el || !el.querySelectorAll) return false;
    var text = normText(el);
    var hasTextarea = !!el.querySelector('textarea');
    var hasInput = !!el.querySelector('input');
    var hasAdd = Array.prototype.slice.call(el.querySelectorAll('button')).some(function (btn) {
      var t = normText(btn);
      return t === '추가' || t === '저장';
    });
    var hasCancel = Array.prototype.slice.call(el.querySelectorAll('button')).some(function (btn) {
      return normText(btn) === '취소';
    });

    return hasTextarea && hasInput && hasAdd && (hasCancel || text.indexOf('메모추가') >= 0 || text.indexOf('색상선택') >= 0);
  }

  function findMemoAddForm() {
    var candidates = Array.prototype.slice.call(document.querySelectorAll(
      '#tab-content form, #tab-content .card, #tab-content .modal, #tab-content [class*="modal"], #tab-content [class*="form"], #tab-content [class*="memo"]'
    ));

    var matched = candidates.filter(looksLikeMemoAddForm);
    if (matched.length === 0) return null;

    matched.sort(function (a, b) {
      return a.getBoundingClientRect().width * a.getBoundingClientRect().height -
             b.getBoundingClientRect().width * b.getBoundingClientRect().height;
    });

    return matched[0];
  }

  function collectActionButtons(form) {
    var buttons = Array.prototype.slice.call(form.querySelectorAll('button')).filter(function (btn) {
      var t = normText(btn);
      return t === '취소' || t === '추가' || t === '저장';
    });

    if (buttons.length === 0) return;

    var row = form.querySelector(':scope > .mobile-memo-add-actions');
    if (!row) {
      row = document.createElement('div');
      row.className = 'mobile-memo-add-actions';
      form.appendChild(row);
    }

    buttons.forEach(function (btn) {
      if (btn.parentElement !== row) row.appendChild(btn);
    });
  }

  function openAddScreen() {
    if (!isMobile()) return;

    var form = findMemoAddForm();
    if (!form) return;

    activeForm = form;
    form.classList.add('mobile-memo-add-screen');
    document.body.classList.add('mobile-memo-add-lock');

    collectActionButtons(form);

    var first = form.querySelector('input[type="text"], input:not([type]), textarea');
    if (first) {
      setTimeout(function () {
        try { first.focus({ preventScroll: true }); } catch (_) {}
      }, 120);
    }
  }

  function closeAddScreen() {
    if (activeForm) {
      activeForm.classList.remove('mobile-memo-add-screen');
      activeForm = null;
    }
    document.body.classList.remove('mobile-memo-add-lock');
  }

  document.addEventListener('click', function (event) {
    if (!isMobile()) return;

    var target = event.target && event.target.closest ? event.target.closest('button, a, [role="button"]') : null;

    if (target && isMemoAddButton(target) && !target.closest('.mobile-memo-add-screen')) {
      setTimeout(openAddScreen, 80);
      setTimeout(openAddScreen, 220);
      return;
    }

    if (target && target.closest('.mobile-memo-add-screen')) {
      var t = normText(target);
      if (t === '취소' || t === '추가' || t === '저장') {
        setTimeout(closeAddScreen, 120);
      }
    }
  }, true);

  var observer = new MutationObserver(function () {
    if (!isMobile()) return;
    if (activeForm) return;
    setTimeout(openAddScreen, 40);
  });

  if (document.getElementById('tab-content')) {
    observer.observe(document.getElementById('tab-content'), { childList: true, subtree: true });
  }

  window.addEventListener('resize', function () {
    if (!isMobile()) closeAddScreen();
  });
})();
