/* AIC main rebuild clean version
   서버 저장/실시간/실제 번역 API는 추후 연결.
*/
(function () {
  'use strict';

  var els = {};
  var resizeTimer = null;

  var CONFIG = {
    defaultSettings: {
      defaultLang: 'ko',
      direction: 'auto',
      tone: 'business',
      display: 'both',
      autoTranslate: true
    },
    slotPolicy: {
      defaultVisibleSlots: 2,
      maxVisibleSlots: 3,
      notebookMaxSlots: 2,
      mobileMaxSlots: 1,
      notebookBreakpoint: 1280,
      mobileBreakpoint: 900
    }
  };

  if (window.AIC_CONFIG) {
    CONFIG.defaultSettings = Object.assign({}, CONFIG.defaultSettings, window.AIC_CONFIG.defaultSettings || {});
    CONFIG.slotPolicy = Object.assign({}, CONFIG.slotPolicy, window.AIC_CONFIG.slotPolicy || {});
  }

  var state = {
    activeSlotIndex: 0,
    visibleSlotCount: CONFIG.slotPolicy.defaultVisibleSlots,
    preferredSlotCount: CONFIG.slotPolicy.defaultVisibleSlots,
    openSlots: [],
    settings: loadSettings(),
    rooms: [
      {
        id: 'r1',
        name: 'Global R&D',
        members: '김남호 · Global Director',
        messages: [
          {
            type: 'me',
            sender: '김남호',
            original: '이번 폐수 보고서 관련해서 확인 부탁드립니다.',
            translated: 'Please review the wastewater report.'
          },
          {
            type: 'other',
            sender: 'Global Director',
            original: 'I will check it this afternoon.',
            translated: '오늘 오후에 확인하겠습니다.'
          },
          {
            type: 'me',
            sender: '김남호',
            original: '감사합니다. 수정 후 다시 공유드리겠습니다.',
            translated: 'Thank you. I will share the revised version again.'
          }
        ]
      },
      {
        id: 'r2',
        name: 'Wastewater Review',
        members: '김남호 · Reviewer',
        messages: [
          {
            type: 'me',
            sender: '김남호',
            original: '4월 보고서 검토 요청드립니다.',
            translated: 'Please review the April report.'
          }
        ]
      },
      {
        id: 'r3',
        name: 'QA Quick Check',
        members: '김남호 · QA',
        messages: [
          {
            type: 'other',
            sender: 'QA',
            original: 'Can you share the test condition?',
            translated: '시험 조건을 공유해주실 수 있나요?'
          }
        ]
      },
      {
        id: 'r4',
        name: 'Raw Material Talk',
        members: '김남호 · Supplier',
        messages: []
      }
    ]
  };

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function tr(key, fallback) {
    if (window.I18N && typeof window.I18N.t === 'function') {
      var value = window.I18N.t(key);
      return value && value !== key ? value : fallback;
    }
    return fallback;
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem('aic_user_settings');
      if (raw) return Object.assign({}, CONFIG.defaultSettings, JSON.parse(raw));
    } catch (_) {}
    return Object.assign({}, CONFIG.defaultSettings);
  }

  function saveSettingsToLocal() {
    try {
      localStorage.setItem('aic_user_settings', JSON.stringify(state.settings));
    } catch (_) {}
  }

  function getCurrentUserName() {
    var auth = window.aicAuth || {};
    var user = auth.user || {};
    return user.name || (user.email ? String(user.email).split('@')[0] : '') || '김남호';
  }

  function getToneLabel(value) {
    return ({
      business: '비즈니스 영어',
      meeting: '간단 회의 영어',
      polite: '정중한 이메일식 영어',
      casual: '캐주얼 대화식 영어'
    })[value] || '비즈니스 영어';
  }

  function fakeTranslate(text, lang) {
    if (!String(text || '').trim()) return '';
    if (!state.settings.autoTranslate) return tr('aic.autoTranslateOff', '자동번역 OFF 상태입니다.');

    var tone = getToneLabel(state.settings.tone);
    if (lang === 'ko') return '[' + tone + '] Preview translation: ' + text;
    return '[' + tone + '] ' + tr('aic.previewTranslation', '미리보기 번역') + ': ' + text;
  }

  function getRoom(roomId) {
    return state.rooms.find(function (room) { return room.id === roomId; }) || null;
  }

  function getOpenSlotIndex(roomId) {
    return state.openSlots.findIndex(function (slot) { return slot && slot.roomId === roomId; });
  }

  function getStableLayoutWidth() {
    var candidates = [];

    if (els && els.slots && els.slots.clientWidth) {
      candidates.push(els.slots.clientWidth);
    }

    if (els && els.root && els.root.clientWidth) {
      candidates.push(Math.max(0, els.root.clientWidth - 280));
    }

    if (document.documentElement && document.documentElement.clientWidth) {
      candidates.push(document.documentElement.clientWidth);
    }

    if (window.innerWidth) {
      candidates.push(window.innerWidth);
    }

    candidates = candidates.filter(function (width) {
      return Number(width) && width > 120;
    });

    if (!candidates.length) return window.innerWidth || 1024;

    // iframe 전환 순간에 clientWidth가 비정상적으로 작게 잡히는 것을 피하기 위해
    // 가장 큰 유효 폭을 기준으로 슬롯 수를 계산합니다.
    return Math.max.apply(null, candidates);
  }

  function getMaxSlotsByWidth() {
    var width = getStableLayoutWidth();
    var policy = CONFIG.slotPolicy;

    if (width < policy.mobileBreakpoint) return policy.mobileMaxSlots;
    if (width < policy.notebookBreakpoint) return policy.notebookMaxSlots;
    return policy.maxVisibleSlots;
  }

  function normalizeSlotCount() {
    return Math.max(1, Math.min(
      Number(state.preferredSlotCount) || CONFIG.slotPolicy.defaultVisibleSlots,
      getMaxSlotsByWidth(),
      CONFIG.slotPolicy.maxVisibleSlots
    ));
  }

  function ensureSlots(fill) {
    state.visibleSlotCount = normalizeSlotCount();

    while (state.openSlots.length > state.visibleSlotCount) {
      state.openSlots.pop();
    }

    if (fill !== false) {
      while (state.openSlots.length < state.visibleSlotCount && state.openSlots.length < state.rooms.length) {
        var room = state.rooms.find(function (r) {
          return getOpenSlotIndex(r.id) < 0;
        });
        if (!room) break;
        state.openSlots.push({ roomId: room.id, pinned: false });
      }
    }

    if (!state.openSlots.length && state.rooms[0]) {
      state.openSlots.push({ roomId: state.rooms[0].id, pinned: false });
    }

    if (state.activeSlotIndex >= state.openSlots.length) {
      state.activeSlotIndex = Math.max(0, state.openSlots.length - 1);
    }

    document.documentElement.style.setProperty('--aic-visible-slots', String(state.visibleSlotCount));
  }

  function openRoom(roomId) {
    var existing = getOpenSlotIndex(roomId);

    if (existing >= 0) {
      state.activeSlotIndex = existing;
      render();
      return;
    }

    if (state.openSlots.length < state.visibleSlotCount) {
      state.openSlots.push({ roomId: roomId, pinned: false });
      state.activeSlotIndex = state.openSlots.length - 1;
      render();
      return;
    }

    var target = state.activeSlotIndex;

    if (state.openSlots[target] && state.openSlots[target].pinned) {
      var freeIndex = state.openSlots.findIndex(function (slot) { return !slot.pinned; });
      if (freeIndex >= 0) target = freeIndex;
      else return;
    }

    state.openSlots[target] = { roomId: roomId, pinned: false };
    state.activeSlotIndex = target;
    render();
  }

  function closeSlot(index) {
    state.openSlots.splice(index, 1);
    if (state.activeSlotIndex >= state.openSlots.length) {
      state.activeSlotIndex = Math.max(0, state.openSlots.length - 1);
    }
    render(false);
  }

  function togglePin(index) {
    var slot = state.openSlots[index];
    if (!slot) return;
    slot.pinned = !slot.pinned;
    render(false);
  }

  function setPreferredSlotCount(count) {
    state.preferredSlotCount = Number(count) || 1;
    render(true);
  }

  function renderSlotButtons() {
    if (!els.slotButtons) return;

    var max = getMaxSlotsByWidth();

    els.slotButtons.innerHTML = [1, 2, 3].map(function (count) {
      return [
        '<button type="button" class="aic-slot-btn',
        state.visibleSlotCount === count ? ' active' : '',
        '" data-slot-count="', count, '"',
        count > max ? ' disabled' : '',
        '>', count, tr('aic.slotViewSuffix', '개 보기'), '</button>'
      ].join('');
    }).join('');

    Array.from(els.slotButtons.querySelectorAll('[data-slot-count]')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        setPreferredSlotCount(Number(btn.getAttribute('data-slot-count')));
      });
    });
  }

  function renderRoomList() {
    if (!els.roomList) return;

    els.roomList.innerHTML = state.rooms.map(function (room) {
      var slotIndex = getOpenSlotIndex(room.id);
      var open = slotIndex >= 0;

      return [
        '<div class="aic-room-item', open ? ' active' : '', '" data-room-id="', esc(room.id), '">',
        '  <div class="aic-room-name-row">',
        '    <div class="aic-room-name">', esc(room.name), '</div>',
        '    <div class="aic-room-slot', open ? ' open' : '', '">', open ? (tr('aic.open', '열림') + ' ' + (slotIndex + 1)) : '', '</div>',
        '  </div>',
        '  <div class="aic-room-meta">', esc(room.members), '<br>', room.messages.length, '개 메시지</div>',
        '</div>'
      ].join('');
    }).join('');

    Array.from(els.roomList.querySelectorAll('[data-room-id]')).forEach(function (el) {
      el.addEventListener('click', function () {
        openRoom(el.getAttribute('data-room-id'));
      });
    });
  }

  function buildMessage(msg) {
    var showOriginal = state.settings.display === 'both';
    var sender = msg.sender || (msg.type === 'me' ? getCurrentUserName() : '상대방');

    return [
      '<div class="aic-message ', msg.type === 'me' ? 'me' : 'other', '">',
      '  <div class="aic-message-name">', esc(sender), '</div>',
      showOriginal ? '<div class="aic-message-original">' + esc(msg.original) + '</div>' : '',
      '  <div class="', showOriginal ? 'aic-message-translated' : 'aic-message-original', '">', esc(msg.translated), '</div>',
      '</div>'
    ].join('');
  }

  function renderChatSlots() {
    if (!els.slots) return;

    var html = '';

    for (var i = 0; i < state.visibleSlotCount; i++) {
      var slot = state.openSlots[i];

      if (!slot) {
        html += '<div class="aic-empty-slot">' + tr('aic.selectRoom', '회의방을 선택하세요.') + '</div>';
        continue;
      }

      var room = getRoom(slot.roomId);
      if (!room) {
        html += '<div class="aic-empty-slot">' + tr('aic.roomNotFound', '회의방 정보가 없습니다.') + '</div>';
        continue;
      }

      var messages = room.messages.map(buildMessage).join('');
      if (!messages) {
        messages = '<div class="aic-empty-message">' + tr('aic.noMessages', '아직 메시지가 없습니다.') + '<br>' + tr('aic.writeMessageGuide', '아래 입력창으로 메시지를 작성하세요.') + '</div>';
      }

      html += [
        '<section class="aic-chat-window', i === state.activeSlotIndex ? ' active' : '', '" data-slot-index="', i, '">',
        '  <div class="aic-chat-head">',
        '    <div class="aic-chat-title-box">',
        '      <div class="aic-chat-title">', esc(room.name), '</div>',
        '      <div class="aic-chat-meta">', esc(room.members), ' · ', i + 1, tr('aic.slotNumberSuffix', '번 슬롯') + '</div>',
        '    </div>',
        '    <div class="aic-chat-actions">',
        '      <button class="aic-chat-action pin', slot.pinned ? ' active' : '', '" data-pin-slot="', i, '" type="button">', slot.pinned ? tr('aic.pinned', '고정됨') : tr('aic.pin', '고정'), '</button>',
        '      <button class="aic-chat-action" data-invite-slot="', i, '" type="button">참여자</button>',
        '      <button class="aic-chat-action dark" data-close-slot="', i, '" type="button">닫기</button>',
        '    </div>',
        '  </div>',
        '  <div class="aic-messages" data-message-box="', i, '">', messages, '</div>',
        '  <div class="aic-chat-input">',
        '    <select class="module-select" data-lang-slot="', i, '">',
        '      <option value="ko"', state.settings.defaultLang === 'ko' ? ' selected' : '', '>', tr('aic.korean', '한국어'), '</option>',
        '      <option value="en"', state.settings.defaultLang === 'en' ? ' selected' : '', '>English</option>',
        '    </select>',
        '    <input class="module-input" data-input-slot="', i, '" placeholder="', tr('aic.inputPlaceholder', '메시지를 입력하세요'), '" />',
        '    <button class="module-btn accent aic-send-btn" data-send-slot="', i, '" type="button">전송</button>',
        '  </div>',
        '</section>'
      ].join('');
    }

    els.slots.innerHTML = html;

    Array.from(els.slots.querySelectorAll('[data-slot-index]')).forEach(function (win) {
      win.addEventListener('mousedown', function () {
        state.activeSlotIndex = Number(win.getAttribute('data-slot-index')) || 0;
        render(false);
      });
    });

    Array.from(els.slots.querySelectorAll('[data-send-slot]')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        sendMessage(Number(btn.getAttribute('data-send-slot')) || 0);
      });
    });

    Array.from(els.slots.querySelectorAll('[data-input-slot]')).forEach(function (input) {
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          sendMessage(Number(input.getAttribute('data-input-slot')) || 0);
        }
      });
    });

    Array.from(els.slots.querySelectorAll('[data-close-slot]')).forEach(function (btn) {
      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        closeSlot(Number(btn.getAttribute('data-close-slot')) || 0);
      });
    });

    Array.from(els.slots.querySelectorAll('[data-pin-slot]')).forEach(function (btn) {
      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        togglePin(Number(btn.getAttribute('data-pin-slot')) || 0);
      });
    });

    Array.from(els.slots.querySelectorAll('[data-message-box]')).forEach(function (box) {
      box.scrollTop = box.scrollHeight;
    });
  }

  function sendMessage(slotIndex) {
    var slot = state.openSlots[slotIndex];
    if (!slot) return;

    var room = getRoom(slot.roomId);
    if (!room) return;

    var input = els.slots.querySelector('[data-input-slot="' + slotIndex + '"]');
    var lang = els.slots.querySelector('[data-lang-slot="' + slotIndex + '"]');
    var text = input ? input.value.trim() : '';

    if (!text) return;

    room.messages.push({
      type: 'me',
      sender: getCurrentUserName(),
      original: text,
      translated: fakeTranslate(text, lang ? lang.value : state.settings.defaultLang)
    });

    if (input) input.value = '';
    render(false);
  }

  function openRoomModal() {
    if (!els.roomModal) return;
    els.roomModal.hidden = false;
    setTimeout(function () {
      if (els.newRoomName) els.newRoomName.focus();
    }, 50);
  }

  function closeRoomModal() {
    if (els.roomModal) els.roomModal.hidden = true;
  }

  function createRoom() {
    var name = (els.newRoomName && els.newRoomName.value || '').trim() || tr('aic.newRoomDefaultName', '새 회의방');
    var members = (els.newRoomMembers && els.newRoomMembers.value || '').trim() || (getCurrentUserName() + ' · 참여자');
    var id = 'room_' + Date.now();

    state.rooms.unshift({
      id: id,
      name: name,
      members: members,
      messages: []
    });

    if (els.newRoomName) els.newRoomName.value = '';
    if (els.newRoomMembers) els.newRoomMembers.value = '';

    closeRoomModal();
    openRoom(id);
  }

  function openSettingsModal() {
    if (!els.settingsModal) return;

    els.setDefaultLang.value = state.settings.defaultLang;
    els.setDirection.value = state.settings.direction;
    els.setTone.value = state.settings.tone;
    els.setDisplay.value = state.settings.display;
    els.autoSwitch.classList.toggle('on', !!state.settings.autoTranslate);
    els.settingsModal.hidden = false;
  }

  function closeSettingsModal() {
    if (els.settingsModal) els.settingsModal.hidden = true;
  }

  function saveSettings() {
    state.settings.defaultLang = els.setDefaultLang.value;
    state.settings.direction = els.setDirection.value;
    state.settings.tone = els.setTone.value;
    state.settings.display = els.setDisplay.value;
    state.settings.autoTranslate = els.autoSwitch.classList.contains('on');

    saveSettingsToLocal();
    closeSettingsModal();
    render(false);
  }

  function bind() {
    if (els.createRoomBtn) els.createRoomBtn.addEventListener('click', openRoomModal);
    if (els.roomCancelBtn) els.roomCancelBtn.addEventListener('click', closeRoomModal);
    if (els.roomCreateBtn) els.roomCreateBtn.addEventListener('click', createRoom);

    if (els.settingsBtn) els.settingsBtn.addEventListener('click', openSettingsModal);
    if (els.settingsCancelBtn) els.settingsCancelBtn.addEventListener('click', closeSettingsModal);
    if (els.settingsSaveBtn) els.settingsSaveBtn.addEventListener('click', saveSettings);

    if (els.autoSwitch) {
      els.autoSwitch.addEventListener('click', function () {
        els.autoSwitch.classList.toggle('on');
      });
    }

    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        render(true);
      }, 120);
    });

    window.addEventListener('message', function (event) {
      var data = event && event.data ? event.data : {};
      if (
        data.type === 'portal-auth' ||
        data.type === 'portal-tabs-request' ||
        data.type === 'portal-frame-active' ||
        data.type === 'portal-layout-refresh'
      ) {
        scheduleRender();
      }
    });

    window.addEventListener('load', scheduleRender);
    window.addEventListener('pageshow', scheduleRender);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) scheduleRender();
    });
  }

  function cacheEls() {
    els.root = $('aicRoot');
    els.roomList = $('aicRoomList');
    els.slots = $('aicChatSlots');
    els.slotButtons = $('aicSlotButtons');

    els.createRoomBtn = $('aicCreateRoomBtn');
    els.settingsBtn = $('aicSettingsBtn');

    els.roomModal = $('aicRoomModal');
    els.newRoomName = $('aicNewRoomName');
    els.newRoomMembers = $('aicNewRoomMembers');
    els.roomCancelBtn = $('aicRoomCancelBtn');
    els.roomCreateBtn = $('aicRoomCreateConfirmBtn');

    els.settingsModal = $('aicSettingsModal');
    els.setDefaultLang = $('aicSetDefaultLang');
    els.setDirection = $('aicSetDirection');
    els.setTone = $('aicSetTone');
    els.setDisplay = $('aicSetDisplay');
    els.autoSwitch = $('aicAutoTranslateSwitch');
    els.settingsCancelBtn = $('aicSettingsCancelBtn');
    els.settingsSaveBtn = $('aicSettingsSaveBtn');
  }

  function render(fill) {
    ensureSlots(fill !== false);
    renderSlotButtons();
    renderRoomList();
    renderChatSlots();
  }

  function scheduleRender() {
    clearTimeout(resizeTimer);

    requestAnimationFrame(function () {
      render(true);

      requestAnimationFrame(function () {
        render(true);
      });
    });

    // iframe 전환 직후 포탈 레이아웃이 안정된 뒤 다시 계산
    resizeTimer = setTimeout(function () {
      render(true);
    }, 180);

    setTimeout(function () {
      render(true);
    }, 520);
  }

  window.aicRender = scheduleRender;

  function bootstrap() {
    cacheEls();
    bind();

    if (window.I18N && typeof window.I18N.changeLanguage === 'function' && !window.I18N.__aicPatched) {
      var originalChangeLanguage = window.I18N.changeLanguage.bind(window.I18N);
      window.I18N.changeLanguage = function (lang) {
        return Promise.resolve(originalChangeLanguage(lang)).then(function (result) {
          scheduleRender();
          return result;
        });
      };
      window.I18N.__aicPatched = true;
    }

    scheduleRender();

    if (window.aicNotifyTabsReady) {
      window.aicNotifyTabsReady();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
