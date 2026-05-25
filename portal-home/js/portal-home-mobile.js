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
   Mobile Unified Memo Modal v30
   - 메모 클릭/메모 추가를 같은 fullscreen UI로 통일
   - 기존 메모 추가 폼 이동 방식(v28/v29) 사용 안 함
   - 추가 저장은 기존 숨은 입력폼에 값을 넣고 기존 추가 버튼 클릭
========================================================= */
(function () {
  'use strict';

  var MOBILE_QUERY = '(max-width: 768px)';
  var CARD_SELECTOR = '.memo-card, .memo-item, .note-card, [data-memo-id], [data-note-id]';

  var modal = null;
  var mode = 'add';
  var currentCard = null;
  var hiddenAddForm = null;

  var colorMap = [
    { key: 'yellow', label: '노랑', color: '#facc15' },
    { key: 'blue', label: '파랑', color: '#60a5fa' },
    { key: 'green', label: '초록', color: '#4ade80' },
    { key: 'pink', label: '분홍', color: '#f9a8d4' },
    { key: 'purple', label: '보라', color: '#c084fc' },
    { key: 'white', label: '흰색', color: '#e2e8f0' }
  ];

  function isMobile() {
    return window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
  }

  function textOf(el) {
    return (el && (el.innerText || el.textContent) || '').trim();
  }

  function normText(el) {
    return textOf(el).replace(/\s+/g, '');
  }

  function setNativeValue(el, value) {
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function q(root, selectors) {
    if (!root || !root.querySelector) return null;
    for (var i = 0; i < selectors.length; i++) {
      var found = root.querySelector(selectors[i]);
      if (found) return found;
    }
    return null;
  }

  function findButton(root, names) {
    if (!root || !root.querySelectorAll) return null;
    var buttons = Array.prototype.slice.call(root.querySelectorAll('button'));
    return buttons.find(function (btn) {
      return names.indexOf(normText(btn)) >= 0;
    }) || null;
  }

  function getMemoTitle(card) {
    var el = q(card, ['.memo-title', '.note-title', '[class*="title"]']);
    var txt = textOf(el);
    if (txt && txt !== '상세보기' && txt !== '열기' && txt !== '닫기') return txt;

    var lines = textOf(card).split('\n').map(function (v) { return v.trim(); }).filter(Boolean);
    lines = lines.filter(function (v) {
      return ['상세보기', '열기', '닫기', '수정', '삭제', '저장'].indexOf(v) < 0;
    });
    return lines[0] || '메모';
  }

  function getMemoContent(card) {
    /*
      v32 본문 추출 보강
      1) data-* 속성에서 본문 후보 우선 확인
      2) 명시적 content/body/detail/textarea 후보 확인
      3) 카드 전체 텍스트에서 라벨/메타 제거
      4) 후보가 없으면 빈 값
    */
    var title = getMemoTitle(card);
    var blockedExact = [
      '상세보기', '열기', '닫기', '수정', '삭제', '저장',
      '#메모', '메모', 'MEMO', 'memo', '최근 메모', '최근메모',
      '개인 메모', '휴지통', '메모 추가'
    ];

    function cleanLine(v) {
      return (v || '').replace(/\u00a0/g, ' ').trim();
    }

    function isBlockedLine(v) {
      var raw = cleanLine(v);
      var compact = raw.replace(/\s+/g, '');
      if (!raw) return true;
      if (raw === title) return true;
      if (blockedExact.indexOf(raw) >= 0) return true;
      if (['#메모', '메모', 'MEMO', 'memo', '최근메모', '개인메모'].indexOf(compact) >= 0) return true;
      if (/^작성\s*:/.test(raw)) return true;
      if (/^수정\s*:/.test(raw)) return true;
      if (/^작성일\s*:/.test(raw)) return true;
      if (/^수정일\s*:/.test(raw)) return true;
      if (/^\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.?$/.test(raw)) return true;
      return false;
    }

    function normalizeText(value) {
      return (value || '')
        .split('\n')
        .map(cleanLine)
        .filter(function (line) { return !isBlockedLine(line); })
        .join('\n')
        .trim();
    }

    function getDatasetText(el) {
      if (!el || !el.dataset) return '';
      var keys = [
        'content', 'memoContent', 'noteContent', 'body', 'memoBody', 'noteBody',
        'text', 'memoText', 'noteText', 'detail', 'memoDetail', 'noteDetail',
        'description', 'desc', 'memo', 'note'
      ];

      for (var i = 0; i < keys.length; i++) {
        if (el.dataset[keys[i]]) {
          var cleaned = normalizeText(el.dataset[keys[i]]);
          if (cleaned) return cleaned;
        }
      }
      return '';
    }

    var fromCardDataset = getDatasetText(card);
    if (fromCardDataset) return fromCardDataset;

    var selectors = [
      '[data-content]', '[data-memo-content]', '[data-note-content]',
      '[data-body]', '[data-memo-body]', '[data-note-body]',
      '[data-text]', '[data-memo-text]', '[data-note-text]',
      '[data-detail]', '[data-memo-detail]', '[data-note-detail]',
      '[data-description]', '[data-desc]',
      '.memo-content', '.memo-body', '.memo-text', '.memo-detail',
      '.note-content', '.note-body', '.note-text', '.note-detail',
      '[class*="content"]', '[class*="body"]', '[class*="text"]', '[class*="detail"]',
      'textarea'
    ];

    for (var i = 0; i < selectors.length; i++) {
      var nodes = Array.prototype.slice.call(card.querySelectorAll(selectors[i]));
      for (var j = 0; j < nodes.length; j++) {
        var node = nodes[j];
        if (!node) continue;

        var datasetValue = getDatasetText(node);
        if (datasetValue) return datasetValue;

        var value = (node.tagName === 'TEXTAREA' || node.tagName === 'INPUT') ? (node.value || '') : textOf(node);
        var cleaned = normalizeText(value);
        if (cleaned) return cleaned;
      }
    }

    return normalizeText(textOf(card));
  }

  function getMemoMeta(card) {
    var lines = textOf(card).split('\n').map(function (v) { return v.trim(); }).filter(Boolean);
    return lines.filter(function (v) {
      return /^작성:/.test(v) || /^수정:/.test(v);
    }).join('\n');
  }

  function detectColor(card) {
    if (!card) return 'yellow';
    var raw = [
      card.dataset ? (card.dataset.color || card.dataset.memoColor || card.dataset.noteColor || card.dataset.mobileMemoColor || '') : '',
      card.className || '',
      card.getAttribute('style') || '',
      window.getComputedStyle(card).backgroundColor || ''
    ].join(' ').toLowerCase();

    if (raw.indexOf('blue') >= 0 || raw.indexOf('60a5fa') >= 0 || raw.indexOf('191, 219, 254') >= 0) return 'blue';
    if (raw.indexOf('green') >= 0 || raw.indexOf('4ade80') >= 0 || raw.indexOf('187, 247, 208') >= 0) return 'green';
    if (raw.indexOf('pink') >= 0 || raw.indexOf('rose') >= 0 || raw.indexOf('f9a8d4') >= 0) return 'pink';
    if (raw.indexOf('purple') >= 0 || raw.indexOf('violet') >= 0 || raw.indexOf('c084fc') >= 0) return 'purple';
    if (raw.indexOf('white') >= 0 || raw.indexOf('255, 255, 255') >= 0) return 'white';
    return 'yellow';
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
      '    <div class="mobile-memo-file-row">이미지는 기존 입력폼에서 처리됩니다</div>',
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
      '  <button type="button" class="mobile-memo-btn-secondary">수정</button>',
      '  <button type="button" class="mobile-memo-btn-primary">저장</button>',
      '</div>'
    ].join('');

    document.body.appendChild(modal);

    modal.querySelector('.mobile-memo-unified-close').addEventListener('click', closeModal);
    modal.querySelector('.mobile-memo-btn-secondary').addEventListener('click', function () {
      var ta = modal.querySelector('.mobile-memo-content-input');
      if (ta) {
        ta.focus();
        try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (_) {}
      }
    });
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

  function setColor(color) {
    if (!modal) return;
    modal.dataset.color = color;
    Array.prototype.slice.call(modal.querySelectorAll('.mobile-memo-color-chip')).forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.color === color);
    });
  }


  function findRelatedTextareaAfterEdit(card) {
    if (!card) return null;

    var selectors = [
      'textarea',
      '.memo-content textarea',
      '.memo-body textarea',
      '.memo-detail textarea',
      '.note-content textarea',
      '.note-body textarea',
      '.note-detail textarea'
    ];

    for (var i = 0; i < selectors.length; i++) {
      var found = card.querySelector(selectors[i]);
      if (found && found.value !== undefined) return found;
    }

    var nearby = card.parentElement ? card.parentElement.querySelector('textarea') : null;
    if (nearby && nearby.value !== undefined) return nearby;

    return null;
  }

  function hydrateMemoContentFromOriginal(card) {
    /*
      카드 DOM에 본문이 없는 경우:
      기존 PC용 수정/상세 버튼을 잠깐 눌러 textarea가 생성되면 그 값을 가져온다.
      화면은 모바일 모달이 덮고 있으므로 사용자는 기존 폼을 거의 보지 않음.
    */
    if (!card || !modal) return;

    var textarea = modal.querySelector('.mobile-memo-content-input');
    if (!textarea) return;

    var firstValue = (textarea.value || '').trim();
    if (firstValue) return;

    var editBtn = findButton(card, ['수정', '상세보기', '열기']);
    if (!editBtn) return;

    setTimeout(function () {
      try { editBtn.click(); } catch (_) {}

      setTimeout(function () {
        var originalTextarea = findRelatedTextareaAfterEdit(card);
        if (!originalTextarea) return;

        var value = (originalTextarea.value || '').trim();
        var compact = value.replace(/\s+/g, '');
        if (!value) return;
        if (compact === 'MEMO' || compact === 'memo' || compact === '#메모' || compact === '메모' || compact === '최근메모') return;

        var target = modal.querySelector('.mobile-memo-content-input');
        if (target && !(target.value || '').trim()) {
          target.value = value;
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, 120);
    }, 30);
  }


  function openModal(nextMode, card) {
    if (!isMobile()) return;

    mode = nextMode || 'add';
    currentCard = card || null;
    var m = ensureModal();

    var isAdd = mode === 'add';
    var title = isAdd ? '' : getMemoTitle(card);
    var content = isAdd ? '' : getMemoContent(card);
    var meta = isAdd ? '' : getMemoMeta(card);
    var color = isAdd ? 'yellow' : detectColor(card);

    m.querySelector('.mobile-memo-unified-title').textContent = isAdd ? '메모 추가' : (title || '메모');
    m.querySelector('.mobile-memo-title-input').value = title || '';
    m.querySelector('.mobile-memo-tag-input').value = '';
    m.querySelector('.mobile-memo-content-input').value = content || '';

    if (!isAdd) {
      hydrateMemoContentFromOriginal(card);
    }
    m.querySelector('.mobile-memo-pin-input').checked = false;
    m.querySelector('.mobile-memo-modal-meta').textContent = meta || '';
    m.querySelector('.mobile-memo-btn-delete').style.display = isAdd ? 'none' : '';
    m.querySelector('.mobile-memo-btn-secondary').textContent = isAdd ? '취소' : '수정';
    m.querySelector('.mobile-memo-btn-primary').textContent = isAdd ? '추가' : '저장';

    setColor(color);

    m.classList.add('is-open');
    document.body.classList.add('mobile-memo-modal-lock');

    setTimeout(function () {
      var first = isAdd ? m.querySelector('.mobile-memo-title-input') : m.querySelector('.mobile-memo-content-input');
      if (first) {
        try { first.focus({ preventScroll: true }); } catch (_) {}
      }
    }, 120);
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-open');
    document.body.classList.remove('mobile-memo-modal-lock');
    currentCard = null;
  }

  function findExistingAddForm() {
    if (hiddenAddForm && document.documentElement.contains(hiddenAddForm)) return hiddenAddForm;

    var candidates = Array.prototype.slice.call(document.querySelectorAll(
      '#tab-content form, #tab-content .card, #tab-content [class*="form"], #tab-content [class*="memo"], #tab-content div'
    )).filter(function (el) {
      if (!el || !el.querySelectorAll) return false;
      if (el.closest && el.closest('.mobile-memo-unified-modal')) return false;
      var text = normText(el);
      var hasTextarea = !!el.querySelector('textarea');
      var hasInput = !!el.querySelector('input');
      var hasAdd = Array.prototype.slice.call(el.querySelectorAll('button')).some(function (btn) {
        return ['추가', '저장'].indexOf(normText(btn)) >= 0;
      });
      return hasTextarea && hasInput && hasAdd &&
        (text.indexOf('메모추가') >= 0 || text.indexOf('색상선택') >= 0 || text.indexOf('이미지업로드') >= 0 || text.indexOf('상단고정') >= 0);
    });

    candidates.sort(function (a, b) {
      return a.getBoundingClientRect().height - b.getBoundingClientRect().height;
    });

    hiddenAddForm = candidates[0] || null;
    if (hiddenAddForm) hiddenAddForm.classList.add('mobile-memo-hidden-original-form');

    return hiddenAddForm;
  }

  function fillAddFormAndSubmit() {
    var form = findExistingAddForm();
    if (!form || !modal) return false;

    var title = modal.querySelector('.mobile-memo-title-input').value || '';
    var tag = modal.querySelector('.mobile-memo-tag-input').value || '';
    var content = modal.querySelector('.mobile-memo-content-input').value || '';
    var pin = modal.querySelector('.mobile-memo-pin-input').checked;
    var color = modal.dataset.color || 'yellow';

    var textInputs = Array.prototype.slice.call(form.querySelectorAll('input[type="text"], input:not([type])'));
    if (textInputs[0]) setNativeValue(textInputs[0], title);
    if (textInputs[1]) setNativeValue(textInputs[1], tag);

    var textarea = form.querySelector('textarea');
    if (textarea) setNativeValue(textarea, content);

    var select = form.querySelector('select');
    if (select) setNativeValue(select, color);

    var colorInput = form.querySelector('input[type="color"]');
    if (colorInput) {
      var found = colorMap.find(function (item) { return item.key === color; });
      setNativeValue(colorInput, found ? found.color : '#facc15');
    }

    var checkboxes = Array.prototype.slice.call(form.querySelectorAll('input[type="checkbox"]'));
    if (checkboxes[0]) {
      checkboxes[0].checked = !!pin;
      checkboxes[0].dispatchEvent(new Event('change', { bubbles: true }));
    }

    var addBtn = findButton(form, ['추가', '저장']);
    if (addBtn) {
      addBtn.click();
      return true;
    }

    return false;
  }

  function saveExistingMemo() {
    if (!currentCard || !modal) return;

    var title = modal.querySelector('.mobile-memo-title-input').value || '';
    var content = modal.querySelector('.mobile-memo-content-input').value || '';

    var titleEl = q(currentCard, ['.memo-title', '.note-title', '[class*="title"]']);
    var contentEl = q(currentCard, [
      '.memo-content', '.memo-body', '.memo-text', '.memo-detail',
      '.note-content', '.note-body', '.note-text', '.note-detail',
      'textarea'
    ]);

    if (titleEl) {
      if (titleEl.tagName === 'INPUT' || titleEl.tagName === 'TEXTAREA') setNativeValue(titleEl, title);
      else titleEl.textContent = title;
    }

    if (contentEl) {
      if (contentEl.tagName === 'INPUT' || contentEl.tagName === 'TEXTAREA') setNativeValue(contentEl, content);
      else contentEl.textContent = content;
    }

    var editBtn = findButton(currentCard, ['수정', '저장', '수정저장']);

    if (!contentEl && editBtn) {
      try { editBtn.click(); } catch (_) {}
      setTimeout(function () {
        var originalTextarea = findRelatedTextareaAfterEdit(currentCard);
        if (originalTextarea) setNativeValue(originalTextarea, content);

        var saveBtn = findButton(currentCard, ['저장', '수정저장']);
        if (saveBtn) {
          try { saveBtn.click(); } catch (_) {}
        }
      }, 120);
      return;
    }

    if (editBtn) setTimeout(function () { try { editBtn.click(); } catch (_) {} }, 30);
  }

  function saveModal() {
    if (mode === 'add') {
      var ok = fillAddFormAndSubmit();
      if (ok) closeModal();
      return;
    }

    saveExistingMemo();
    closeModal();
  }

  function deleteMemo() {
    if (mode === 'add') {
      closeModal();
      return;
    }

    if (!currentCard) return;
    var btn = findButton(currentCard, ['삭제', '휴지통']);
    closeModal();
    if (btn) setTimeout(function () { try { btn.click(); } catch (_) {} }, 30);
  }

  document.addEventListener('click', function (event) {
    if (!isMobile()) return;

    if (event.target.closest('.mobile-memo-unified-modal')) return;

    var control = event.target.closest('button, a, [role="button"]');
    if (control && normText(control) === '메모추가') {
      event.preventDefault();
      event.stopPropagation();

      /* 기존 폼이 필요한 경우를 대비해 원래 버튼 클릭으로 폼 생성 */
      try { control.click(); } catch (_) {}
      setTimeout(function () { openModal('add'); }, 80);
      setTimeout(function () { if (!modal || !modal.classList.contains('is-open')) openModal('add'); }, 220);
      return;
    }

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

    openModal('edit', card);
  }, true);

  window.addEventListener('resize', function () {
    if (!isMobile()) closeModal();
  });
})();



/* =========================================================
   Mobile Memo Content Extract Fix v31
   - v30 메모 상세에서 MEMO/#메모/최근 메모가 본문으로 들어가는 현상 보정
========================================================= */
(function () {
  'use strict';

  function cleanOpenedMemoTextarea() {
    var modal = document.querySelector('.mobile-memo-unified-modal.is-open');
    if (!modal) return;

    var textarea = modal.querySelector('.mobile-memo-content-input');
    if (!textarea) return;

    var compact = (textarea.value || '').replace(/\s+/g, '').trim();
    if (compact === 'MEMO' || compact === 'memo' || compact === '#메모' || compact === '메모' || compact === '최근메모') {
      textarea.value = '';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  document.addEventListener('click', function () {
    setTimeout(cleanOpenedMemoTextarea, 120);
    setTimeout(cleanOpenedMemoTextarea, 260);
  }, true);

  window.addEventListener('resize', cleanOpenedMemoTextarea);
})();



/* =========================================================
   Mobile Memo Existing Detail Bridge Fix v32
   - 카드 DOM에 본문이 없을 때 기존 수정/상세 textarea에서 본문을 가져오기 위한 보정
   - 제목 수정은 유지, 본문만 추가 연결
========================================================= */
(function () {
  'use strict';

  function cleanMemoModalPlaceholderLikeText() {
    var modal = document.querySelector('.mobile-memo-unified-modal.is-open');
    if (!modal) return;
    var textarea = modal.querySelector('.mobile-memo-content-input');
    if (!textarea) return;

    var compact = (textarea.value || '').replace(/\s+/g, '').trim();
    if (compact === 'MEMO' || compact === 'memo' || compact === '#메모' || compact === '메모' || compact === '최근메모') {
      textarea.value = '';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  document.addEventListener('click', function () {
    setTimeout(cleanMemoModalPlaceholderLikeText, 180);
    setTimeout(cleanMemoModalPlaceholderLikeText, 420);
  }, true);
})();

