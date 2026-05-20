/* AIC main rebuild clean version
   Supabase 저장 연결 버전
   - 회의방: public.aic_rooms
   - 메시지: public.aic_messages
   - 참여자: public.aic_room_members
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
    activeParticipantsRoomId: '',
    visibleSlotCount: CONFIG.slotPolicy.defaultVisibleSlots,
    preferredSlotCount: CONFIG.slotPolicy.defaultVisibleSlots,
    openSlots: [],
    settings: loadSettings(),
    rooms: [],
    dbReady: false,
    dbLoading: false
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

  function getPortalSession() {
    try {
      if (window.parent && typeof window.parent.getPortalSession === 'function') {
        return window.parent.getPortalSession() || {};
      }
    } catch (_) {}

    try {
      if (window.parent && window.parent.portalSession) {
        return window.parent.portalSession || {};
      }
    } catch (_) {}

    return window.portalSession || {};
  }

  function getSupabaseClient() {
    try {
      var session = getPortalSession();
      if (session && session.supabase) return session.supabase;
    } catch (_) {}

    try {
      if (window.parent && window.parent.portalSupabase) {
        return window.parent.portalSupabase;
      }
    } catch (_) {}

    if (window.portalSupabase) return window.portalSupabase;
    if (window.aicSupabase) return window.aicSupabase;

    return null;
  }

  function getCompanyId() {
    var session = getPortalSession();
    return String(
      session.companyId ||
      session.company_id ||
      session.company?.id ||
      session.company?.company_id ||
      window.currentCompanyId ||
      ''
    ).trim();
  }

  function getCurrentUserEmail() {
    var auth = window.aicAuth || {};
    var user = auth.user || {};
    var session = getPortalSession();

    return String(
      user.email ||
      session.email ||
      session.user?.email ||
      session.profile?.email ||
      ''
    ).trim();
  }

  function getCurrentUserName() {
    var auth = window.aicAuth || {};
    var user = auth.user || {};
    var session = getPortalSession();

    return (
      user.name ||
      session.profile?.name ||
      session.user?.name ||
      session.user_name ||
      session.name ||
      (getCurrentUserEmail() ? getCurrentUserEmail().split('@')[0] : '') ||
      '사용자'
    );
  }

  function showDbWarn(message) {
    console.warn('[AIC DB]', message);
  }

  function normalizeDbRoom(row, membersByRoom, messagesByRoom) {
    var roomId = String(row.id || '');
    var members = membersByRoom[roomId] || [];
    var messages = messagesByRoom[roomId] || [];
    var currentEmail = getCurrentUserEmail();

    return {
      id: roomId,
      name: row.name || '회의방',
      members: members.map(function (member) {
        return member.user_name || member.user_email || '';
      }).filter(Boolean).join(' · '),
      memberList: members.map(function (member) {
        return {
          id: member.id || '',
          name: member.user_name || member.user_email || '',
          email: member.user_email || '',
          role: member.role || '',
          language: member.language || 'ko'
        };
      }),
      messages: messages.map(function (message) {
        var senderEmail = String(message.sender_email || '').trim();
        return {
          id: message.id || '',
          type: senderEmail && currentEmail && senderEmail === currentEmail ? 'me' : 'other',
          sender: message.sender_name || senderEmail || '상대방',
          original: message.original || '',
          translated: message.translated || '',
          created_at: message.created_at || ''
        };
      })
    };
  }

  async function loadRoomsFromServer() {
    var sb = getSupabaseClient();
    var companyId = getCompanyId();

    if (!sb || !companyId) {
      state.dbReady = false;
      state.rooms = [];
      render(false);
      return;
    }

    state.dbLoading = true;

    try {
      var roomsResult = await sb
        .from('aic_rooms')
        .select('*')
        .eq('company_id', companyId)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false });

      if (roomsResult.error) throw roomsResult.error;

      var roomRows = Array.isArray(roomsResult.data) ? roomsResult.data : [];
      var roomIds = roomRows.map(function (room) { return String(room.id || ''); }).filter(Boolean);

      if (!roomIds.length) {
        state.rooms = [];
        state.openSlots = [];
        state.dbReady = true;
        render(false);
        return;
      }

      var membersResult = await sb
        .from('aic_room_members')
        .select('*')
        .eq('company_id', companyId)
        .in('room_id', roomIds)
        .order('created_at', { ascending: true });

      if (membersResult.error) throw membersResult.error;

      var messagesResult = await sb
        .from('aic_messages')
        .select('*')
        .eq('company_id', companyId)
        .in('room_id', roomIds)
        .order('created_at', { ascending: true });

      if (messagesResult.error) throw messagesResult.error;

      var membersByRoom = {};
      (membersResult.data || []).forEach(function (member) {
        var roomId = String(member.room_id || '');
        if (!membersByRoom[roomId]) membersByRoom[roomId] = [];
        membersByRoom[roomId].push(member);
      });

      var messagesByRoom = {};
      (messagesResult.data || []).forEach(function (message) {
        var roomId = String(message.room_id || '');
        if (!messagesByRoom[roomId]) messagesByRoom[roomId] = [];
        messagesByRoom[roomId].push(message);
      });

      state.rooms = roomRows.map(function (row) {
        return normalizeDbRoom(row, membersByRoom, messagesByRoom);
      });

      state.openSlots = state.openSlots.filter(function (slot) {
        return slot && getRoom(slot.roomId);
      });

      state.dbReady = true;
      render(true);
    } catch (error) {
      state.dbReady = false;
      showDbWarn(error?.message || error);
      state.rooms = [];
      state.openSlots = [];
      render(false);
      alert('AIC 서버 데이터 조회 실패: Supabase 테이블 생성 SQL을 먼저 실행했는지 확인해 주세요.\n\n' + (error?.message || ''));
    } finally {
      state.dbLoading = false;
    }
  }

  async function insertRoomToServer(room) {
    var sb = getSupabaseClient();
    var companyId = getCompanyId();
    if (!sb || !companyId || !room) return;

    var now = new Date().toISOString();
    var userEmail = getCurrentUserEmail();
    var userName = getCurrentUserName();

    var roomResult = await sb.from('aic_rooms').insert({
      id: room.id,
      company_id: companyId,
      name: room.name,
      created_by_email: userEmail,
      created_by_name: userName,
      created_at: now,
      updated_at: now
    });

    if (roomResult.error) throw roomResult.error;

    var members = getRoomMembers(room);
    if (!members.length) {
      members = [{ name: userName, email: userEmail }];
      room.memberList = members;
      syncRoomMembersText(room);
    }

    var memberRows = members.map(function (member) {
      return {
        company_id: companyId,
        room_id: room.id,
        user_name: member.name || member.email || '',
        user_email: member.email || '',
        role: member.role || '',
        language: member.language || 'ko'
      };
    });

    if (memberRows.length) {
      var memberResult = await sb.from('aic_room_members').insert(memberRows);
      if (memberResult.error) throw memberResult.error;
    }
  }

  async function insertMessageToServer(room, message) {
    var sb = getSupabaseClient();
    var companyId = getCompanyId();
    if (!sb || !companyId || !room || !message) return;

    var messageResult = await sb.from('aic_messages').insert({
      company_id: companyId,
      room_id: room.id,
      sender_name: message.sender || getCurrentUserName(),
      sender_email: getCurrentUserEmail(),
      original: message.original || '',
      translated: message.translated || ''
    }).select('id, created_at').maybeSingle();

    if (messageResult.error) throw messageResult.error;

    if (messageResult.data) {
      message.id = messageResult.data.id || message.id;
      message.created_at = messageResult.data.created_at || message.created_at;
    }

    try {
      await sb
        .from('aic_rooms')
        .update({ updated_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .eq('id', room.id);
    } catch (_) {}
  }

  async function insertParticipantToServer(room, member) {
    var sb = getSupabaseClient();
    var companyId = getCompanyId();
    if (!sb || !companyId || !room || !member) return null;

    var result = await sb.from('aic_room_members').insert({
      company_id: companyId,
      room_id: room.id,
      user_name: member.name || member.email || '',
      user_email: member.email || '',
      role: member.role || '',
      language: member.language || 'ko'
    }).select('id').maybeSingle();

    if (result.error) throw result.error;
    return result.data?.id || null;
  }

  async function deleteParticipantFromServer(room, member) {
    var sb = getSupabaseClient();
    var companyId = getCompanyId();
    if (!sb || !companyId || !room || !member) return;

    var query = sb
      .from('aic_room_members')
      .delete()
      .eq('company_id', companyId)
      .eq('room_id', room.id);

    if (member.id) {
      query = query.eq('id', member.id);
    } else if (member.email) {
      query = query.eq('user_email', member.email);
    } else {
      query = query.eq('user_name', member.name || '');
    }

    var result = await query;
    if (result.error) throw result.error;
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

    if (!state.rooms.length) {
      els.roomList.innerHTML = '<div class="aic-empty-message">회의방이 없습니다.<br>+ 버튼으로 새 회의방을 생성하세요.</div>';
      return;
    }

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
      win.addEventListener('mousedown', function (event) {
        // 입력창/버튼/select를 클릭할 때 render가 다시 실행되면
        // DOM이 교체되어 타이핑·버튼 클릭이 끊기므로 인터랙션 요소는 제외합니다.
        if (event.target && event.target.closest('input, textarea, select, button, [contenteditable="true"]')) {
          return;
        }

        state.activeSlotIndex = Number(win.getAttribute('data-slot-index')) || 0;

        // 이미 활성 슬롯이면 불필요한 재렌더링을 하지 않습니다.
        if (win.classList.contains('active')) return;

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

    Array.from(els.slots.querySelectorAll('[data-invite-slot]')).forEach(function (btn) {
      btn.addEventListener('click', function (event) {
        event.stopPropagation();
        openParticipantsModal(Number(btn.getAttribute('data-invite-slot')) || 0);
      });
    });

    Array.from(els.slots.querySelectorAll('[data-message-box]')).forEach(function (box) {
      box.scrollTop = box.scrollHeight;
    });
  }

  async function sendMessage(slotIndex) {
    var slot = state.openSlots[slotIndex];
    if (!slot) return;

    var room = getRoom(slot.roomId);
    if (!room) return;

    var input = els.slots.querySelector('[data-input-slot="' + slotIndex + '"]');
    var lang = els.slots.querySelector('[data-lang-slot="' + slotIndex + '"]');
    var text = input ? input.value.trim() : '';

    if (!text) return;

    var message = {
      type: 'me',
      sender: getCurrentUserName(),
      original: text,
      translated: fakeTranslate(text, lang ? lang.value : state.settings.defaultLang)
    };

    room.messages.push(message);

    if (input) input.value = '';
    render(false);

    try {
      await insertMessageToServer(room, message);
    } catch (error) {
      alert('메시지 저장 실패: ' + (error?.message || 'Supabase 연결/테이블을 확인해 주세요.'));
    }
  }


  function splitMembers(value) {
    return String(value || '')
      .split('·')
      .map(function (item) { return item.trim(); })
      .filter(Boolean);
  }

  function getRoomMembers(room) {
    if (!room) return [];
    if (!Array.isArray(room.memberList)) {
      room.memberList = splitMembers(room.members).map(function (name) {
        return { name: name, email: '' };
      });
    }
    return room.memberList;
  }

  function syncRoomMembersText(room) {
    if (!room) return;
    room.members = getRoomMembers(room).map(function (member) {
      return member.name || member.email || '';
    }).filter(Boolean).join(' · ');
  }

  function openParticipantsModal(slotIndex) {
    var slot = state.openSlots[slotIndex];
    if (!slot) return;

    var room = getRoom(slot.roomId);
    if (!room || !els.participantsModal) return;

    state.activeParticipantsRoomId = room.id;
    renderParticipantsModal();

    els.participantsModal.hidden = false;
    setTimeout(function () {
      if (els.participantName) els.participantName.focus();
    }, 50);
  }

  function closeParticipantsModal() {
    if (els.participantsModal) els.participantsModal.hidden = true;
    state.activeParticipantsRoomId = '';
    if (els.participantName) els.participantName.value = '';
    if (els.participantEmail) els.participantEmail.value = '';
  }

  function renderParticipantsModal() {
    var room = getRoom(state.activeParticipantsRoomId);
    if (!room) return;

    var members = getRoomMembers(room);

    if (els.participantsRoomName) {
      els.participantsRoomName.textContent = room.name + ' · ' + members.length + '명';
    }

    if (!els.participantsList) return;

    if (!members.length) {
      els.participantsList.innerHTML = '<div class="aic-participant-empty">' + tr('aic.noParticipants', '등록된 참여자가 없습니다.') + '</div>';
      return;
    }

    els.participantsList.innerHTML = members.map(function (member, index) {
      return [
        '<div class="aic-participant-item">',
        '  <div>',
        '    <div class="aic-participant-name">', esc(member.name || member.email || '-'), '</div>',
        '    <div class="aic-participant-meta">', esc(member.email || tr('aic.noParticipantMemo', '이메일/메모 없음')), '</div>',
        '  </div>',
        '  <button class="aic-participant-remove" type="button" data-remove-participant="', index, '">삭제</button>',
        '</div>'
      ].join('');
    }).join('');

    Array.from(els.participantsList.querySelectorAll('[data-remove-participant]')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        removeParticipant(Number(btn.getAttribute('data-remove-participant')) || 0);
      });
    });
  }

  async function addParticipant() {
    var room = getRoom(state.activeParticipantsRoomId);
    if (!room) return;

    var name = String(els.participantName && els.participantName.value || '').trim();
    var email = String(els.participantEmail && els.participantEmail.value || '').trim();

    if (!name && !email) return;
    if (!name) name = email;

    var members = getRoomMembers(room);
    var duplicate = members.some(function (member) {
      return String(member.name || '').trim() === name || (email && String(member.email || '').trim() === email);
    });

    if (duplicate) {
      if (els.participantName) els.participantName.value = '';
      if (els.participantEmail) els.participantEmail.value = '';
      return;
    }

    var member = { name: name, email: email };

    try {
      var savedId = await insertParticipantToServer(room, member);
      if (savedId) member.id = savedId;
    } catch (error) {
      alert('참여자 저장 실패: ' + (error?.message || 'Supabase 연결/테이블을 확인해 주세요.'));
      return;
    }

    members.push(member);
    syncRoomMembersText(room);

    if (els.participantName) els.participantName.value = '';
    if (els.participantEmail) els.participantEmail.value = '';

    renderParticipantsModal();
    render(false);
  }

  async function removeParticipant(index) {
    var room = getRoom(state.activeParticipantsRoomId);
    if (!room) return;

    var members = getRoomMembers(room);
    var member = members[index];
    if (!member) return;

    try {
      await deleteParticipantFromServer(room, member);
    } catch (error) {
      alert('참여자 삭제 실패: ' + (error?.message || 'Supabase 연결/테이블을 확인해 주세요.'));
      return;
    }

    members.splice(index, 1);
    syncRoomMembersText(room);

    renderParticipantsModal();
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

  async function createRoom() {
    var name = (els.newRoomName && els.newRoomName.value || '').trim() || tr('aic.newRoomDefaultName', '새 회의방');
    var membersText = (els.newRoomMembers && els.newRoomMembers.value || '').trim() || getCurrentUserName();
    var id = 'room_' + Date.now();

    var room = {
      id: id,
      name: name,
      members: membersText,
      memberList: splitMembers(membersText).map(function (memberName) {
        return { name: memberName, email: '' };
      }),
      messages: []
    };

    if (!room.memberList.length) {
      room.memberList = [{ name: getCurrentUserName(), email: getCurrentUserEmail() }];
      syncRoomMembersText(room);
    }

    try {
      await insertRoomToServer(room);
    } catch (error) {
      alert('회의방 저장 실패: ' + (error?.message || 'Supabase 연결/테이블을 확인해 주세요.'));
      return;
    }

    state.rooms.unshift(room);

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

    if (els.participantsCloseBtn) els.participantsCloseBtn.addEventListener('click', closeParticipantsModal);
    if (els.participantAddBtn) els.participantAddBtn.addEventListener('click', addParticipant);
    if (els.participantName) {
      els.participantName.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') addParticipant();
      });
    }
    if (els.participantEmail) {
      els.participantEmail.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') addParticipant();
      });
    }
    if (els.participantsModal) {
      els.participantsModal.addEventListener('click', function (event) {
        if (event.target === els.participantsModal) closeParticipantsModal();
      });
    }

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
      if (data.type === 'portal-auth') {
        loadRoomsFromServer();
        scheduleRender();
        return;
      }

      if (
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

    els.participantsModal = $('aicParticipantsModal');
    els.participantsRoomName = $('aicParticipantsRoomName');
    els.participantsList = $('aicParticipantsList');
    els.participantName = $('aicParticipantName');
    els.participantEmail = $('aicParticipantEmail');
    els.participantAddBtn = $('aicParticipantAddBtn');
    els.participantsCloseBtn = $('aicParticipantsCloseBtn');
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
    loadRoomsFromServer();

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
