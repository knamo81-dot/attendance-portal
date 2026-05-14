/* portal-home-main.js | Phase 1 split from original portal-home.html
   원본 inline script #3를 실행 순서 그대로 외부 파일로 분리했습니다. */

const apps = [
      { id: 'wastewater', name: '폐수배출시설 운영일지', status: '운영중', desc: '일일입력 · 수거등록 · 운영일지', color: '#e0f2fe' },
      { id: 'attendance', name: '근태관리', status: '별도', desc: '출퇴근 · OT · 위험분석', color: '#f8fafc' },
      { id: 'meal', name: '식대계산', status: '준비', desc: '식대정산 · 월별집계', color: '#f8fafc' },
      { id: 'supplies', name: '시약·초자 주문/분석', status: '준비', desc: '주문현황 · 비용분석', color: '#f8fafc' },
    ];

    const todayDate = new Date();
    const todayDateKey = [
      todayDate.getFullYear(),
      String(todayDate.getMonth() + 1).padStart(2, '0'),
      String(todayDate.getDate()).padStart(2, '0')
    ].join('-');
    const todayMonthKey = [
      todayDate.getFullYear(),
      String(todayDate.getMonth() + 1).padStart(2, '0'),
      '01'
    ].join('-');

    function getActiveReservationResource() {
      const list = state.reservationResourcesList || [];
      const byName = String(state.selectedReservationResourceName || '').trim();
      if (byName) {
        const found = list.find(x => String(x.name || '').trim() === byName);
        if (found && found.name) {
          return { id: found.id, name: found.name, location: '', capacity: '' };
        }
      }
      const first = list[0];
      return first
        ? { id: first.id, name: first.name, location: '', capacity: '' }
        : { id: null, name: '', location: '', capacity: '' };
    }

    async function loadReservationResourcesForPortal() {
      try {
        const { sb } = portalAuth();
        if (!sb) {
          state.reservationResourcesList = [];
          return;
        }
        const { data, error } = await sb.from('portal_reservation_resources')
          .select('id,name,is_active,sort_order')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true });
        if (error) throw error;
        state.reservationResourcesList = (data || []).map(r => ({
          id: r.id,
          name: String(r.name || '').trim(),
          is_active: !!r.is_active,
          sort_order: Number(r.sort_order) || 0
        })).filter(r => r.name);
        const names = state.reservationResourcesList.map(r => r.name);
        const cur = String(state.selectedReservationResourceName || '').trim();
        if (!cur || !names.includes(cur)) {
          state.selectedReservationResourceName = names[0] || '';
          state.selectedReservationResourceId = state.reservationResourcesList[0]?.id ?? null;
        } else {
          const m = state.reservationResourcesList.find(x => x.name === cur);
          state.selectedReservationResourceId = m ? m.id : null;
        }
      } catch (e) {
        console.error('loadReservationResourcesForPortal', e);
        state.reservationResourcesList = [];
      }
    }
    if (typeof window !== 'undefined') {
      window.loadReservationResourcesForPortal = loadReservationResourcesForPortal;
    }

    const notices = [
      { title: '폐수 운영일지 4월 결재 요청', level: '긴급', app: '-' },
      { title: '최근 수거 내역 등록 확인 필요', level: '확인', app: '-' },
      { title: '운영 관련자료 업데이트 완료', level: '자료', app: '-' },
    ];

    const colorOptions = ['#fef3c7', '#fecdd3', '#bfdbfe', '#dcfce7', '#fde68a', '#ddd6fe', '#fbcfe8'];
    const imageColorOptions = ['#fff7ed', '#f8fafc', '#f3f4f6', '#eff6ff', '#f5f3ff', '#fdf2f8'];
    const initialLayouts = [
      { x: 28, y: 40, rotate: -2, color: '#fef3c7' },
      { x: 250, y: 86, rotate: 1.5, color: '#fecdd3' },
      { x: 500, y: 52, rotate: -1, color: '#bfdbfe' },
      { x: 160, y: 320, rotate: 2, color: '#dcfce7' },
      { x: 430, y: 352, rotate: -1.5, color: '#fde68a' },
      { x: 680, y: 280, rotate: 1, color: '#ddd6fe' },
    ];

    const state = {
      page: 'home',
      tab: 'memo',
      notes: [],
      trash: [],
      memoExpandedId: null,
      memoEditingId: null,
      memoDraggingId: null,
      newMemoOpen: false,
      trashOpen: false,
      newMemo: { title: '', tag: '메모', pinned: false, imageOnly: false, color: '#fef3c7', content: '', expandedWidth: 420 },
      memoBoardHeight: 720,
      portalMemoFeedback: { msg: '', kind: '' },
      memoLoading: false,
      scheduleLoading: false,
      reservationLoading: false,
      portalUserEmployee: null,
      portalOrgTeams: [],
      portalOrgDivisions: [],
      portalOrgEmployees: [],
      reservationsAll: [],
      reservationResourcesList: [],
      selectedReservationResourceName: '',
      selectedReservationResourceId: null,
      reservationModalOpen: false,
      reservationReadonly: false,

      selectedDate: todayDateKey,
      calendarMonth: todayMonthKey,
      plannerMode: 'schedule',
      activeReservationTab: 0,
      selectedPanelRangeFilter: '전체',
      selectedPanelStatusFilter: '진행',
      scheduleScopeFilters: ['all', 'lab', 'team', 'personal'],
      schedules: [],
      reservations: [],
      scheduleExpandedIndex: null,
      scheduleEditorOpen: false,
      scheduleEditingId: null,
      reservationEditingId: null,
      reservationViewId: null,
      portalPlannerFeedback: { msg: '', kind: '' },
      reservationForm: { startTime: '09:00', endTime: '10:00', title: '', description: '' },
      scheduleForm: {
        displayMode: 'start',
        startTime: '09:00',
        endTime: '10:00',
        type: '업무',
        app: '-',
        scope: 'lab',
        text: '',
        description: '',
      },
    };

    const SCHEDULE_META_MARK = '\n[[PORTAL_SCHEDULE_META]]';

    function timeToMinutes(value) {
      const [hh, mm] = String(value || '00:00').split(':').map(Number);
      return (hh || 0) * 60 + (mm || 0);
    }

    function minutesToTime(total) {
      const t = Math.max(0, Math.min(24 * 60 - 1, Math.round(Number(total) || 0)));
      const hh = String(Math.floor(t / 60)).padStart(2, '0');
      const mm = String(t % 60).padStart(2, '0');
      return `${hh}:${mm}`;
    }

    function normalizeScopeCode(raw) {
      const s = String(raw || '').trim();
      const lower = s.toLowerCase();
      if (['all', 'lab', 'team', 'personal'].includes(lower)) return lower;
      if (s === '전체' || s === '공지') return 'all';
      if (s === '연구소') return 'lab';
      if (s === '팀') return 'team';
      if (s === '개인') return 'personal';
      return 'lab';
    }

    function scopeLabelFromCode(code) {
      const c = normalizeScopeCode(code);
      if (c === 'all') return '전체';
      if (c === 'lab') return '연구소';
      if (c === 'team') return '팀';
      return '개인';
    }


    

/* ===== portal auth / common feedback ===== */
function portalAuth() {
      const ctx = typeof window.getPortalAuthContext === 'function' ? window.getPortalAuthContext() : {};
      const sb = ctx.supabase || window.portalSupabase;
      const injectedEmail = typeof getPortalInjectedEmail === 'function' ? getPortalInjectedEmail() : '';
      const email = String(ctx.user?.email || injectedEmail || '').trim().toLowerCase();
      const profile = ctx.profile || null;
      const name = String(profile?.name || profile?.employee_name || profile?.username || '').trim()
        || (email ? email.split('@')[0] : '사용자');
      return { sb, email, name, user: ctx.user || (email ? { email } : null), profile };
    }

    function getCurrentUserDisplayName() {
      return portalAuth().name;
    }

    let portalMemoFeedbackHideTimer = null;
    const PORTAL_MEMO_FEEDBACK_HIDE_MS = 1800;

    function setPortalMemoFeedback(msg, kind) {
      if (portalMemoFeedbackHideTimer != null) {
        clearTimeout(portalMemoFeedbackHideTimer);
        portalMemoFeedbackHideTimer = null;
      }
      const nextMsg = msg != null ? String(msg) : '';
      const nextKind = kind != null ? String(kind) : '';
      state.portalMemoFeedback = { msg: nextMsg, kind: nextKind };
      if (!nextMsg.trim()) return;
      const snapMsg = nextMsg;
      const snapKind = nextKind;
      portalMemoFeedbackHideTimer = setTimeout(() => {
        portalMemoFeedbackHideTimer = null;
        if (state.portalMemoFeedback.msg === snapMsg && state.portalMemoFeedback.kind === snapKind) {
          state.portalMemoFeedback = { msg: '', kind: '' };
        }
        if (typeof render === 'function') render();
      }, PORTAL_MEMO_FEEDBACK_HIDE_MS);
    }

    function setPortalPlannerFeedback(msg, kind) {
      state.portalPlannerFeedback = { msg: msg || '', kind: kind || '' };
    }

    function showPortalDataMessage(msg, kind, area) {
      const k = kind || 'success';
      if (area === 'planner') setPortalPlannerFeedback(msg, k);
      else setPortalMemoFeedback(msg, k);
    }

    

/* ===== main data loading / global tab bindings ===== */
async function loadPortalServerData() {
      const { sb } = portalAuth();
      if (!sb) return;
      await loadPortalUserEmployee();
      await Promise.all([
        loadReservationResourcesForPortal(),
        loadMemosFromServer(),
        loadTrashMemosFromServer(),
        loadSchedulesFromServer(),
        loadReservationsForMonth(state.calendarMonth)
      ]);
      applyReservationFilter();
      if (typeof render === 'function') render();
    }

    if (typeof window !== 'undefined') {
      window.loadPortalServerData = loadPortalServerData;
    }

    const tabContent = document.getElementById('tab-content');
    const tabButtons = Array.from(document.querySelectorAll('.pill'));

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        state.tab = btn.dataset.tab;
        tabButtons.forEach(b => b.classList.toggle('active', b === btn));
        render();
        applyZIndexControl();
      });
    });


    function resizeEmbeddedFrame() {
      const frame = document.getElementById('attendance-embedded-frame');
      if (!frame) return;
      try {
        const doc = frame.contentDocument || frame.contentWindow.document;
        if (!doc || !doc.body) return;
        const bodyHeight = Math.max(
          doc.body.scrollHeight || 0,
          doc.documentElement ? doc.documentElement.scrollHeight || 0 : 0,
          900
        );
        frame.style.height = bodyHeight + 24 + 'px';
      } catch (e) {
        frame.style.height = 'calc(100vh - 120px)';
      }
    }

    function bindAttendanceFrameResize() {
      const frame = document.getElementById('attendance-embedded-frame');
      if (!frame || frame.dataset.bound === 'true') return;
      frame.dataset.bound = 'true';
      frame.addEventListener('load', () => {
        resizeEmbeddedFrame();
        setTimeout(resizeEmbeddedFrame, 300);
        setTimeout(resizeEmbeddedFrame, 1000);
      });
      window.addEventListener('resize', resizeEmbeddedFrame);
    }

    function resetHomeState() {
      setPortalMemoFeedback('', '');
      state.tab = 'memo';
      tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === 'memo');
      });
      state.trash = [];
      state.memoExpandedId = null;
      state.memoEditingId = null;
      state.memoDraggingId = null;
      state.newMemoOpen = false;
      state.trashOpen = false;
      state.newMemo = { title: '', tag: '메모', pinned: false, imageOnly: false, color: '#fef3c7', content: '', expandedWidth: 420 };
      hydrateMemoBoardHeightFromStorage();

      state.selectedDate = todayDateKey;
      state.calendarMonth = todayMonthKey;
      state.plannerMode = 'schedule';
      state.activeReservationTab = 0;
      state.selectedPanelRangeFilter = '전체';
      state.selectedPanelStatusFilter = '진행';
      state.scheduleScopeFilters = ['all', 'lab', 'team', 'personal'];
      state.scheduleExpandedIndex = null;
      state.scheduleEditorOpen = false;
      state.scheduleEditingId = null;
      state.reservationEditingId = null;
      state.reservationViewId = null;
      state.reservationReadonly = false;
      state.portalPlannerFeedback = { msg: '', kind: '' };
      state.reservationForm = { startTime: '09:00', endTime: '10:00', title: '', description: '' };
      state.reservationsAll = [];
      state.reservationResourcesList = [];
      state.selectedReservationResourceName = '';
      state.selectedReservationResourceId = null;
      state.reservationModalOpen = false;
      state.portalUserEmployee = null;
      state.scheduleForm = {
        displayMode: 'start',
        startTime: '09:00',
        endTime: '10:00',
        type: '업무',
        app: '-',
        scope: 'lab',
        text: '',
        description: '',
      };
    }

    function getNextZ() {
      return state.notes.reduce((max, item) => Math.max(max, item.z || 1), 1) + 1;
    }

    function bringToFront(id) {
      const nextZ = getNextZ();
      state.notes = state.notes.map(note => note.id === id ? { ...note, z: nextZ } : note);
    }

    function getScheduleTimeLabel(item) {
      if (item.displayMode === 'allDay') return '종일';
      if (item.displayMode === 'range') return `${item.startTime || ''} - ${item.endTime || ''}`.trim();
      return item.startTime || '';
    }

    function resetScheduleForm() {
      state.scheduleForm = {
        displayMode: 'start',
        startTime: '09:00',
        endTime: '10:00',
        type: '업무',
        app: '-',
        scope: 'lab',
        text: '',
        description: '',
      };
    }

