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


    function normalizePortalOrgValue(value) {
      return String(value || '').trim().replace(/\s+/g, '').toLowerCase();
    }

    function addPortalOrgValue(set, value) {
      const normalized = normalizePortalOrgValue(value);
      if (normalized) set.add(normalized);
    }

    function getPortalTeamValues(value) {
      const set = new Set();
      addPortalOrgValue(set, value);
      const target = normalizePortalOrgValue(value);
      if (!target) return set;

      (state.portalOrgTeams || []).forEach(team => {
        const candidates = [
          team.team_code,
          team.code,
          team.id,
          team.team_id,
          team.team_name,
          team.name,
          team.label
        ];
        if (candidates.some(item => normalizePortalOrgValue(item) === target)) {
          candidates.forEach(item => addPortalOrgValue(set, item));
        }
      });

      return set;
    }

    function getPortalTeamCandidateValues(team) {
      if (!team) return [];
      return [
        team.team_code,
        team.code,
        team.id,
        team.team_id,
        team.team_name,
        team.name,
        team.label
      ];
    }

    function getPortalDivisionCandidateValues(division) {
      if (!division) return [];
      return [
        division.division_code,
        division.code,
        division.id,
        division.value,
        division.division_name,
        division.name,
        division.label,
        division.department
      ];
    }

    function normalizePortalEmail(value) {
      return String(value || '').trim().toLowerCase();
    }

    function getPortalDivisionValues(value) {
      const set = new Set();
      addPortalOrgValue(set, value);
      const target = normalizePortalOrgValue(value);
      if (!target) return set;

      (state.portalOrgDivisions || []).forEach(division => {
        const candidates = getPortalDivisionCandidateValues(division);
        if (candidates.some(item => normalizePortalOrgValue(item) === target)) {
          candidates.forEach(item => addPortalOrgValue(set, item));
        }
      });

      (state.portalOrgTeams || []).forEach(team => {
        const teamCandidates = getPortalTeamCandidateValues(team);
        const divisionCandidates = [
          team.division_code,
          team.department_code,
          team.parent_division_code,
          team.division_name,
          team.department,
          team.division
        ];

        if (teamCandidates.some(item => normalizePortalOrgValue(item) === target)) {
          divisionCandidates.forEach(item => addPortalOrgValue(set, item));
        }

        if (divisionCandidates.some(item => normalizePortalOrgValue(item) === target)) {
          divisionCandidates.forEach(item => addPortalOrgValue(set, item));
        }
      });

      return set;
    }

    function portalSetsIntersect(aSet, bSet) {
      for (const value of aSet) {
        if (bSet.has(value)) return true;
      }
      return false;
    }

    function samePortalTeamValue(a, b) {
      const av = getPortalTeamValues(a);
      const bv = getPortalTeamValues(b);
      return av.size > 0 && bv.size > 0 && portalSetsIntersect(av, bv);
    }

    function samePortalDivisionValue(a, b) {
      const av = getPortalDivisionValues(a);
      const bv = getPortalDivisionValues(b);
      return av.size > 0 && bv.size > 0 && portalSetsIntersect(av, bv);
    }

    function findPortalTeamByValue(value) {
      const target = normalizePortalOrgValue(value);
      if (!target) return null;
      return (state.portalOrgTeams || []).find(team =>
        getPortalTeamCandidateValues(team).some(item => normalizePortalOrgValue(item) === target)
      ) || null;
    }

    function resolvePortalTeamDivisionValue(teamValue) {
      const team = findPortalTeamByValue(teamValue);
      if (!team) return '';
      return String(team.division_code || team.department_code || team.parent_division_code || team.division_name || team.department || team.division || '').trim();
    }

    function getPortalTeamCodeFromEmployee(employee) {
      if (!employee) return '';
      const direct = String(employee.team_code || employee.team_id || '').trim();
      if (direct) return direct;
      const teamName = String(employee.team || employee.team_name || '').trim();
      const team = findPortalTeamByValue(teamName);
      return String(team?.team_code || team?.code || teamName || '').trim();
    }

    function getPortalDivisionCodeFromEmployee(employee, teamCode) {
      if (!employee) return '';
      const direct = String(employee.division_code || '').trim();
      if (direct) return direct;

      const teamDivision = resolvePortalTeamDivisionValue(teamCode || employee.team_code || employee.team || employee.team_name);
      if (teamDivision) return teamDivision;

      const divisionName = String(employee.division_name || employee.division || '').trim();
      const matchedDivision = (state.portalOrgDivisions || []).find(division => [
        division.division_code,
        division.code,
        division.id,
        division.value,
        division.division_name,
        division.name,
        division.label
      ].some(item => normalizePortalOrgValue(item) === normalizePortalOrgValue(divisionName)));

      return String(matchedDivision?.division_code || matchedDivision?.code || divisionName || '').trim();
    }

    function isPortalAdminRole() {
      const p = portalAuth().profile;
      const roleValue = String(p?.role || p?.authority || '').trim().toLowerCase();
      return roleValue === 'admin' || roleValue === '관리자';
    }

    function getPortalEmployeeByEmail(email) {
      const target = normalizePortalEmail(email);
      if (!target) return null;

      if (state.portalUserEmployee && normalizePortalEmail(state.portalUserEmployee.email) === target) {
        return state.portalUserEmployee;
      }

      return (state.portalOrgEmployees || []).find(emp => normalizePortalEmail(emp.email) === target) || null;
    }

    function normalizePortalEmployeeOrg(employee) {
      if (!employee) return null;

      const teamCode = getPortalTeamCodeFromEmployee(employee);
      const divisionCode = getPortalDivisionCodeFromEmployee(employee, teamCode);
      const matchedTeam = findPortalTeamByValue(teamCode || employee.team || employee.team_code);
      const matchedDivision = (state.portalOrgDivisions || []).find(division => samePortalDivisionValue(
        division.division_code || division.division_name || division.name,
        divisionCode
      ));

      return {
        ...employee,
        role: employee.role || employee.authority || '',
        team_code: String(teamCode || employee.team_code || employee.team || '').trim(),
        division_code: String(divisionCode || employee.division_code || '').trim(),
        team_name: String(matchedTeam?.team_name || matchedTeam?.name || employee.team || employee.team_code || '').trim(),
        division_name: String(matchedDivision?.division_name || matchedDivision?.name || employee.division_code || '').trim()
      };
    }

    function getCurrentPortalAuthorOrg() {
      const me = normalizePortalEmployeeOrg(state.portalUserEmployee) || {};
      const teamCode = String(me.team_code || getPortalTeamCodeFromEmployee(state.portalUserEmployee) || '').trim();
      const divisionCode = String(
        me.division_code ||
        getPortalDivisionCodeFromEmployee(state.portalUserEmployee, teamCode) ||
        resolvePortalTeamDivisionValue(teamCode) ||
        ''
      ).trim();

      return {
        team_code: teamCode,
        division_code: divisionCode,
        team_name: String(me.team_name || state.portalUserEmployee?.team || state.portalUserEmployee?.team_name || '').trim(),
        division_name: String(me.division_name || state.portalUserEmployee?.division_name || state.portalUserEmployee?.division_code || '').trim()
      };
    }

    function getScheduleAuthorOrg(row) {
      const authorEmail = normalizePortalEmail(row?.created_by_email);
      const { meta } = unpackScheduleDescription(row?.description || '');

      // 새 DB 컬럼을 1순위로 사용하고, 기존 description 메타/직원조회는 fallback으로만 사용합니다.
      const columnTeam = String(row?.author_team_code || '').trim();
      const columnDiv = String(row?.author_division_code || '').trim();
      const columnTeamName = String(row?.author_team_name || '').trim();
      const columnDivName = String(row?.author_division_name || '').trim();

      const metaTeam = String(meta.author_team_code || '').trim();
      const metaDiv = String(meta.author_division_code || '').trim();

      const authorEmployee = getPortalEmployeeByEmail(authorEmail);
      const normalizedAuthor = normalizePortalEmployeeOrg(authorEmployee);

      const authorTeam = String(
        columnTeam ||
        metaTeam ||
        normalizedAuthor?.team_code ||
        normalizedAuthor?.team ||
        normalizedAuthor?.team_name ||
        ''
      ).trim();

      const authorDiv = String(
        columnDiv ||
        metaDiv ||
        normalizedAuthor?.division_code ||
        resolvePortalTeamDivisionValue(authorTeam) ||
        normalizedAuthor?.division_name ||
        ''
      ).trim();

      return {
        email: authorEmail,
        team: authorTeam,
        division: authorDiv,
        teamName: columnTeamName || normalizedAuthor?.team_name || normalizedAuthor?.team || '',
        divisionName: columnDivName || normalizedAuthor?.division_name || normalizedAuthor?.division_code || '',
        employee: normalizedAuthor
      };
    }

    function scheduleRowVisibleToCurrentUser(row) {
      if (!row) return false;

      const scope = normalizeScopeCode(row.scope);
      const email = normalizePortalEmail(portalAuth().email);
      const author = getScheduleAuthorOrg(row);

      // 전체 공개는 작성자 조직정보가 없어도 모든 사용자에게 표시
      if (scope === 'all') return true;

      // 개인 공개는 작성자 본인에게만 표시
      if (scope === 'personal') return Boolean(email && author.email === email);

      const me = normalizePortalEmployeeOrg(state.portalUserEmployee);
      const myTeam = String(me?.team_code || me?.team || '').trim();
      const myDiv = String(me?.division_code || resolvePortalTeamDivisionValue(myTeam) || '').trim();

      if (scope === 'team') {
        if (!author.team) return Boolean(email && author.email === email);

        // 새 컬럼 저장값은 정규화 문자열 직접 비교가 가장 안정적입니다.
        if (normalizePortalOrgValue(myTeam) && normalizePortalOrgValue(myTeam) === normalizePortalOrgValue(author.team)) return true;

        const visible = Boolean(myTeam && samePortalTeamValue(myTeam, author.team));
        if (!visible) {
          console.log('[portal-home] team scope hidden:', {
            title: row.title,
            myTeam,
            authorTeam: author.team,
            myEmail: email,
            authorEmail: author.email
          });
        }
        return visible;
      }

      if (scope === 'lab') {
        if (!author.division) return Boolean(email && author.email === email);

        // 새 컬럼 저장값은 정규화 문자열 직접 비교가 가장 안정적입니다.
        if (normalizePortalOrgValue(myDiv) && normalizePortalOrgValue(myDiv) === normalizePortalOrgValue(author.division)) return true;

        const visible = Boolean(myDiv && samePortalDivisionValue(myDiv, author.division));
        if (!visible) {
          console.log('[portal-home] lab scope hidden:', {
            title: row.title,
            myDiv,
            authorDiv: author.division,
            myEmail: email,
            authorEmail: author.email
          });
        }
        return visible;
      }

      return false;
    }

    function canMutateScheduleRow(row) {
      if (!row) return false;
      const email = String(portalAuth().email || '').trim().toLowerCase();
      const authorEmail = String(row.created_by_email || '').trim().toLowerCase();

      // 스케줄은 관리자 권한과 무관하게 작성자 본인만 수정/삭제/완료 처리 가능합니다.
      return Boolean(email && authorEmail === email);
    }

    function canMutateReservationRow(row) {
      if (!row) return false;
      const email = String(portalAuth().email || '').trim().toLowerCase();
      const authorEmail = String(row.created_by_email || '').trim().toLowerCase();
      if (authorEmail === email) return true;
      return isPortalAdminRole();
    }

    async function loadPortalUserEmployee() {
      try {
        const { sb, email } = portalAuth();
        if (!sb || !email) {
          state.portalUserEmployee = null;
          return;
        }

        const teamsResult = await sb.from('teams')
          .select('team_code,team_name,division_code,is_active,is_virtual');

        if (!teamsResult.error) {
          state.portalOrgTeams = (teamsResult.data || []).filter(team => team && team.is_active !== false);
        } else {
          console.warn('teams 조직정보 조회 실패:', teamsResult.error);
          state.portalOrgTeams = [];
        }

        try {
          const divisionsResult = await sb.from('divisions')
            .select('division_code,division_name,is_active');
          state.portalOrgDivisions = divisionsResult.error
            ? []
            : (divisionsResult.data || []).filter(division => division && division.is_active !== false);
          if (divisionsResult.error) console.warn('divisions 조직정보 조회 실패:', divisionsResult.error);
        } catch (divisionError) {
          console.warn('divisions 조직정보 조회 실패:', divisionError);
          state.portalOrgDivisions = [];
        }

        const employeeSelect = 'email,team,employee_no,name,authority,team_code,division_code';

        try {
          let allEmployeesResult = await sb.from('employees')
            .select(employeeSelect);

          if (allEmployeesResult.error && String(allEmployeesResult.error.message || '').includes('column')) {
            allEmployeesResult = await sb.from('employees')
              .select('email,team,employee_no,name,authority');
          }

          if (!allEmployeesResult.error) {
            state.portalOrgEmployees = (allEmployeesResult.data || [])
              .filter(emp => emp && emp.email)
              .map(emp => normalizePortalEmployeeOrg(emp));
          } else {
            console.warn('employees 전체 조직정보 조회 실패:', allEmployeesResult.error);
            state.portalOrgEmployees = [];
          }
        } catch (employeesError) {
          console.warn('employees 전체 조직정보 조회 실패:', employeesError);
          state.portalOrgEmployees = [];
        }

        let data = null;
        let result = await sb.from('employees')
          .select(employeeSelect)
          .eq('email', email)
          .maybeSingle();

        if (result.error && String(result.error.message || '').includes('column')) {
          result = await sb.from('employees')
            .select('email,team,employee_no,name,authority')
            .eq('email', email)
            .maybeSingle();
        }

        if (result.error) throw result.error;
        data = result.data;

        if (!data) {
          let alt = await sb.from('employees')
            .select(employeeSelect)
            .ilike('email', email)
            .maybeSingle();

          if (alt.error && String(alt.error.message || '').includes('column')) {
            alt = await sb.from('employees')
              .select('email,team,employee_no,name,authority')
              .ilike('email', email)
              .maybeSingle();
          }

          if (alt.error) throw alt.error;
          data = alt.data;
        }

        if (!data) {
          state.portalUserEmployee = null;
          return;
        }

        state.portalUserEmployee = normalizePortalEmployeeOrg(data);
        console.log('[portal-home] current employee org:', {
          email,
          team_code: state.portalUserEmployee?.team_code,
          division_code: state.portalUserEmployee?.division_code,
          team_name: state.portalUserEmployee?.team_name,
          division_name: state.portalUserEmployee?.division_name
        });

        if (state.portalUserEmployee && !getPortalEmployeeByEmail(state.portalUserEmployee.email)) {
          state.portalOrgEmployees = [
            ...(state.portalOrgEmployees || []),
            state.portalUserEmployee
          ];
        }
      } catch (e) {
        console.error('loadPortalUserEmployee', e);
        state.portalUserEmployee = null;
        state.portalOrgTeams = [];
        state.portalOrgDivisions = [];
        state.portalOrgEmployees = [];
      }
    }

    function getMonthReservationRange(monthKey) {
      const prefix = String(monthKey || '').slice(0, 7);
      const base = new Date(`${prefix}-01T12:00:00`);
      if (Number.isNaN(base.getTime())) {
        const t = todayDateKey.split('-');
        const y = Number(t[0]), m = Number(t[1]);
        const pad = n => String(n).padStart(2, '0');
        const lastD = new Date(y, m, 0).getDate();
        return { first: `${y}-${pad(m)}-01`, last: `${y}-${pad(m)}-${pad(lastD)}` };
      }
      const y = base.getFullYear();
      const m = base.getMonth();
      const pad = n => String(n).padStart(2, '0');
      const first = `${y}-${pad(m + 1)}-01`;
      const lastD = new Date(y, m + 1, 0).getDate();
      const last = `${y}-${pad(m + 1)}-${pad(lastD)}`;
      return { first, last };
    }

    async function loadReservationsForMonth(monthKey) {
      state.reservationLoading = true;
      try {
        const { sb, email } = portalAuth();
        if (!sb || !email) {
          state.reservationsAll = [];
          applyReservationFilter();
          return;
        }
        const { first, last } = getMonthReservationRange(monthKey);
        const { data, error } = await sb.from('portal_reservations')
          .select('*')
          .gte('reserve_date', first)
          .lte('reserve_date', last)
          .order('reserve_date', { ascending: true })
          .order('start_time', { ascending: true })
          .order('id', { ascending: true });
        if (error) throw error;
        state.reservationsAll = data || [];
        applyReservationFilter();
      } catch (e) {
        console.error('loadReservationsForMonth', e);
        showPortalDataMessage(e?.message || '예약을 불러오지 못했습니다.', 'error', 'planner');
        state.reservationsAll = [];
        applyReservationFilter();
      } finally {
        state.reservationLoading = false;
      }
    }

    function applyReservationFilter() {
      const d = state.selectedDate;
      const rn = String(state.selectedReservationResourceName || '').trim();
      state.reservations = (state.reservationsAll || []).filter(r =>
        r.reserve_date === d && String(r.resource_name || '').trim() === rn
      );
    }

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

    function memoBoardHeightStorageKey() {
      try {
        const em = String(portalAuth().email || '').trim().toLowerCase();
        return em ? `memoBoardHeight:${em}` : 'memoBoardHeight';
      } catch (_) {
        return 'memoBoardHeight';
      }
    }

    function hydrateMemoBoardHeightFromStorage() {
      try {
        const raw = localStorage.getItem(memoBoardHeightStorageKey());
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 720 && n <= 2200) {
          state.memoBoardHeight = Math.round(n);
        }
      } catch (_) { /* ignore */ }
    }

    function persistMemoBoardHeightToStorage(px) {
      try {
        const n = Math.round(Number(px));
        if (!Number.isFinite(n) || n < 720 || n > 2200) return;
        localStorage.setItem(memoBoardHeightStorageKey(), String(n));
      } catch (_) { /* ignore */ }
    }

    function parseLegacyMemoContentJson(raw) {
      if (!raw || !String(raw).trim().startsWith('{')) return null;
      try {
        const o = JSON.parse(raw);
        if (o && o.v === 1) {
          return { content: o.txt || '', image: o.img || '', imageOnly: !!o.imageOnly };
        }
      } catch (_) { /* ignore */ }
      return null;
    }

    function mapMemoRowToState(row) {
      let contentText = row.content != null ? String(row.content) : '';
      let imageUrl = row.image_url ? String(row.image_url) : '';
      let imageOnly = !!row.is_image_only;
      const legacy = parseLegacyMemoContentJson(contentText);
      if (legacy) {
        contentText = legacy.content;
        if (!imageUrl && legacy.image) imageUrl = legacy.image;
        imageOnly = legacy.imageOnly;
      }
      const color = row.color || '#fef3c7';
      const layout = {
        x: row.layout_x ?? 40,
        y: row.layout_y ?? 40,
        w: row.layout_w ?? 260,
        h: row.layout_h ?? (imageOnly ? 120 : 170),
        rotate: Number(row.rotate) || 0,
        color
      };
      return {
        id: String(row.id),
        serverId: row.id,
        memoDate: row.memo_date || todayDateKey,
        boardType: row.board_type || 'personal',
        title: row.title || '',
        tag: row.tag || '메모',
        pinned: !!row.pinned,
        imageOnly,
        content: contentText,
        image: imageUrl,
        z: row.z_index ?? 1,
        layout_w: row.layout_w,
        layout_h: row.layout_h,
        expandedWidth: row.layout_w || 320,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        is_deleted: !!row.is_deleted,
        deletedAt: row.deleted_at || null,
        deletedBy: row.deleted_by || null,
        layout: { x: layout.x, y: layout.y, rotate: layout.rotate, color: layout.color, w: layout.w, h: layout.h },
        originalLayout: {
          x: layout.x,
          y: layout.y,
          rotate: layout.rotate,
          color: layout.color,
          w: layout.w,
          h: layout.h
        }
      };
    }

    function memoStateToDbPayload(note, email, name) {
      const lw = Math.round(note.layout_w ?? note.layout?.w ?? note.expandedWidth ?? getMemoAutoWidth(note.title, note.content) ?? 320);
      const lh = Math.round(note.layout_h ?? note.layout?.h ?? (note.imageOnly ? 120 : 170));
      const payload = {
        created_by_email: email,
        created_by_name: name,
        title: note.title || '',
        content: note.content || '',
        tag: note.tag || '메모',
        color: note.layout?.color || note.color || '#fef3c7',
        pinned: !!note.pinned,
        layout_x: Math.round(note.layout?.x ?? 40),
        layout_y: Math.round(note.layout?.y ?? 40),
        layout_w: lw,
        layout_h: lh,
        rotate: Number(note.layout?.rotate) || 0,
        z_index: Math.round(note.z || 1),
        memo_date: note.memoDate || todayDateKey,
        is_image_only: !!note.imageOnly,
        image_url: note.image ? String(note.image) : null,
        board_type: note.boardType || 'personal',
        is_deleted: note.is_deleted === true,
        deleted_at: null,
        deleted_by: null
      };
      if (note.originalLayout) {
        payload.original_layout = {
          x: Math.round(note.originalLayout.x ?? note.layout?.x ?? 40),
          y: Math.round(note.originalLayout.y ?? note.layout?.y ?? 40),
          w: note.originalLayout.w != null ? Math.round(note.originalLayout.w) : Math.round(note.layout?.w ?? 260),
          h: note.originalLayout.h != null ? Math.round(note.originalLayout.h) : Math.round(note.layout?.h ?? 170),
          rotate: Number(note.originalLayout.rotate) || 0,
          color: note.originalLayout.color || note.layout?.color || '#fef3c7'
        };
      }
      return payload;
    }

    async function loadMemosFromServer() {
      state.memoLoading = true;
      try {
        const { sb, email } = portalAuth();
        if (!sb || !email) {
          state.notes = [];
          return;
        }
        const { data, error } = await sb.from('portal_memos')
          .select('*')
          .eq('created_by_email', email)
          .eq('is_deleted', false)
          .order('pinned', { ascending: false })
          .order('z_index', { ascending: false })
          .order('created_at', { ascending: true });
        if (error) throw error;
        state.notes = (data || []).map(mapMemoRowToState);
      } catch (e) {
        console.error('loadMemosFromServer', e);
        showPortalDataMessage(e?.message || '메모를 불러오지 못했습니다.', 'error', 'memo');
        state.notes = [];
      } finally {
        state.memoLoading = false;
      }
    }

    async function loadTrashMemosFromServer() {
      try {
        const { sb, email } = portalAuth();
        if (!sb || !email) {
          state.trash = [];
          return;
        }
        const { data, error } = await sb.from('portal_memos')
          .select('*')
          .eq('created_by_email', email)
          .eq('is_deleted', true)
          .order('updated_at', { ascending: false });
        if (error) throw error;
        state.trash = (data || []).map(mapMemoRowToState);
      } catch (e) {
        console.error('loadTrashMemosFromServer', e);
        showPortalDataMessage(e?.message || '휴지통 메모를 불러오지 못했습니다.', 'error', 'memo');
        state.trash = [];
      }
    }

    async function createMemoOnServer(payload) {
      const { sb, email, name } = portalAuth();
      if (!sb || !email) throw new Error('로그인이 필요합니다.');
      const insertRow = payload.created_by_email != null ? payload : memoStateToDbPayload(payload, email, name);
      const { data, error } = await sb.from('portal_memos').insert([insertRow]).select('*').single();
      if (error) throw error;
      return data;
    }

    /**
     * @param {object} [options]
     * @param {boolean} [options.silent] true면 위치·크기 등 조용한 저장: 이 함수 및 호출부에서 토스트를 띄우지 않음.
     */
    async function updateMemoOnServer(id, partialUiNote, options = {}) {
      const { sb, email, name } = portalAuth();
      if (!sb || !email) throw new Error('로그인이 필요합니다.');
      const base = state.notes.find(n => String(n.serverId || n.id) === String(id));
      if (!base) throw new Error('메모를 찾을 수 없습니다.');
      const merged = {
        ...base,
        ...partialUiNote,
        layout: { ...base.layout, ...(partialUiNote.layout || {}) }
      };
      if (partialUiNote.originalLayout != null) {
        merged.originalLayout = {
          ...(base.originalLayout || base.layout || {}),
          ...partialUiNote.originalLayout
        };
      }
      if (partialUiNote.layout_w != null) merged.layout_w = partialUiNote.layout_w;
      if (partialUiNote.layout_h != null) merged.layout_h = partialUiNote.layout_h;
      const payload = memoStateToDbPayload(merged, email, name);
      delete payload.created_by_email;
      delete payload.created_by_name;
      delete payload.deleted_at;
      delete payload.deleted_by;
      const { data, error } = await sb.from('portal_memos').update(payload).eq('id', id).eq('created_by_email', email).select('*').single();
      if (error) throw error;
      return data;
    }

    async function patchMemoOnServer(id, patch) {
      const { sb, email } = portalAuth();
      if (!sb || !email) throw new Error('로그인이 필요합니다.');
      const { data, error } = await sb.from('portal_memos').update(patch).eq('id', id).eq('created_by_email', email).select('*').single();
      if (error) throw error;
      return data;
    }

    async function softDeleteMemoOnServer(id) {
      const { email } = portalAuth();
      const em = String(email || '').trim().toLowerCase();
      await patchMemoOnServer(id, {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: em || null
      });
    }

    async function restoreMemoOnServer(id) {
      await patchMemoOnServer(id, {
        is_deleted: false,
        deleted_at: null,
        deleted_by: null
      });
    }

    async function permanentDeleteMemoOnServer(id) {
      const { sb, email } = portalAuth();
      if (!sb || !email) throw new Error('로그인이 필요합니다.');
      const { error } = await sb.from('portal_memos').delete().eq('id', id).eq('created_by_email', email);
      if (error) throw error;
    }

    async function persistMemoLayoutFromDom(board, id) {
      const sid = String(id);
      const noteEl = board.querySelector(`[data-note-id="${CSS.escape(sid)}"]`);
      const n = state.notes.find(x => String(x.id) === sid);
      if (!noteEl || !n || !n.serverId) return;
      const r = noteEl.getBoundingClientRect();
      const w = Math.max(220, Math.round(r.width));
      const h = Math.max(120, Math.round(r.height));
      const x = Math.max(0, Math.round(parseFloat(noteEl.style.left) || n.layout?.x || 0));
      const y = Math.max(0, Math.round(parseFloat(noteEl.style.top) || n.layout?.y || 0));
      state.notes = state.notes.map(note => String(note.id) === sid
        ? {
            ...note,
            layout: { ...note.layout, x, y, w, h },
            originalLayout: { ...(note.originalLayout || note.layout), x, y, w, h },
            layout_w: w,
            layout_h: h,
            expandedWidth: w
          }
        : note);
      const moved = state.notes.find(x => String(x.id) === sid);
      await updateMemoOnServer(moved.serverId, {
        layout: moved.layout,
        originalLayout: moved.originalLayout,
        layout_w: w,
        layout_h: h,
        z: moved.z
      }, { silent: true });
    }

    function packScheduleDescription(userText, meta) {
      const tail = SCHEDULE_META_MARK + encodeURIComponent(JSON.stringify({
        type: meta.type || '업무',
        app: meta.app || '-',
        displayMode: meta.displayMode || 'start',
        author_team_code: meta.author_team_code || '',
        author_division_code: meta.author_division_code || ''
      }));
      return (userText || '') + tail;
    }

    function unpackScheduleDescription(raw) {
      const s = String(raw || '');
      const idx = s.indexOf(SCHEDULE_META_MARK);
      if (idx === -1) return { clean: s.trim(), meta: {} };
      const clean = s.slice(0, idx).trimEnd();
      let meta = {};
      try {
        meta = JSON.parse(decodeURIComponent(s.slice(idx + SCHEDULE_META_MARK.length)));
      } catch (_) { /* ignore */ }
      return { clean, meta };
    }

    function inferDisplayModeFromTimes(startTime, endTime, metaDm) {
      if (metaDm) return metaDm;
      const st = (startTime || '').trim();
      const en = (endTime || '').trim();
      if (!st && !en) return 'allDay';
      if (st && en) return 'range';
      return 'start';
    }

    function mapScheduleRowToState(row) {
      const { clean, meta } = unpackScheduleDescription(row.description || '');
      const displayMode = inferDisplayModeFromTimes(row.start_time, row.end_time, meta.displayMode);
      const scopeCode = normalizeScopeCode(row.scope);
      const authorOrg = getScheduleAuthorOrg(row);
      return {
        id: row.id,
        panelDate: row.schedule_date,
        completed: !!row.is_completed,
        displayMode,
        startTime: row.start_time || '',
        endTime: row.end_time || '',
        type: meta.type || '업무',
        app: meta.app || '-',
        scopeCode,
        scope: scopeLabelFromCode(scopeCode),
        text: row.title || '',
        description: clean,
        author: row.created_by_name || row.created_by_email || '',
        teamName: String(row.author_team_name || authorOrg.teamName || authorOrg.employee?.team_name || authorOrg.team || meta.author_team_code || '').trim() || '-',
        lab: String(row.author_division_name || authorOrg.divisionName || authorOrg.employee?.division_name || authorOrg.division || meta.author_division_code || '').trim() || '-',
        canMutate: canMutateScheduleRow(row)
      };
    }

    function scheduleRowsForDate(dateKey) {
      return state.schedules.filter(r => r.schedule_date === dateKey && scheduleRowVisibleToCurrentUser(r));
    }

    function buildSchedulePayloadFromForm(isCompleted) {
      const { sb, email, name } = portalAuth();
      if (!sb || !email) throw new Error('로그인이 필요합니다.');
      const f = state.scheduleForm;
      const dm = f.displayMode;
      const startTime = dm === 'allDay' ? '' : (f.startTime || '');
      const endTime = dm === 'range' ? (f.endTime || '') : '';
      const authorOrg = getCurrentPortalAuthorOrg();

      let status = 'planned';
      if (state.scheduleEditingId != null) {
        const ex = state.schedules.find(s => Number(s.id) === Number(state.scheduleEditingId));
        if (ex && ex.status) status = ex.status;
      }

      return {
        created_by_email: email,
        created_by_name: name,
        schedule_date: state.selectedDate,
        title: (f.text || '').trim(),
        description: packScheduleDescription((f.description || '').trim(), {
          type: f.type,
          app: f.app,
          displayMode: dm,
          // 기존 description 메타도 유지해 과거 코드/데이터와 호환합니다.
          author_team_code: authorOrg.team_code,
          author_division_code: authorOrg.division_code
        }),
        start_time: startTime,
        end_time: endTime,
        scope: normalizeScopeCode(f.scope || 'lab'),
        is_completed: !!isCompleted,
        status,

        // 신규 DB 컬럼: 공개범위 판단의 1순위 기준값
        author_team_code: authorOrg.team_code,
        author_division_code: authorOrg.division_code,
        author_team_name: authorOrg.team_name,
        author_division_name: authorOrg.division_name
      };
    }

    async function loadSchedulesFromServer() {
      state.scheduleLoading = true;
      try {
        const { sb, email } = portalAuth();
        if (!sb || !email) {
          state.schedules = [];
          return;
        }
        const { data, error } = await sb.from('portal_schedules')
          .select('*')
          // 공개범위 필터는 scheduleRowVisibleToCurrentUser()에서 처리합니다.
          // 여기서는 월/작성자 제한 없이 전체를 가져와야 전체/연구소/팀 공개가 정상 동작합니다.
          .order('schedule_date', { ascending: true })
          .order('start_time', { ascending: true })
          .order('id', { ascending: true });
        if (error) throw error;
        state.schedules = data || [];
      } catch (e) {
        console.error('loadSchedulesFromServer', e);
        showPortalDataMessage(e?.message || '일정을 불러오지 못했습니다.', 'error', 'planner');
        state.schedules = [];
      } finally {
        state.scheduleLoading = false;
      }
    }

    function stripScheduleAuthorColumns(row) {
      if (!row) return row;
      const {
        author_team_code,
        author_division_code,
        author_team_name,
        author_division_name,
        ...rest
      } = row;
      return rest;
    }

    function isScheduleAuthorColumnError(error) {
      const msg = String(error?.message || error?.details || '').toLowerCase();
      return msg.includes('author_team_code') ||
        msg.includes('author_division_code') ||
        msg.includes('author_team_name') ||
        msg.includes('author_division_name') ||
        (msg.includes('column') && msg.includes('portal_schedules'));
    }

    async function createScheduleOnServer(payload) {
      const { sb } = portalAuth();
      if (!sb) throw new Error('로그인이 필요합니다.');
      const row = payload || buildSchedulePayloadFromForm(false);

      let result = await sb.from('portal_schedules').insert([row]).select('*').single();

      // Supabase 스키마 캐시가 갱신되기 전일 때만 임시 fallback
      if (result.error && isScheduleAuthorColumnError(result.error)) {
        console.warn('신규 작성자 조직 컬럼 insert 실패, 기존 컬럼으로 임시 저장:', result.error);
        result = await sb.from('portal_schedules').insert([stripScheduleAuthorColumns(row)]).select('*').single();
      }

      if (result.error) throw result.error;
      return result.data;
    }

    async function updateScheduleOnServer(id, patch) {
      const { sb, email } = portalAuth();
      if (!sb) throw new Error('로그인이 필요합니다.');
      const isAdmin = isPortalAdminRole();

      let q = sb.from('portal_schedules').update(patch).eq('id', id);
      if (!isAdmin) q = q.eq('created_by_email', email);
      let result = await q.select('*').single();

      // Supabase 스키마 캐시가 갱신되기 전일 때만 임시 fallback
      if (result.error && isScheduleAuthorColumnError(result.error)) {
        console.warn('신규 작성자 조직 컬럼 update 실패, 기존 컬럼으로 임시 저장:', result.error);
        let q2 = sb.from('portal_schedules').update(stripScheduleAuthorColumns(patch)).eq('id', id);
        if (!isAdmin) q2 = q2.eq('created_by_email', email);
        result = await q2.select('*').single();
      }

      if (result.error) throw result.error;
      return result.data;
    }

    async function deleteScheduleOnServer(id) {
      const { sb, email } = portalAuth();
      if (!sb) throw new Error('로그인이 필요합니다.');
      const isAdmin = isPortalAdminRole();
      let q = sb.from('portal_schedules').delete().eq('id', id);
      if (!isAdmin) q = q.eq('created_by_email', email);
      const { error } = await q;
      if (error) throw error;
    }

    function mapReservationRowToState(row) {
      const st = row.status || 'active';
      const uiStatus = st === 'full' ? 'full' : (st === 'partial' || st === 'active' ? 'partial' : 'available');
      const me = String(portalAuth().email || '').trim().toLowerCase();
      const author = String(row.created_by_email || '').trim().toLowerCase();
      return {
        id: row.id,
        startTime: row.start_time || '09:00',
        endTime: row.end_time || row.start_time || '10:00',
        title: row.title || '',
        reserver: row.created_by_name || row.created_by_email || '',
        teamName: '-',
        status: uiStatus,
        dbStatus: st,
        isMine: !!me && author === me,
        createdByEmail: author,
        description: row.description || '',
        reserveDate: row.reserve_date,
        resourceName: row.resource_name,
        canMutate: canMutateReservationRow(row)
      };
    }

    function getReservationOverlapList(dateKey, resourceName, excludeId) {
      const rn = String(resourceName || '').trim();
      return state.reservations.filter(r =>
        r.reserve_date === dateKey &&
        String(r.resource_name || '').trim() === rn &&
        (excludeId == null || Number(r.id) !== Number(excludeId))
      );
    }

    function reservationIntervalsOverlap(s1, e1, s2, e2) {
      const a1 = timeToMinutes(s1);
      let b1 = timeToMinutes(e1 || s1);
      if (b1 <= a1) b1 = a1 + 30;
      const a2 = timeToMinutes(s2);
      let b2 = timeToMinutes(e2 || s2);
      if (b2 <= a2) b2 = a2 + 30;
      return a1 < b2 && b1 > a2;
    }

    function checkReservationOverlap(dateKey, resourceName, startTime, endTime, excludeId) {
      const list = getReservationOverlapList(dateKey, resourceName, excludeId);
      for (const r of list) {
        if (reservationIntervalsOverlap(startTime, endTime, r.start_time, r.end_time)) return true;
      }
      return false;
    }

    async function loadReservationsFromServer() {
      await loadReservationsForMonth(state.calendarMonth);
    }

    async function createReservationOnServer(payload) {
      const { sb } = portalAuth();
      const { data, error } = await sb.from('portal_reservations').insert([payload]).select('*').single();
      if (error) throw error;
      return data;
    }

    async function updateReservationOnServer(id, patch) {
      const { sb, email } = portalAuth();
      const isAdmin = isPortalAdminRole();
      let q = sb.from('portal_reservations').update(patch).eq('id', id);
      if (!isAdmin) q = q.eq('created_by_email', email);
      const { data, error } = await q.select('*').single();
      if (error) throw error;
      return data;
    }

    async function deleteReservationOnServer(id) {
      const { sb, email } = portalAuth();
      const isAdmin = isPortalAdminRole();
      let q = sb.from('portal_reservations').delete().eq('id', id);
      if (!isAdmin) q = q.eq('created_by_email', email);
      const { error } = await q;
      if (error) throw error;
    }

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


    function getMemoAutoWidth(title = '', content = '') {
      const canvas = getMemoAutoWidth.canvas || (getMemoAutoWidth.canvas = document.createElement('canvas'));
      const ctx = canvas.getContext('2d');
      const titleLines = String(title || '').split('\n');
      const contentLines = String(content || '').split('\n');
      const allLines = [...titleLines, ...contentLines, ''];
      let maxWidth = 0;

      ctx.font = '800 18px Arial';
      titleLines.forEach(line => {
        maxWidth = Math.max(maxWidth, ctx.measureText(line || '').width);
      });

      ctx.font = '400 13px Arial';
      contentLines.forEach(line => {
        maxWidth = Math.max(maxWidth, ctx.measureText(line || '').width);
      });

      const calculated = Math.ceil(maxWidth + 88);
      return Math.max(320, Math.min(1100, calculated));
    }

    const MEMO_CARD_COLLAPSED_W = 260;
    const MEMO_CARD_COLLAPSED_MIN = 240;
    const MEMO_CARD_COLLAPSED_MAX = 280;

    function getMemoStoredCardWidth(item) {
      const raw = Number(item?.layout?.w ?? item?.layout_w);
      if (!Number.isFinite(raw) || raw < 40) return MEMO_CARD_COLLAPSED_W;
      return Math.round(Math.max(220, Math.min(560, raw)));
    }

    function getMemoCollapsedMinHeight(item) {
      const raw = Number(item?.layout?.h ?? item?.layout_h);
      if (!Number.isFinite(raw) || raw < 80) return 170;
      return Math.round(Math.max(120, Math.min(900, raw)));
    }

    function getMemoDisplayWidth(item, isExpanded, isEditing) {
      if (isEditing && state.editMemo) {
        const ew = Number(state.editMemo.expandedWidth) || getMemoAutoWidth(state.editMemo.title, state.editMemo.content);
        return Math.round(Math.max(420, Math.min(1100, ew)));
      }
      if (isExpanded) {
        const ew = Number(item.expandedWidth) || getMemoAutoWidth(item.title, item.content);
        return Math.round(Math.max(420, Math.min(1100, ew)));
      }
      return MEMO_CARD_COLLAPSED_W;
    }

    function freezeMemoLayoutSnapshot(note) {
      const L = (note && note.layout) ? note.layout : {};
      const x = Number(L.x);
      const y = Number(L.y);
      const w = Number(L.w);
      const h = Number(L.h);
      return {
        x: Number.isFinite(x) ? Math.max(0, Math.round(x)) : 40,
        y: Number.isFinite(y) ? Math.max(0, Math.round(y)) : 40,
        w: Number.isFinite(w) ? Math.max(120, Math.round(w)) : Math.round(Number(note?.layout_w) || 260),
        h: Number.isFinite(h) ? Math.max(80, Math.round(h)) : Math.round(Number(note?.layout_h) || 170),
        rotate: Number(L.rotate) || 0,
        color: L.color || '#fef3c7'
      };
    }

    function memoNotePositionPx(item) {
      const s = freezeMemoLayoutSnapshot(item);
      return { x: s.x, y: s.y };
    }

    let lastMemoDragMoved = false;
    let memoDragOffset = { x: 0, y: 0 };

    
/* ===== Z-INDEX CLICK PRIORITY ===== */
let zIndexCounter = 100;

function applyZIndexControl() {
  document.querySelectorAll('.memo-note').forEach(note => {
    note.addEventListener('mousedown', () => {
      zIndexCounter++;
      note.style.zIndex = zIndexCounter;
    });
  });
}

function render() {
      state.page = 'home';
      if (state.tab === 'memo') renderMemoTab();
      else if (state.tab === 'schedule') renderScheduleTab();
      else if (state.tab === 'ops') renderOpsTab();
    }

    function renderMemoTab() {
      hydrateMemoBoardHeightFromStorage();
      const pinned = state.notes.filter(n => n.pinned);
      const recent = state.notes.filter(n => !n.pinned);
      const notes = [...pinned, ...recent];

      tabContent.innerHTML = `
        <div class="card memo-wrap">
          <div id="portalMemoFeedback" style="width:100%;font-size:13px;margin-bottom:10px;padding:8px 10px;border-radius:10px;display:${state.portalMemoFeedback?.msg ? 'block' : 'none'};background:${state.portalMemoFeedback?.kind === 'error' ? '#fef2f2' : '#ecfdf5'};color:${state.portalMemoFeedback?.kind === 'error' ? '#991b1b' : '#166534'};">${state.portalMemoFeedback?.msg ? escapeHtml(state.portalMemoFeedback.msg) : ''}</div>
          <div class="memo-top">
            <div>
              <div style="font-size:18px;font-weight:700;">개인 메모</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
              <button class="small-btn" id="trash-toggle">휴지통 ${state.trash.length > 0 ? `(${state.trash.length})` : ''}</button>
              <button class="small-btn dark" id="new-memo-toggle">메모 추가</button>
            </div>
          </div>

          <div class="memo-board" id="memo-board" style="min-height:${state.memoBoardHeight}px;height:${state.memoBoardHeight}px;">
            <div class="memo-board-bg" aria-hidden="true">
              <div class="memo-grid"></div>
              <div class="board-dots">
                <div class="dot" style="background:#f87171"></div>
                <div class="dot" style="background:#fbbf24"></div>
                <div class="dot" style="background:#34d399"></div>
              </div>
            </div>

            ${state.memoLoading ? `<div class="memo-board-status" style="padding:12px 16px;color:#64748b;font-size:13px;">불러오는 중...</div>` : ''}
            ${!state.memoLoading && !notes.length ? `<div class="memo-board-status" style="padding:12px 16px;color:#94a3b8;font-size:13px;">등록된 메모가 없습니다.</div>` : ''}

            <div class="memo-board-notes" id="memo-board-notes">
            ${notes.map((item, idx) => {
              const isExpanded = state.memoExpandedId === item.id;
              const isEditing = state.memoEditingId === item.id;
              const pos = memoNotePositionPx(item);
              const noteWidth = getMemoDisplayWidth(item, isExpanded || isEditing, isEditing);
              const baseMinH = item.imageOnly ? null : getMemoCollapsedMinHeight(item);
              const noteMinH = item.imageOnly
                ? 'auto'
                : `${Math.max(baseMinH, (isExpanded || isEditing) ? 240 : baseMinH)}px`;
              const noteW = (isExpanded || isEditing)
                ? (item.imageOnly ? Math.max(220, Math.min(noteWidth, 360)) : noteWidth)
                : Math.max(MEMO_CARD_COLLAPSED_MIN, Math.min(MEMO_CARD_COLLAPSED_MAX, MEMO_CARD_COLLAPSED_W));
              const memoCanDrag = !isEditing;
              return `
                <div
                  class="memo-note ${item.imageOnly ? 'image-only' : ''} ${isExpanded || isEditing ? 'expanded' : ''} ${state.memoDraggingId === item.id ? 'dragging' : ''}"
                  data-note-id="${item.id}"
                  draggable="${memoCanDrag ? 'true' : 'false'}"
                  style="
                    left:${pos.x}px;
                    top:${pos.y}px;
                    width:${noteW}px;
                    min-height:${noteMinH};
                    background:${item.layout?.color || '#fef3c7'};
                    transform:rotate(${Number(item.layout?.rotate) || 0}deg);
                    z-index:${item.z || idx + 1};
                    cursor:${isEditing ? 'default' : 'grab'};
                  "
                >
                  <div class="memo-note-main">
                    <div class="memo-drag-handle" data-drag-id="${item.id}">
                      <div class="memo-tag">#${escapeHtml(isEditing ? state.editMemo?.tag || item.tag : item.tag)}</div>
                      <div class="${item.pinned ? 'memo-state pin' : 'memo-state'}">${item.pinned ? 'PIN' : 'MEMO'}</div>
                    </div>

                    ${isEditing ? `
                      <div class="field">
                        <label>색상</label>
                        <div class="color-row">
                          ${(state.editMemo.imageOnly ? imageColorOptions : colorOptions).map(c => `
                            <div class="color-swatch ${state.editMemo.color === c ? 'active' : ''}" data-edit-color="${c}" style="background:${c}"></div>
                          `).join('')}
                        </div>
                      </div>
                      <div class="field">
                        <input type="text" id="edit-title" value="${escapeAttr(state.editMemo.title)}" placeholder="제목" />
                      </div>
                      <div class="field">
                        <input type="text" id="edit-tag" value="${escapeAttr(state.editMemo.tag)}" placeholder="태그" />
                      </div>
                      <div class="field">
                        <textarea id="edit-content" rows="6" wrap="soft" spellcheck="false" placeholder="메모 내용">${escapeHtml(state.editMemo.content)}</textarea>
                      </div>
                      <label class="checkbox-row">
                        <input type="checkbox" id="edit-pinned" ${state.editMemo.pinned ? 'checked' : ''} />
                        상단 고정
                      </label>
                    ` : `
                      ${item.imageOnly ? `
                        ${item.image ? `
                          <div class="memo-image-frame">
                            <img src="${item.image}" alt="memo image" draggable="false" />
                          </div>
                        ` : ``}
                      ` : `
                        ${item.title ? `<div class="memo-title">${escapeHtml(item.title)}</div>` : ``}
                        ${item.image ? `
                          <div class="memo-image-frame" style="${isExpanded ? 'margin-top:10px;' : 'margin-top:10px;'}">
                            <img src="${item.image}" alt="memo image" draggable="false" style="${isExpanded ? 'max-height:280px;' : 'max-height:150px;'}" />
                          </div>
                        ` : ``}
                        ${isExpanded && item.content ? `<div class="memo-content-view">${escapeHtml(item.content)}</div>` : ``}
                      `}
                    `}
                  </div>

                  <div class="memo-footer">
                    <div class="memo-meta">
${item.imageOnly ? '이미지 메모' : (item.pinned ? '중요 메모' : '최근 메모')}<br/>
작성: ${new Date(item.createdAt).toLocaleDateString()}<br/>
수정: ${new Date(item.updatedAt).toLocaleDateString()}
</div>
                    <div class="memo-actions">
                      ${isEditing ? `
                        <button type="button" class="small-btn" draggable="false" data-memo-cancel="${item.id}">취소</button>
                        <button type="button" class="small-btn dark" draggable="false" data-memo-save="${item.id}">저장</button>
                      ` : `
                        ${isExpanded ? `
                          <button type="button" class="small-btn" draggable="false" data-memo-edit="${item.id}">수정</button>
                          <button type="button" class="small-btn" draggable="false" data-memo-delete="${item.id}" style="color:#b91c1c;border-color:#fecaca;background:#fff5f5;">삭제</button>
                        ` : ``}
                      `}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}

            ${state.newMemoOpen ? `
              <div class="memo-pop add" id="new-memo-pop" style="width:${Math.max(420, Math.min(1100, state.newMemo.expandedWidth || 420))}px;">
                <div style="font-size:16px;font-weight:700;margin-bottom:12px;">메모 추가</div>
                <div class="field">
                  <label>색상 선택</label>
                  <div class="color-row">
                    ${(state.newMemo.imageOnly ? imageColorOptions : colorOptions).map(c => `
                      <div class="color-swatch ${state.newMemo.color === c ? 'active' : ''}" data-new-color="${c}" style="background:${c}"></div>
                    `).join('')}
                  </div>
                </div>
                <div class="field">
                  <label>제목 (선택)</label>
                  <input type="text" id="new-title" value="${escapeAttr(state.newMemo.title)}" placeholder="비워두면 제목 없이 저장" autocomplete="off" />
                </div>
                <div class="field">
                  <label>태그</label>
                  <input type="text" id="new-tag" value="${escapeAttr(state.newMemo.tag)}" placeholder="예: 점검, 결재" autocomplete="off" />
                </div>
                <div class="field">
                  <label>이미지 업로드</label>
                  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                    <input type="file" id="new-image" accept="image/*" />
                    <label class="checkbox-row" style="margin:0;">
                      <input type="checkbox" id="new-image-only" ${state.newMemo.imageOnly ? 'checked' : ''} />
                      이미지만 올리기
                    </label>
                  </div>
                </div>
                <div class="field">
                  <label>내용</label>
                  <textarea id="new-content" rows="5" wrap="soft" spellcheck="false" placeholder="메모 내용을 입력하세요">${escapeHtml(state.newMemo.content)}</textarea>
                </div>
                <label class="checkbox-row">
                  <input type="checkbox" id="new-pinned" ${state.newMemo.pinned ? 'checked' : ''} />
                  상단 고정 메모로 추가
                </label>
                <div class="row-end">
                  <button class="small-btn" id="new-cancel">취소</button>
                  <button class="small-btn dark" id="new-save">추가</button>
                </div>
              </div>
            ` : ''}

            ${state.trashOpen ? `
              <div
                id="trash-pop"
                class="memo-pop trash ${state.newMemoOpen ? 'with-add-open' : ''}"
                style="${state.newMemoOpen ? `--memo-add-width:${Math.max(420, Math.min(1100, state.newMemo.expandedWidth || 420))}px;` : ''}"
              >
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                  <div style="font-size:16px;font-weight:700;">휴지통</div>
                  <button class="small-btn" id="trash-close">닫기</button>
                </div>
                ${state.trash.length === 0 ? `
                  <div style="font-size:13px;color:#94a3b8;">휴지통이 비어 있습니다.</div>
                ` : state.trash.map(item => `
                  <div class="trash-item">
                    <div class="trash-title">${escapeHtml(item.title)}</div>
                    <div class="trash-tag">#${escapeHtml(item.tag)}</div>
                    <div class="row-end">
                      <button class="small-btn" data-trash-restore="${item.id}">복원</button>
                      <button class="small-btn" data-trash-delete="${item.id}" style="color:#b91c1c;border-color:#fecaca;background:#fff5f5;">완전 삭제</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            </div>

            <div class="memo-board-resize-handle" id="memo-board-resize-handle" title="메모 보드 높이 조절"></div>
          </div>
        </div>
      `;

      bindMemoEvents();
    }

    function bindMemoEvents() {
      const board = document.getElementById('memo-board');
      const resizeHandle = document.getElementById('memo-board-resize-handle');

      resizeHandle?.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const startY = e.clientY;
        const startHeight = board.getBoundingClientRect().height;

        board.classList.add('resizing');

        function onMouseMove(ev) {
          const nextHeight = Math.max(720, Math.min(2200, Math.round(startHeight + (ev.clientY - startY))));
          state.memoBoardHeight = nextHeight;
          board.style.height = `${nextHeight}px`;
          board.style.minHeight = `${nextHeight}px`;
        }

        function onMouseUp() {
          board.classList.remove('resizing');
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          persistMemoBoardHeightToStorage(state.memoBoardHeight);
          renderMemoTab();
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });

      function applyLiveMemoWidth(noteId, title, content) {
        const width = Math.max(420, Math.min(1100, getMemoAutoWidth(title, content)));
        if (state.memoEditingId === noteId && state.editMemo) {
          state.editMemo.expandedWidth = width;
        }
        const noteEl = board.querySelector(`[data-note-id="${CSS.escape(noteId)}"]`);
        if (noteEl) {
          noteEl.style.width = `${width}px`;
        }
        const textarea = document.getElementById('edit-content');
        if (textarea) {
          textarea.style.width = '100%';
          textarea.style.overflow = 'auto';
        }
      }

      function applyLivePopupWidth(title, content) {
        const width = getMemoAutoWidth(title, content);
        state.newMemo.expandedWidth = width;
        const pop = document.querySelector('.memo-pop.add');
        if (pop) {
          pop.style.width = `${Math.max(420, Math.min(1100, width))}px`;
        }
        const textarea = document.getElementById('new-content');
        if (textarea) {
          textarea.style.width = '100%';
          textarea.style.overflow = 'auto';
        }
      }


      document.getElementById('new-memo-pop')?.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      document.getElementById('trash-pop')?.addEventListener('click', (e) => {
        e.stopPropagation();
      });


      document.getElementById('trash-toggle')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        state.trashOpen = !state.trashOpen;
        if (state.trashOpen) {
          try {
            await loadTrashMemosFromServer();
          } catch (err) {
            console.error(err);
          }
        }
        renderMemoTab();
      });
      document.getElementById('new-memo-toggle')?.addEventListener('click', (e) => {
        e.stopPropagation();
        state.newMemoOpen = true;
        renderMemoTab();
      });

      board.addEventListener('click', (e) => {
        if (e.target.closest('.memo-pop')) return;
        state.memoExpandedId = null;
        state.memoEditingId = null;
        renderMemoTab();
      });

      board.addEventListener('dragover', (e) => {
        const dt = e.dataTransfer;
        const types = dt && dt.types ? Array.from(dt.types) : [];
        if (!types.includes('text/plain')) return;
        e.preventDefault();
        dt.dropEffect = 'move';
      }, true);

      board.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = e.dataTransfer.getData('text/plain');
        if (!id) return;
        const notesLayer = board.querySelector('#memo-board-notes');
        const br = (notesLayer || board).getBoundingClientRect();
        let x = Math.round(e.clientX - br.left - memoDragOffset.x);
        let y = Math.round(e.clientY - br.top - memoDragOffset.y);
        x = Math.max(0, x);
        y = Math.max(0, y);
        const before = state.notes.find(n => String(n.id) === String(id));
        if (!before || !before.serverId) return;
        state.notes = state.notes.map(note => String(note.id) === String(id)
          ? {
              ...note,
              layout: { ...note.layout, x, y },
              originalLayout: { ...(note.originalLayout || note.layout), x, y }
            }
          : note);
        const moved = state.notes.find(n => String(n.id) === String(id));
        const layoutSaveSilent = { silent: true };
        try {
          await updateMemoOnServer(moved.serverId, {
            layout: moved.layout,
            originalLayout: moved.originalLayout
          }, layoutSaveSilent);
        } catch (err) {
          console.error(err);
          try {
            await loadMemosFromServer();
          } catch (_) { /* ignore */ }
        }
        renderMemoTab();
      }, true);

      board.querySelectorAll('[data-note-id]').forEach(noteEl => {
        const noteId = noteEl.dataset.noteId;

        noteEl.addEventListener('dragstart', (e) => {
          if (state.memoEditingId === noteId) {
            e.preventDefault();
            return;
          }
          e.stopPropagation();
          const rect = noteEl.getBoundingClientRect();
          memoDragOffset.x = e.clientX - rect.left;
          memoDragOffset.y = e.clientY - rect.top;
          e.dataTransfer.setData('text/plain', String(noteId));
          e.dataTransfer.effectAllowed = 'move';
          try {
            e.dataTransfer.setData('application/x-memo-id', String(noteId));
          } catch (_) { /* ignore */ }
          state.memoDraggingId = noteId;
          bringToFront(noteId);
        });

        noteEl.addEventListener('dragend', (e) => {
          state.memoDraggingId = null;
          if (e.dataTransfer && e.dataTransfer.dropEffect === 'move') lastMemoDragMoved = true;
        });

        noteEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (lastMemoDragMoved) {
            lastMemoDragMoved = false;
            return;
          }
          if (state.memoEditingId === noteId) return;

          const isClosing = state.memoExpandedId === noteId;
          state.memoExpandedId = isClosing ? null : noteId;

          if (state.memoEditingId === noteId) state.memoEditingId = null;

          if (!isClosing) {
            bringToFront(noteId);
          }

          renderMemoTab();
        });

        noteEl.addEventListener('mousedown', () => bringToFront(noteId));
      });

      board.querySelectorAll('[data-memo-edit]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.memoEdit;
          const target = state.notes.find(n => n.id === id);
          if (!target) return;
          state.memoExpandedId = id;
          state.memoEditingId = id;
          state.editMemo = {
            title: target.title || '',
            tag: target.tag || '메모',
            pinned: !!target.pinned,
            color: target.layout?.color || (target.imageOnly ? '#f8fafc' : '#fef3c7'),
            imageOnly: !!target.imageOnly,
            content: target.content || '',
            expandedWidth: Math.max(420, Number(target.expandedWidth) || getMemoAutoWidth(target.title, target.content)),
          };
          bringToFront(id);
          renderMemoTab();
        });
      });

      board.querySelectorAll('[data-memo-cancel]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          state.memoEditingId = null;
          renderMemoTab();
        });
      });

      board.querySelectorAll('[data-memo-save]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.memoSave;
          const currentTarget = state.notes.find(n => n.id === id);
          const hasExistingImage = !!(currentTarget && currentTarget.image);
          if (!state.editMemo.title.trim() && !state.editMemo.content.trim() && !hasExistingImage) {
            window.alert('제목, 내용, 이미지 중 하나는 남겨주세요.');
            return;
          }
          if (!currentTarget || !currentTarget.serverId) {
            setPortalMemoFeedback('저장할 메모를 찾을 수 없습니다.', 'error');
            renderMemoTab();
            return;
          }
          const color = state.editMemo.color || currentTarget.layout?.color || '#fef3c7';
          const next = {
            ...currentTarget,
            title: state.editMemo.title.trim(),
            tag: state.editMemo.tag.trim() || '메모',
            pinned: !!state.editMemo.pinned,
            content: state.editMemo.content.trim(),
            expandedWidth: Math.max(420, Number(state.editMemo.expandedWidth) || getMemoAutoWidth(state.editMemo.title, state.editMemo.content)),
            layout: { ...currentTarget.layout, color },
            originalLayout: { ...(currentTarget.originalLayout || currentTarget.layout), color }
          };
          try {
            await updateMemoOnServer(currentTarget.serverId, next);
            await loadMemosFromServer();
            setPortalMemoFeedback('메모가 수정되었습니다.', 'success');
            state.memoEditingId = null;
            renderMemoTab();
          } catch (err) {
            console.error(err);
            setPortalMemoFeedback(err?.message || '서버 저장 중 오류가 발생했습니다.', 'error');
            renderMemoTab();
          }
        });
      });

      board.querySelectorAll('[data-memo-delete]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.memoDelete;
          const target = state.notes.find(n => n.id === id);
          if (!target) return;
          if (!window.confirm('메모를 휴지통으로 이동할까요?')) return;
          if (!target.serverId) {
            state.notes = state.notes.filter(n => n.id !== id);
            renderMemoTab();
            return;
          }
          try {
            await softDeleteMemoOnServer(target.serverId);
            await Promise.all([loadMemosFromServer(), loadTrashMemosFromServer()]);
            setPortalMemoFeedback('휴지통으로 이동했습니다.', 'success');
            if (state.memoExpandedId === id) state.memoExpandedId = null;
            if (state.memoEditingId === id) state.memoEditingId = null;
            renderMemoTab();
          } catch (err) {
            console.error(err);
            setPortalMemoFeedback(err?.message || '서버 저장 중 오류가 발생했습니다.', 'error');
            renderMemoTab();
          }
        });
      });

      board.querySelectorAll('[data-new-color]').forEach(swatch => {
        swatch.addEventListener('click', (e) => {
          e.stopPropagation();
          state.newMemo.color = swatch.dataset.newColor;
          renderMemoTab();
        });
      });

      board.querySelectorAll('[data-edit-color]').forEach(swatch => {
        swatch.addEventListener('click', (e) => {
          e.stopPropagation();
          state.editMemo.color = swatch.dataset.editColor;
          renderMemoTab();
        });
      });

      document.getElementById('new-title')?.addEventListener('input', (e) => {
        state.newMemo.title = e.target.value;
        applyLivePopupWidth(state.newMemo.title, state.newMemo.content);
      });
      document.getElementById('new-tag')?.addEventListener('input', (e) => {
        state.newMemo.tag = e.target.value;
      });
      document.getElementById('new-content')?.addEventListener('input', (e) => {
        state.newMemo.content = e.target.value;
        applyLivePopupWidth(state.newMemo.title, state.newMemo.content);
      });
      document.getElementById('new-pinned')?.addEventListener('change', (e) => {
        state.newMemo.pinned = e.target.checked;
      });
      document.getElementById('new-image-only')?.addEventListener('change', (e) => {
        state.newMemo.imageOnly = e.target.checked;
        if (state.newMemo.imageOnly && !imageColorOptions.includes(state.newMemo.color)) state.newMemo.color = '#f8fafc';
        if (!state.newMemo.imageOnly && !colorOptions.includes(state.newMemo.color)) state.newMemo.color = '#fef3c7';
        renderMemoTab();
      });

      document.getElementById('new-cancel')?.addEventListener('click', (e) => {
        e.stopPropagation();
        state.newMemoOpen = false;
        renderMemoTab();
      });
      document.getElementById('new-save')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const fileInput = document.getElementById('new-image');
        const hasImage = !!(fileInput && fileInput.files[0]);
        if (!state.newMemo.title.trim() && !state.newMemo.content.trim() && !hasImage) {
          window.alert('제목, 내용, 이미지 중 하나는 입력해주세요.');
          return;
        }
        const nextIndex = state.notes.length;
        const baseLayout = initialLayouts[nextIndex % initialLayouts.length];
        const readFileAsDataUrl = () => new Promise((resolve, reject) => {
          if (!fileInput || !fileInput.files[0]) return resolve('');
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result || ''));
          fr.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
          fr.readAsDataURL(fileInput.files[0]);
        });
        try {
          let imageData = '';
          if (hasImage) imageData = await readFileAsDataUrl();
          const lx = baseLayout.x + (nextIndex % 3) * 18;
          const ly = baseLayout.y + (nextIndex % 4) * 16;
          const lc = state.newMemo.color || (state.newMemo.imageOnly ? '#f8fafc' : baseLayout.color);
          const draft = {
            title: state.newMemo.imageOnly ? '' : state.newMemo.title.trim(),
            tag: state.newMemo.tag.trim() || '메모',
            pinned: state.newMemo.pinned,
            imageOnly: !!state.newMemo.imageOnly,
            content: state.newMemo.imageOnly ? '' : state.newMemo.content.trim(),
            image: imageData,
            expandedWidth: Math.max(420, Number(state.newMemo.expandedWidth) || getMemoAutoWidth(state.newMemo.title, state.newMemo.content)),
            z: getNextZ(),
            layout: {
              x: lx,
              y: ly,
              rotate: baseLayout.rotate,
              color: lc
            },
            originalLayout: {
              x: lx,
              y: ly,
              rotate: baseLayout.rotate,
              color: lc
            }
          };
          await createMemoOnServer(draft);
          await loadMemosFromServer();
          setPortalMemoFeedback('메모가 저장되었습니다.', 'success');
          state.newMemo = { title: '', tag: '메모', pinned: false, imageOnly: false, color: '#fef3c7', content: '', expandedWidth: 420 };
          state.newMemoOpen = false;
          if (fileInput) fileInput.value = '';
          renderMemoTab();
        } catch (err) {
          console.error(err);
          setPortalMemoFeedback(err?.message || '서버 저장 중 오류가 발생했습니다.', 'error');
          renderMemoTab();
        }
      });

      document.getElementById('trash-close')?.addEventListener('click', (e) => {
        e.stopPropagation();
        state.trashOpen = false;
        renderMemoTab();
      });

      board.querySelectorAll('[data-trash-restore]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.trashRestore;
          const target = state.trash.find(t => t.id === id);
          if (!target || !target.serverId) return;
          try {
            await restoreMemoOnServer(target.serverId);
            await Promise.all([loadMemosFromServer(), loadTrashMemosFromServer()]);
            setPortalMemoFeedback('복원되었습니다.', 'success');
            renderMemoTab();
          } catch (err) {
            console.error(err);
            setPortalMemoFeedback(err?.message || '서버 저장 중 오류가 발생했습니다.', 'error');
            renderMemoTab();
          }
        });
      });

      board.querySelectorAll('[data-trash-delete]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.trashDelete;
          const target = state.trash.find(t => t.id === id);
          if (!target || !target.serverId) return;
          if (!window.confirm('휴지통에서 완전히 삭제하시겠습니까?')) return;
          try {
            await permanentDeleteMemoOnServer(target.serverId);
            await loadTrashMemosFromServer();
            setPortalMemoFeedback('삭제되었습니다.', 'success');
            renderMemoTab();
          } catch (err) {
            console.error(err);
            setPortalMemoFeedback(err?.message || '서버 저장 중 오류가 발생했습니다.', 'error');
            renderMemoTab();
          }
        });
      });

      document.getElementById('edit-title')?.addEventListener('input', (e) => {
        state.editMemo.title = e.target.value;
        applyLiveMemoWidth(state.memoEditingId, state.editMemo.title, state.editMemo.content);
      });
      document.getElementById('edit-tag')?.addEventListener('input', (e) => {
        state.editMemo.tag = e.target.value;
      });
      document.getElementById('edit-content')?.addEventListener('input', (e) => {
        state.editMemo.content = e.target.value;
        applyLiveMemoWidth(state.memoEditingId, state.editMemo.title, state.editMemo.content);
      });
      document.getElementById('edit-pinned')?.addEventListener('change', (e) => {
        state.editMemo.pinned = e.target.checked;
      });
    }


    function getScopeClass(scope) {
      const c = normalizeScopeCode(scope);
      if (c === 'all') return 'all';
      if (c === 'lab') return 'lab';
      if (c === 'team') return 'team';
      return 'personal';
    }

    function renderScopeCheck(label, value) {
      const active = normalizeScopeCode(state.scheduleForm.scope || 'lab') === normalizeScopeCode(value);

      let cls = 'scope-check';
      if (value === '전체') cls += ' scope-all';
      else if (value === '연구소') cls += ' scope-lab';
      else if (value === '팀') cls += ' scope-team';
      else cls += ' scope-private';

      if (active) cls += ' active';

      return `
        <label class="${cls}">
          <input type="checkbox" name="schedule-scope" value="${escapeAttr(value)}" ${active ? 'checked' : ''} />
          <span>${escapeHtml(label)}</span>
        </label>
      `;
    }


    function getScopeFilterClass(scope) {
      return getScopeClass(scope);
    }

    function getFilteredSchedulesForDate(dateKey) {
      const filters = state.scheduleScopeFilters || [];
      const list = scheduleRowsForDate(dateKey).map(mapScheduleRowToState);
      if (!filters.length) return [];
      return list.filter(item => filters.includes(item.scopeCode || 'lab'));
    }

    function getSchedulesForSelectedPanel() {
      const rangeMode = state.selectedPanelRangeFilter || '전체';
      if (rangeMode === '선택일') {
        return getFilteredSchedulesForDate(state.selectedDate);
      }

      const visibleRows = (state.schedules || []).filter(scheduleRowVisibleToCurrentUser);
      const allDates = [...new Set(visibleRows.map(s => s.schedule_date).filter(Boolean))].sort();
      const combined = [];
      for (const dateKey of allDates) {
        const dayItems = getFilteredSchedulesForDate(dateKey).map(item => ({
          ...item,
          panelDate: dateKey
        }));
        combined.push(...dayItems);
      }
      return combined;
    }

    function getSchedulePanelDate(item) {
      return item?.panelDate || state.selectedDate;
    }

    function buildSchedulePanelKeyById(id) {
      return `sid-${id}`;
    }

    function parseSchedulePanelKey(key) {
      const raw = String(key || '');
      if (raw.startsWith('sid-')) return { id: Number(raw.slice(4)) };
      return { id: NaN };
    }


    function renderMonthScopeFilter(label, value) {
      const active = (state.scheduleScopeFilters || []).includes(value);
      return `
        <label class="month-scope-chip ${getScopeFilterClass(value)}">
          <input type="checkbox" data-month-scope="${escapeAttr(value)}" ${active ? 'checked' : ''} />
          <span>${escapeHtml(label)}</span>
        </label>
      `;
    }


    function getOwnerLabel(item) {
      const code = item.scopeCode || normalizeScopeCode(item.scope);
      const author = item.author || '작성자';
      const teamName = item.teamName || '팀';
      const lab = item.lab || '연구소';
      if (code === 'all') return `전체 · ${author}`;
      if (code === 'lab') return `${lab} · ${author}`;
      if (code === 'team') return `${teamName} · ${author}`;
      return `${author}`;
    }


    function getAllSchedulesForDate(dateKey) {
      return scheduleRowsForDate(dateKey).map(mapScheduleRowToState);
    }

    function isNoticeItem(item) {
      return !!item.isNotice || item.type === '공지' || item.scope === '공지';
    }

    function getScopePriority(scope, item) {
      if (isNoticeItem(item)) return 0;
      const c = normalizeScopeCode(scope);
      if (c === 'personal') return 1;
      if (c === 'team') return 2;
      if (c === 'lab') return 3;
      return 4;
    }

    function sortSchedulesForPanel(list) {
      return [...list].sort((a, b) => {
        const priorityA = getScopePriority(a.scopeCode || 'lab', a);
        const priorityB = getScopePriority(b.scopeCode || 'lab', b);
        if (priorityA !== priorityB) return priorityA - priorityB;
        const timeA = a.displayMode === 'allDay' ? '00:00' : (a.startTime || '23:59');
        const timeB = b.displayMode === 'allDay' ? '00:00' : (b.startTime || '23:59');
        return timeA.localeCompare(timeB);
      });
    }
    function filterSchedulesByStatus(list) {
      const mode = state.selectedPanelStatusFilter || '전체';
      if (mode === '전체') return list;
      if (mode === '진행') return list.filter(item => !item.completed);
      if (mode === '완료') return list.filter(item => !!item.completed);
      return list;
    }


    function getReservationListForDate(dateKey) {
      const resName = String(state.selectedReservationResourceName || '').trim();
      if (!resName) return [];
      return state.reservations
        .filter(r => r.reserve_date === dateKey && String(r.resource_name || '').trim() === resName)
        .map(mapReservationRowToState)
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    }

    function getReservationStatusClass(status) {
      if (status === 'full') return 'full';
      if (status === 'partial') return 'partial';
      return 'available';
    }

    function getReservationDaySummary(dateKey) {
      const rows = (state.reservationsAll || []).filter(r => r.reserve_date === dateKey);
      const count = rows.length;
      if (!count) return { text: '예약 가능', cls: 'available', count: 0 };
      const items = rows.map(mapReservationRowToState);
      const fullCount = items.filter(i => i.status === 'full').length;
      const partialCount = items.filter(i => i.status === 'partial').length;
      if (fullCount >= 2) return { text: `${count}건 예약`, cls: 'full', count };
      if (partialCount || fullCount) return { text: `${count}건 예약`, cls: 'partial', count };
      return { text: `${count}건 예약`, cls: 'partial', count };
    }

    async function setPlannerMode(mode) {
      state.plannerMode = mode;
      state.portalPlannerFeedback = { msg: '', kind: '' };
      state.reservationModalOpen = false;
      if (mode === 'reservation') {
        await loadReservationResourcesForPortal();
        await loadReservationsForMonth(state.calendarMonth);
      }
      renderScheduleTab();
    }





    const rsvPointerState = { active: false, anchorIdx: null, lastIdx: null, moved: false };

    function isReservationSlotBooked(slotStartMin, rows, excludeId) {
      const slotEnd = slotStartMin + 30;
      const list = rows || state.reservations || [];
      for (const r of list) {
        if (excludeId != null && Number(r.id) === Number(excludeId)) continue;
        const a = timeToMinutes(r.start_time);
        let b = timeToMinutes(r.end_time || r.start_time);
        if (b <= a) b = a + 30;
        if (slotStartMin < b && slotEnd > a) return true;
      }
      return false;
    }

    function reservationSlotIndexRangeFree(i0, i1, excludeId) {
      const a = Math.min(i0, i1);
      const b = Math.max(i0, i1);
      for (let k = a; k <= b; k++) {
        if (isReservationSlotBooked(k * 30, state.reservations, excludeId)) return false;
      }
      return true;
    }

    function clearReservationDragHighlight() {
      document.querySelectorAll('.rsv-slot-cell.drag-preview, .rsv-slot-cell.drag-preview-start, .rsv-slot-cell.drag-preview-end').forEach(el => {
        el.classList.remove('drag-preview', 'drag-preview-start', 'drag-preview-end');
      });
    }

    function updateReservationDragHighlight(lo, hi) {
      clearReservationDragHighlight();
      const a = Math.min(lo, hi);
      const b = Math.max(lo, hi);
      for (let k = a; k <= b; k++) {
        const el = document.querySelector(`#reservation-slots-inner [data-rsv-slot="${k}"]`);
        if (!el || el.classList.contains('booked')) continue;
        el.classList.add('drag-preview');
        if (k === a) el.classList.add('drag-preview-start');
        if (k === b) el.classList.add('drag-preview-end');
      }
    }

    function renderReservationTabs() {
      const list = state.reservationResourcesList || [];
      const sel = String(state.selectedReservationResourceName || '').trim();
      if (!list.length) {
        return `<div style="font-size:13px;color:#94a3b8;line-height:1.5;">등록된 예약 장소가 없습니다. <strong>설정 → 예약장소 설정</strong>에서 장소를 추가해 주세요.</div>`;
      }
      return `
        <div class="reservation-tabs-wrap">
          <div class="reservation-tabs">
            ${list.map((r, idx) => {
              const nm = String(r.name || '').trim();
              if (!nm) return '';
              const active = nm === sel;
              return `
              <button type="button" class="reservation-tab ${active ? 'active' : ''}" data-reservation-tab="${idx}" data-reservation-id="${r.id}" data-reservation-name="${escapeAttr(nm)}">
                ${escapeHtml(nm)}
              </button>`;
            }).join('')}
          </div>
        </div>
      `;
    }

    function renderReservationModal() {
      const ro = !!state.reservationReadonly;
      const title = state.reservationViewId ? '예약 상세' : (state.reservationEditingId ? '예약 수정' : '예약 추가');
      const place = String(state.selectedReservationResourceName || '').trim();
      const dateLabel = formatDateLabel(state.selectedDate);
      const delBtn = !ro && state.reservationEditingId
        ? `<button type="button" class="small-btn" id="reservation-modal-delete" style="color:#b91c1c;border-color:#fecaca;background:#fff5f5;">삭제</button>`
        : '';
      const actions = ro
        ? `<div class="row-end" style="margin-top:14px;"><button type="button" class="small-btn dark" id="reservation-modal-close-only">닫기</button></div>`
        : `<div class="row-end" style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
            ${state.reservationEditingId ? `<button type="button" class="small-btn" id="reservation-modal-cancel">취소</button>` : `<button type="button" class="small-btn" id="reservation-modal-cancel">닫기</button>`}
            ${delBtn}
            <button type="button" class="small-btn dark" id="reservation-modal-save">${state.reservationEditingId ? '수정 저장' : '예약 저장'}</button>
          </div>`;
      return `
        <div class="reservation-modal-backdrop" id="reservation-modal-backdrop" aria-hidden="false">
          <div class="reservation-modal-card" id="reservation-modal-card" role="dialog" aria-modal="true">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px;">
              <div style="font-size:18px;font-weight:800;color:#0f172a;">${escapeHtml(title)}</div>
              <button type="button" class="small-btn" id="reservation-modal-x">닫기</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
              <div class="field"><label>날짜</label><input type="text" readonly style="background:#f8fafc;" value="${escapeAttr(dateLabel)}" /></div>
              <div class="field"><label>장소</label><input type="text" readonly style="background:#f8fafc;" value="${escapeAttr(place)}" /></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div class="field"><label for="rf-modal-start">시작</label><select id="rf-modal-start" ${ro ? 'disabled' : ''}></select></div>
              <div class="field"><label for="rf-modal-end">종료</label><select id="rf-modal-end" ${ro ? 'disabled' : ''}></select></div>
            </div>
            <div class="field"><label for="rf-modal-title">제목</label><input type="text" id="rf-modal-title" value="${escapeAttr(state.reservationForm.title || '')}" placeholder="예약 제목" autocomplete="off" ${ro ? 'readonly' : ''} /></div>
            <div class="field"><label for="rf-modal-desc">설명</label><textarea id="rf-modal-desc" rows="3" placeholder="설명(선택)" ${ro ? 'readonly' : ''}>${escapeHtml(state.reservationForm.description || '')}</textarea></div>
            ${actions}
          </div>
        </div>
      `;
    }

    function renderReservationTimeTable() {
      const rows = Array.from({ length: 49 }, (_, i) => {
        const totalMinutes = i * 30;
        const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
        const mm = String(totalMinutes % 60).padStart(2, '0');
        return `${hh}:${mm}`;
      });

      const activeResource = getActiveReservationResource();
      const rawList = state.reservations || [];
      const exId = state.reservationEditingId;

      const slotsHtml = rows.map((label, i) => {
        const startMin = i * 30;
        const booked = isReservationSlotBooked(startMin, rawList, exId);
        const cls = booked ? 'rsv-slot-cell booked' : 'rsv-slot-cell';
        return `<div class="${cls}" data-rsv-slot="${i}" data-rsv-min="${startMin}" style="top:${i * 28}px;"></div>`;
      }).join('');

      const blocks = rawList.map((row) => {
        const item = mapReservationRowToState(row);
        const start = timeToMinutes(row.start_time);
        let end = timeToMinutes(row.end_time || row.start_time);
        if (end <= start) end = start + 30;
        const top = (start / 30) * 28;
        const height = Math.max(28, ((end - start) / 30) * 28 - 2);
        let cls = getReservationStatusClass(item.status);
        if (item.isMine) cls += ' mine';
        return `
          <div class="reservation-time-block ${cls}" data-reservation-block-id="${row.id}" style="top:${top}px;height:${height}px;z-index:4;">
            <div class="reservation-time-block-time">${escapeHtml(item.startTime)} - ${escapeHtml(item.endTime)}</div>
            <div class="reservation-time-block-title">${escapeHtml(item.title)}</div>
            <div class="reservation-time-block-meta">${escapeHtml(item.reserver)} · ${escapeHtml(item.teamName)}</div>
          </div>
        `;
      }).join('');

      return `
        <div style="font-size:13px;color:#64748b;margin-top:6px;">
          ${formatDateLabel(state.selectedDate)} · ${escapeHtml(activeResource.name || '')}
        </div>
        <div class="reservation-timetable-wrap">
          <div class="reservation-timetable">
            <div class="reservation-timetable-grid">
              <div class="reservation-time-labels">
                ${rows.map(label => `<div class="reservation-time-row reservation-time-label">${label}</div>`).join('')}
              </div>
              <div class="reservation-time-slots">
                <div class="reservation-time-slots-inner" id="reservation-slots-inner">
                  ${rows.map(() => `<div class="reservation-time-row reservation-time-slot"></div>`).join('')}
                  ${slotsHtml}
                  ${blocks}
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function getCalendarMonthDate() {
      const key = state.calendarMonth || todayMonthKey;
      const base = new Date(`${key}T00:00:00`);
      if (Number.isNaN(base.getTime())) return new Date(`${todayMonthKey}T00:00:00`);
      return new Date(base.getFullYear(), base.getMonth(), 1);
    }

    function formatCalendarMonthLabel(date) {
      return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
    }

    async function shiftCalendarMonth(offset) {
      state.reservationModalOpen = false;
      const current = getCalendarMonthDate();
      const shifted = new Date(current.getFullYear(), current.getMonth() + offset, 1);
      state.calendarMonth = `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-01`;

      const selected = new Date(`${state.selectedDate}T00:00:00`);
      if (Number.isNaN(selected.getTime()) || selected.getFullYear() !== shifted.getFullYear() || selected.getMonth() !== shifted.getMonth()) {
        const fallbackDay = Math.min(1, new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate());
        state.selectedDate = `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(fallbackDay).padStart(2, '0')}`;
      }
      await loadReservationsForMonth(state.calendarMonth);
      applyReservationFilter();
      renderScheduleTab();
    }

    function buildCalendarCells(date) {
      const year = date.getFullYear();
      const month = date.getMonth();
      const firstWeekday = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
      return Array.from({ length: totalCells }, (_, index) => {
        const dayNumber = index - firstWeekday + 1;
        if (dayNumber < 1 || dayNumber > daysInMonth) return null;
        return dayNumber;
      });
    }


    function renderScheduleEditor() {
      if (!state.scheduleEditorOpen) return '';
      const form = state.scheduleForm || {};
      const isEdit = state.scheduleEditingId !== null;
      const scopeOptions = [
        { label: '전체', value: 'all' },
        { label: '연구소', value: 'lab' },
        { label: '팀', value: 'team' },
        { label: '개인', value: 'personal' }
      ];
      const scopeClassMap = { all: 'all', lab: 'lab', team: 'team', personal: 'private' };
      return `
        <div class="card" style="border:1px solid #dbeafe;background:#f8fbff;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;">
            <div>
              <div style="font-size:18px;font-weight:800;color:#0f172a;">${isEdit ? '일정 수정' : '일정 추가'}</div>
              <div style="font-size:13px;color:#64748b;margin-top:4px;">${formatDateLabel(state.selectedDate)} 일정 입력</div>
            </div>
            <button class="small-btn" type="button" id="schedule-close">닫기</button>
          </div>
          <div class="field">
            <label for="sf-text">일정 제목</label>
            <input type="text" id="sf-text" value="${escapeAttr(form.text || '')}" placeholder="예: 폐수 입력 확인" autocomplete="off" />
          </div>
          <div class="field">
            <label for="sf-mode">시간 표시</label>
            <select id="sf-mode">
              <option value="allDay" ${form.displayMode === 'allDay' ? 'selected' : ''}>종일</option>
              <option value="start" ${form.displayMode === 'start' ? 'selected' : ''}>시작시간만</option>
              <option value="range" ${form.displayMode === 'range' ? 'selected' : ''}>시간범위</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">
            <div class="field">
              <label for="sf-start">시작시간</label>
              <input type="time" id="sf-start" value="${escapeAttr(form.startTime || '09:00')}" ${form.displayMode === 'allDay' ? 'disabled' : ''} />
            </div>
            <div class="field">
              <label for="sf-end">종료시간</label>
              <input type="time" id="sf-end" value="${escapeAttr(form.endTime || '10:00')}" ${form.displayMode !== 'range' ? 'disabled' : ''} />
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">
            <div class="field">
              <label for="sf-type">구분</label>
              <select id="sf-type">
                ${['업무','문서','문서함','회의','점검','결재','기타'].map(opt => `<option value="${opt}" ${form.type === opt ? 'selected' : ''}>${opt}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label for="sf-app">앱/카테고리</label>
              <select id="sf-app">
                ${['-','폐수관리','문서함','결재','업무','개인'].map(opt => `<option value="${opt}" ${form.app === opt ? 'selected' : ''}>${opt}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field">
            <label>공개 범위</label>
            <div class="scope-check-grid">
              ${scopeOptions.map(opt => {
                const active = normalizeScopeCode(form.scope || 'lab') === opt.value;
                const cls = scopeClassMap[opt.value] || 'all';
                return `<label class="scope-check scope-${cls} ${active ? 'active' : ''}"><input type="radio" name="schedule-scope" value="${opt.value}" ${active ? 'checked' : ''} />${escapeHtml(opt.label)}</label>`;
              }).join('')}
            </div>
          </div>
          <div class="field">
            <label for="sf-desc">상세 내용</label>
            <textarea id="sf-desc" class="auto-grow-textarea" rows="4" placeholder="상세 내용을 입력하세요">${escapeHtml(form.description || '')}</textarea>
          </div>
          <div class="row-end">
            <button class="small-btn" type="button" id="schedule-cancel">취소</button>
            <button class="small-btn dark" type="button" id="schedule-save">${isEdit ? '수정 저장' : '추가 저장'}</button>
          </div>
        </div>
      `;
    }

    function renderScheduleTab() {
      const resNm = String(state.selectedReservationResourceName || '').trim();
      const idxFound = (state.reservationResourcesList || []).findIndex(r => String(r.name || '').trim() === resNm);
      if (idxFound >= 0) state.activeReservationTab = idxFound;

      const weekNames = ['일', '월', '화', '수', '목', '금', '토'];
      const currentMonthDate = getCalendarMonthDate();
      const currentMonthLabel = formatCalendarMonthLabel(currentMonthDate);
      const currentMonthPrefix = `${currentMonthDate.getFullYear()}-${String(currentMonthDate.getMonth() + 1).padStart(2, '0')}`;
      const cells = buildCalendarCells(currentMonthDate);

      const isReservationMode = state.plannerMode === 'reservation';
      const selectedSchedules = filterSchedulesByStatus(sortSchedulesForPanel(getSchedulesForSelectedPanel()));

      tabContent.innerHTML = `
        <div class="schedule-grid">
          <div class="card calendar-side-fixed">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;gap:12px;">
              <div>
                <div class="planner-switch" data-mode="${state.plannerMode}">
                  <div class="planner-switch-indicator"></div>
                  <button type="button" data-planner-mode="schedule" class="${state.plannerMode === 'schedule' ? 'active' : ''}">스케줄</button>
                  <button type="button" data-planner-mode="reservation" class="${state.plannerMode === 'reservation' ? 'active' : ''}">예약</button>
                </div>
                <div style="font-size:13px;color:#64748b;margin-top:8px;">
                  ${isReservationMode
                    ? (getActiveReservationResource().name
                      ? `선택 장소: <strong>${escapeHtml(getActiveReservationResource().name)}</strong> · ${formatDateLabel(state.selectedDate)}`
                      : '예약 장소를 관리자 화면에서 등록해 주세요.')
                    : '달력은 계획 확인용, 오른쪽은 선택한 날짜의 실행 일정'}
                </div>
                ${!isReservationMode ? `
                  <div class="month-scope-filter-row">
                    ${renderMonthScopeFilter('전체', 'all')}
                    ${renderMonthScopeFilter('연구소', 'lab')}
                    ${renderMonthScopeFilter('팀', 'team')}
                    ${renderMonthScopeFilter('개인', 'personal')}
                  </div>
                ` : ``}
              </div>
              <div style="display:flex;gap:8px;">
                <button class="small-btn" type="button" id="calendar-prev-month">이전달</button>
                <button class="small-btn dark" type="button" id="calendar-current-month">${currentMonthLabel}</button>
                <button class="small-btn" type="button" id="calendar-next-month">다음달</button>
              </div>
            </div>

            <div class="weekdays">
              ${weekNames.map(name => `<div class="weekday">${name}</div>`).join('')}
            </div>

            <div class="calendar-grid">
              ${cells.map(cell => {
                const day = Number.isInteger(cell) ? cell : null;
                const dateKey = day ? `${currentMonthPrefix}-${String(day).padStart(2, '0')}` : '';
                const isSelected = dateKey === state.selectedDate;

                if (isReservationMode) {
                  const summary = day ? getReservationDaySummary(dateKey) : { text: '', cls: 'available', count: 0 };
                  return `
                    <div class="day-cell ${isSelected ? 'selected' : ''}" ${dateKey ? `data-date="${dateKey}"` : ''}>
                      <div class="day-num">${day || ''}${day ? `<span class="day-count">${summary.count ? summary.count + '건' : ''}</span>` : ''}</div>
                      ${day ? `<div class="reservation-badge ${summary.cls}">${summary.text}</div>` : ``}
                    </div>
                  `;
                }

                const filteredDayItems = day ? getFilteredSchedulesForDate(dateKey) : [];
                const count = filteredDayItems.length;
                return `
                  <div class="day-cell ${isSelected ? 'selected' : ''}" ${dateKey ? `data-date="${dateKey}"` : ''}>
                    <div class="day-num">${day || ''}${day ? `<span class="day-count">${count}건</span>` : ''}</div>
                    ${count
                      ? filteredDayItems.slice(0, 3).map(item => {
                          const cls = getScopeClass(item.scopeCode || 'lab');
                          return `<div class="scope-badge ${cls}" style="margin-bottom:4px;">${escapeHtml(item.text)}</div>`;
                        }).join('')
                      : (day ? `<div class="muted-mini">일정 없음</div>` : ``)}
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <div class="reservation-panel" style="display:flex;flex-direction:column;gap:20px;">
            <div class="card">
              <div style="font-size:13px;margin-bottom:10px;padding:8px 10px;border-radius:10px;display:${state.portalPlannerFeedback?.msg ? 'block' : 'none'};background:${state.portalPlannerFeedback?.kind === 'error' ? '#fef2f2' : '#ecfdf5'};color:${state.portalPlannerFeedback?.kind === 'error' ? '#991b1b' : '#166534'};">${state.portalPlannerFeedback?.msg ? escapeHtml(state.portalPlannerFeedback.msg) : ''}</div>
              ${(state.scheduleLoading || state.reservationLoading) ? `<div style="font-size:12px;color:#64748b;margin-bottom:8px;">불러오는 중...</div>` : ``}
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;gap:12px;">
                <div class="reservation-header-main">
                  ${isReservationMode ? `
                    <div style="font-size:18px;font-weight:800;margin-bottom:6px;">선택 날짜 예약</div>
                    ${renderReservationTabs()}
                    ${renderReservationTimeTable()}
                  ` : `
                    <div class="selected-panel-toolbar">
                      <div class="selected-panel-switch-row" style="margin-bottom:0;">
                        <div class="selected-panel-switch" data-range-mode="${state.selectedPanelRangeFilter}">
                          <div class="selected-panel-switch-indicator"></div>
                          <button type="button" data-range-filter="전체" class="${state.selectedPanelRangeFilter === '전체' ? 'active' : ''}">전&nbsp;&nbsp;체</button>
                          <button type="button" data-range-filter="선택일" class="${state.selectedPanelRangeFilter === '선택일' ? 'active' : ''}">선택일</button>
                        </div>
                      </div>
                      <div class="selected-panel-status-filter">
                        <button type="button" data-status-filter="전체" class="${state.selectedPanelStatusFilter === '전체' ? 'active' : ''}">전체</button>
                        <button type="button" data-status-filter="진행" class="${state.selectedPanelStatusFilter === '진행' ? 'active' : ''}">진행</button>
                        <button type="button" data-status-filter="완료" class="${state.selectedPanelStatusFilter === '완료' ? 'active' : ''}">완료</button>
                      </div>
                    </div>
                  `}
                  ${isReservationMode ? `` : `
                  <div style="font-size:13px;color:#64748b;">
                    ${formatDateLabel(state.selectedDate)} 기준
                  </div>`}
                </div>
                ${isReservationMode ? `<div></div>` : `
                <div style="display:flex;gap:8px;">
                  <button class="small-btn dark" id="schedule-add">추가</button>
                  <button class="small-btn" id="schedule-today">오늘로 이동</button>
                </div>`}
              </div>


              ${!isReservationMode ? renderScheduleEditor() : ``}

              ${!isReservationMode ? `<div class="schedule-list">
                ${(
                  selectedSchedules.length === 0 ? `
                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:18px;color:#94a3b8;font-size:13px;">등록된 일정이 없습니다.</div>
                  ` : selectedSchedules.map((item, index) => {
                    const itemDateKey = getSchedulePanelDate(item);
                    const panelKey = buildSchedulePanelKeyById(item.id);
                    const isExpanded = state.scheduleExpandedIndex === panelKey;
                    return `
                      <div class="schedule-item scope-${getScopeClass(item.scopeCode || 'lab')} ${item.completed ? 'completed' : ''}">
                        <button class="schedule-head" data-schedule-expand="${escapeAttr(panelKey)}">
                          <div onclick="event.stopPropagation()" style="display:flex;align-items:flex-start;padding-top:2px;">
                            <input type="checkbox" data-schedule-complete="${escapeAttr(panelKey)}" ${item.completed ? 'checked' : ''} style="margin-top:2px;" ${item.canMutate ? '' : 'disabled title="작성자만 완료 처리 가능합니다."'} />
                          </div>
                          <div class="schedule-time">
                            <strong>${escapeHtml(getScheduleTimeLabel(item))}</strong>
                            <div class="scope-badge ${getScopeClass(item.scopeCode || 'lab')}">${escapeHtml(item.scope || '연구소')}</div>
                            ${item.completed ? `<div class="done-label">완료</div>` : ``}
                          </div>
                          <div class="schedule-main" style="position:relative;">
                            <div class="schedule-owner" style="position:absolute; right:0; top:0; text-align:right;">
                              ${escapeHtml(getOwnerLabel(item))}
                            </div>
                            <div class="schedule-title ${item.completed ? 'completed' : ''}" style="padding-right:90px;">
                              ${escapeHtml(item.text)}
                            </div>
                            <div class="schedule-meta">${escapeHtml(
                              (state.selectedPanelRangeFilter === '전체' && item.panelDate ? `${formatDateLabel(item.panelDate)} · ` : '') +
                              (item.app && item.app !== '-' ? `${item.type} · ${item.app}` : item.type)
                            )}</div>
                          </div>
                          <div class="schedule-toggle">${isExpanded ? '−' : '+'}</div>
                        </button>

                        ${isExpanded ? `
                          <div class="schedule-body">
                            <div class="schedule-desc">${escapeHtml(item.description || '상세 내용 없음')}</div>
                            <div class="memo-actions">
                              ${item.app && item.app !== '-' ? `<button class="small-btn dark">바로가기</button>` : ``}
                              ${item.canMutate ? `
                              <button class="small-btn" data-schedule-edit="${escapeAttr(panelKey)}">수정</button>
                              <button class="small-btn" data-schedule-delete="${escapeAttr(panelKey)}" style="color:#b91c1c;border-color:#fecaca;background:#fff5f5;">삭제</button>
                              ` : `<span style="font-size:12px;color:#94a3b8;">작성자만 수정 삭제 가능합니다.</span>`}
                            </div>
                          </div>
                        ` : ``}
                      </div>
                    `;
                  }).join('')
                )}
              </div>` : ``}
            </div>

            <div class="card">
              <div style="font-size:16px;font-weight:700;margin-bottom:10px;">${isReservationMode ? '예약 이용 안내' : '스케줄 안내'}</div>
              <div class="tips">
                ${isReservationMode ? `
                • 장소 탭은 관리자가 등록한 예약 장소 목록입니다<br />
                • 빈 칸 클릭(30분) 또는 드래그(연속) 후 중앙 모달에서 저장합니다<br />
                • 드래그 중 파란 영역으로 선택 범위가 표시되며, 예약된 칸은 포함할 수 없습니다<br />
                • 예약 블록을 클릭해 내용을 확인합니다(내 예약은 모달에서 수정·삭제)
                ` : `
                • 달력은 마감일, 점검일, 반복 일정을 한눈에 보는 용도<br />
                • 오른쪽 일정은 선택한 날짜의 실제 실행 목록<br />
                • 날짜 클릭 → 일정 확인 → 바로가기 이동 구조가 가장 쓰기 편합니다
                `}
              </div>
            </div>
          </div>
        </div>
        ${isReservationMode && state.reservationModalOpen ? renderReservationModal() : ''}
      `;

      bindScheduleEvents();
    }
    function populateReservationTimeSelects() {
      if (state.plannerMode !== 'reservation') return;
      const startSel = document.getElementById('rf-modal-start');
      const endSel = document.getElementById('rf-modal-end');
      if (!startSel || !endSel) return;
      const excludeId = state.reservationEditingId;
      if (state.reservationReadonly) {
        const s = state.reservationForm.startTime || '09:00';
        const e = state.reservationForm.endTime || '10:00';
        startSel.innerHTML = `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`;
        endSel.innerHTML = `<option value="${escapeAttr(e)}">${escapeHtml(e)}</option>`;
        return;
      }
      startSel.innerHTML = '';
      for (let i = 0; i < 49; i++) {
        const sm = i * 30;
        if (!isReservationSlotBooked(sm, state.reservations, excludeId)) {
          const o = document.createElement('option');
          o.value = minutesToTime(sm);
          o.textContent = minutesToTime(sm);
          startSel.appendChild(o);
        }
      }
      const wantS = state.reservationForm.startTime || '09:00';
      if ([...startSel.options].some(o => o.value === wantS)) startSel.value = wantS;
      else if (startSel.options.length) startSel.value = startSel.options[0].value;

      const refillEnds = () => {
        const startMin = timeToMinutes(startSel.value || '00:00');
        endSel.innerHTML = '';
        const resName = String(state.selectedReservationResourceName || '').trim();
        for (let end = startMin + 30; end <= 24 * 60; end += 30) {
          if (checkReservationOverlap(state.selectedDate, resName, minutesToTime(startMin), minutesToTime(end), excludeId)) break;
          const o = document.createElement('option');
          o.value = minutesToTime(end);
          o.textContent = minutesToTime(end);
          endSel.appendChild(o);
        }
        if (!endSel.options.length) {
          const o = document.createElement('option');
          o.value = minutesToTime(startMin + 30);
          o.textContent = minutesToTime(startMin + 30);
          endSel.appendChild(o);
        }
        const wantE = state.reservationForm.endTime || '10:00';
        if ([...endSel.options].some(o => o.value === wantE)) endSel.value = wantE;
        else endSel.value = endSel.options[endSel.options.length - 1].value;
      };
      refillEnds();
      startSel.onchange = () => {
        refillEnds();
        state.reservationForm.startTime = startSel.value;
        state.reservationForm.endTime = endSel.value;
      };
      endSel.onchange = () => {
        state.reservationForm.endTime = endSel.value;
      };
    }

    function bindReservationSlotPointer() {
      const inner = document.getElementById('reservation-slots-inner');
      if (!inner || state.plannerMode !== 'reservation') return;

      const onUp = () => {
        if (!rsvPointerState.active) return;
        rsvPointerState.active = false;
        window.removeEventListener('mouseup', onUp);
        clearReservationDragHighlight();
        const a = rsvPointerState.anchorIdx;
        const b = rsvPointerState.lastIdx;
        if (a == null || b == null) return;
        const moved = !!rsvPointerState.moved;
        rsvPointerState.moved = false;
        let i0 = a;
        let i1 = moved ? b : a;
        if (!String(state.selectedReservationResourceName || '').trim()) {
          setPortalPlannerFeedback('예약 장소를 먼저 선택해 주세요.', 'error');
          renderScheduleTab();
          return;
        }
        if (!reservationSlotIndexRangeFree(i0, i1, state.reservationEditingId)) {
          setPortalPlannerFeedback('이미 예약된 시간과 겹칩니다.', 'error');
          renderScheduleTab();
          return;
        }
        const lo = Math.min(i0, i1);
        const hi = Math.max(i0, i1);
        const startMin = lo * 30;
        const endMin = (hi + 1) * 30;
        state.reservationViewId = null;
        state.reservationEditingId = null;
        state.reservationReadonly = false;
        state.reservationForm = {
          startTime: minutesToTime(startMin),
          endTime: minutesToTime(endMin),
          title: '',
          description: ''
        };
        if (checkReservationOverlap(
          state.selectedDate,
          String(state.selectedReservationResourceName || '').trim(),
          state.reservationForm.startTime,
          state.reservationForm.endTime,
          null
        )) {
          setPortalPlannerFeedback('이미 예약된 시간과 겹칩니다.', 'error');
          renderScheduleTab();
          return;
        }
        setPortalPlannerFeedback('', '');
        state.reservationModalOpen = true;
        renderScheduleTab();
      };

      inner.querySelectorAll('[data-rsv-slot]:not(.booked)').forEach(el => {
        el.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          if (state.reservationModalOpen) return;
          const idx = Number(el.dataset.rsvSlot);
          if (!Number.isFinite(idx)) return;
          clearReservationDragHighlight();
          rsvPointerState.active = true;
          rsvPointerState.anchorIdx = idx;
          rsvPointerState.lastIdx = idx;
          rsvPointerState.moved = false;
          updateReservationDragHighlight(idx, idx);
          window.addEventListener('mouseup', onUp);
        });
        el.addEventListener('mouseenter', () => {
          if (!rsvPointerState.active || state.reservationModalOpen) return;
          const idx = Number(el.dataset.rsvSlot);
          if (!Number.isFinite(idx)) return;
          if (el.classList.contains('booked')) return;
          const anchor = rsvPointerState.anchorIdx;
          if (!Number.isFinite(anchor)) return;
          const lo = Math.min(anchor, idx);
          const hi = Math.max(anchor, idx);
          if (!reservationSlotIndexRangeFree(lo, hi, state.reservationEditingId)) return;
          if (idx !== anchor) rsvPointerState.moved = true;
          rsvPointerState.lastIdx = idx;
          updateReservationDragHighlight(lo, hi);
        });
      });

      inner.querySelectorAll('[data-reservation-block-id]').forEach(block => {
        block.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = Number(block.dataset.reservationBlockId);
          const row = state.reservations.find(r => Number(r.id) === id);
          if (!row) return;
          if (canMutateReservationRow(row)) {
            state.reservationViewId = null;
            state.reservationReadonly = false;
            state.reservationEditingId = id;
            state.reservationForm = {
              startTime: row.start_time || '09:00',
              endTime: row.end_time || '10:00',
              title: row.title || '',
              description: row.description || ''
            };
          } else {
            state.reservationEditingId = null;
            state.reservationViewId = id;
            state.reservationReadonly = true;
            state.reservationForm = {
              startTime: row.start_time || '09:00',
              endTime: row.end_time || '10:00',
              title: row.title || '',
              description: row.description || ''
            };
          }
          state.reservationModalOpen = true;
          renderScheduleTab();
        });
      });
    }

    function bindScheduleEvents() {
      tabContent.querySelectorAll('[data-planner-mode]').forEach(btn => {
        btn.addEventListener('click', async () => {
          await setPlannerMode(btn.dataset.plannerMode);
        });
      });

      tabContent.querySelectorAll('[data-reservation-tab]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const name = String(btn.dataset.reservationName || '').trim();
          if (!name) return;
          state.activeReservationTab = Number(btn.dataset.reservationTab);
          state.selectedReservationResourceName = name;
          const rid = btn.dataset.reservationId;
          state.selectedReservationResourceId = rid != null && rid !== '' ? Number(rid) : null;
          state.reservationModalOpen = false;
          state.reservationEditingId = null;
          state.reservationViewId = null;
          state.reservationReadonly = false;
          state.reservationForm = { startTime: '09:00', endTime: '10:00', title: '', description: '' };
          await loadReservationsForMonth(state.calendarMonth);
          applyReservationFilter();
          renderScheduleTab();
        });
      });

      tabContent.querySelectorAll('[data-date]').forEach(cell => {
        cell.addEventListener('click', () => {
          state.selectedDate = cell.dataset.date;
          state.selectedPanelRangeFilter = '선택일';
          state.selectedPanelStatusFilter = '전체';
          state.scheduleExpandedIndex = null;
          state.reservationEditingId = null;
          state.reservationViewId = null;
          state.reservationReadonly = false;
          state.reservationModalOpen = false;
          state.reservationForm = { startTime: '09:00', endTime: '10:00', title: '', description: '' };
          applyReservationFilter();
          renderScheduleTab();
        });
      });

      document.getElementById('schedule-today')?.addEventListener('click', async () => {
        state.selectedDate = todayDateKey;
        state.calendarMonth = todayMonthKey;
        state.reservationModalOpen = false;
        if (state.plannerMode === 'reservation') {
          await loadReservationsForMonth(state.calendarMonth);
          applyReservationFilter();
        }
        renderScheduleTab();
      });

      document.getElementById('calendar-prev-month')?.addEventListener('click', async () => {
        await shiftCalendarMonth(-1);
      });

      document.getElementById('calendar-next-month')?.addEventListener('click', async () => {
        await shiftCalendarMonth(1);
      });

      document.getElementById('calendar-current-month')?.addEventListener('click', async () => {
        state.calendarMonth = todayMonthKey;
        const selPrefix = state.selectedDate.slice(0, 7);
        const todayPrefix = todayDateKey.slice(0, 7);
        if (selPrefix !== todayPrefix) state.selectedDate = todayDateKey;
        state.reservationModalOpen = false;
        await loadReservationsForMonth(state.calendarMonth);
        applyReservationFilter();
        renderScheduleTab();
      });

      tabContent.querySelectorAll('[data-month-scope]').forEach(chk => {
        chk.addEventListener('change', () => {
          const value = chk.dataset.monthScope;
          const current = new Set(state.scheduleScopeFilters || []);
          if (chk.checked) current.add(value);
          else current.delete(value);
          state.scheduleScopeFilters = Array.from(current);
          renderScheduleTab();
        });
      });

      tabContent.querySelectorAll('[data-status-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
          state.selectedPanelStatusFilter = btn.dataset.statusFilter;
          state.scheduleExpandedIndex = null;
          renderScheduleTab();
        });
      });
      tabContent.querySelectorAll('[data-range-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
          const nextRange = btn.dataset.rangeFilter;
          state.selectedPanelRangeFilter = nextRange;
          state.selectedPanelStatusFilter = nextRange === '전체' ? '진행' : '전체';
          state.scheduleExpandedIndex = null;
          renderScheduleTab();
        });
      });

      document.getElementById('schedule-add')?.addEventListener('click', () => {
        state.scheduleEditingId = null;
        resetScheduleForm();
        state.scheduleEditorOpen = true;
        renderScheduleTab();
      });

      tabContent.querySelectorAll('[data-schedule-expand]').forEach(btn => {
        btn.addEventListener('click', () => {
          const panelKey = btn.dataset.scheduleExpand;
          state.scheduleExpandedIndex = state.scheduleExpandedIndex === panelKey ? null : panelKey;
          renderScheduleTab();
        });
      });

      tabContent.querySelectorAll('[data-schedule-complete]').forEach(chk => {
        chk.addEventListener('click', (e) => e.stopPropagation());
        chk.addEventListener('change', async () => {
          const { id } = parseSchedulePanelKey(chk.dataset.scheduleComplete);
          const row = state.schedules.find(s => Number(s.id) === Number(id));
          if (!row) return;
          if (!canMutateScheduleRow(row)) {
            chk.checked = !!row.is_completed;
            setPortalPlannerFeedback('작성자만 완료 처리 가능합니다.', 'error');
            renderScheduleTab();
            return;
          }
          const nextDone = !row.is_completed;
          const { email, name } = portalAuth();
          const patch = { is_completed: nextDone };
          if (nextDone) {
            patch.completed_at = new Date().toISOString();
            patch.completed_by_email = email;
            patch.completed_by_name = name;
          } else {
            patch.completed_at = null;
            patch.completed_by_email = null;
            patch.completed_by_name = null;
          }
          try {
            try {
              await updateScheduleOnServer(id, patch);
            } catch (e0) {
              await updateScheduleOnServer(id, { is_completed: nextDone });
            }
            await loadSchedulesFromServer();
            setPortalPlannerFeedback(nextDone ? '완료 처리했습니다.' : '진행 상태로 변경했습니다.', 'success');
            renderScheduleTab();
          } catch (e) {
            console.error(e);
            chk.checked = !!row.is_completed;
            setPortalPlannerFeedback(e?.message || '상태 저장에 실패했습니다.', 'error');
            renderScheduleTab();
          }
        });
      });

      tabContent.querySelectorAll('[data-schedule-edit]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const { id } = parseSchedulePanelKey(btn.dataset.scheduleEdit);
          const row = state.schedules.find(s => Number(s.id) === Number(id));
          if (!row) return;
          if (!canMutateScheduleRow(row)) {
            setPortalPlannerFeedback('작성자만 수정할 수 있습니다.', 'error');
            renderScheduleTab();
            return;
          }
          const ui = mapScheduleRowToState(row);
          state.selectedDate = row.schedule_date;
          state.scheduleEditingId = id;
          state.scheduleExpandedIndex = buildSchedulePanelKeyById(id);
          state.scheduleForm = {
            displayMode: ui.displayMode || 'start',
            startTime: ui.startTime || '09:00',
            endTime: ui.endTime || '10:00',
            type: ui.type || '업무',
            app: ui.app || '-',
            scope: ui.scopeCode || 'lab',
            text: ui.text || '',
            description: ui.description || '',
          };
          state.scheduleEditorOpen = true;
          renderScheduleTab();
        });
      });

      tabContent.querySelectorAll('[data-schedule-delete]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const { id } = parseSchedulePanelKey(btn.dataset.scheduleDelete);
          if (!id || !Number.isFinite(id)) return;
          const row = state.schedules.find(s => Number(s.id) === Number(id));
          if (!row || !canMutateScheduleRow(row)) {
            setPortalPlannerFeedback('작성자만 삭제할 수 있습니다.', 'error');
            renderScheduleTab();
            return;
          }
          if (!window.confirm('일정을 삭제할까요?')) return;
          try {
            await deleteScheduleOnServer(id);
            await loadSchedulesFromServer();
            setPortalPlannerFeedback('삭제되었습니다.', 'success');
            state.scheduleExpandedIndex = null;
            renderScheduleTab();
          } catch (err) {
            console.error(err);
            setPortalPlannerFeedback(err?.message || '서버 저장 중 오류가 발생했습니다.', 'error');
            renderScheduleTab();
          }
        });
      });

      document.getElementById('schedule-close')?.addEventListener('click', () => {
        state.scheduleEditorOpen = false;
        state.scheduleEditingId = null;
        renderScheduleTab();
      });
      document.getElementById('schedule-cancel')?.addEventListener('click', () => {
        state.scheduleEditorOpen = false;
        state.scheduleEditingId = null;
        renderScheduleTab();
      });

      document.getElementById('sf-mode')?.addEventListener('change', (e) => {
        state.scheduleForm.displayMode = e.target.value;
        renderScheduleTab();
      });
      document.getElementById('sf-start')?.addEventListener('input', (e) => {
        state.scheduleForm.startTime = e.target.value;
      });
      document.getElementById('sf-end')?.addEventListener('input', (e) => {
        state.scheduleForm.endTime = e.target.value;
      });
      document.getElementById('sf-type')?.addEventListener('change', (e) => {
        state.scheduleForm.type = e.target.value;
      });
      document.getElementById('sf-app')?.addEventListener('change', (e) => {
        state.scheduleForm.app = e.target.value;
      });
      tabContent.querySelectorAll('input[name="schedule-scope"]').forEach(chk => {
        chk.addEventListener('change', (e) => {
          const selected = e.target.value;
          state.scheduleForm.scope = selected;
          tabContent.querySelectorAll('input[name="schedule-scope"]').forEach(other => {
            other.checked = other.value === selected;
            other.closest('.scope-check')?.classList.toggle('active', other.value === selected);
          });
        });
      });
      document.getElementById('sf-text')?.addEventListener('input', (e) => {
        state.scheduleForm.text = e.target.value;
      });
      const scheduleDescEl = document.getElementById('sf-desc');
      autoGrowTextarea(scheduleDescEl);
      scheduleDescEl?.addEventListener('input', (e) => {
        state.scheduleForm.description = e.target.value;
        autoGrowTextarea(e.target);
      });

      document.getElementById('schedule-save')?.addEventListener('click', async () => {
        if (!state.scheduleForm.text.trim()) {
          window.alert('일정 제목을 입력해주세요.');
          return;
        }
        try {
          if (state.scheduleEditingId == null) {
            await createScheduleOnServer(buildSchedulePayloadFromForm(false));
            showPortalDataMessage('저장되었습니다.', 'success', 'planner');
          } else {
            const existing = state.schedules.find(s => Number(s.id) === Number(state.scheduleEditingId));
            const payload = buildSchedulePayloadFromForm(!!existing?.is_completed);
            delete payload.created_by_email;
            delete payload.created_by_name;
            await updateScheduleOnServer(state.scheduleEditingId, payload);
            showPortalDataMessage('수정되었습니다.', 'success', 'planner');
          }
          await loadSchedulesFromServer();
          state.scheduleEditorOpen = false;
          state.scheduleEditingId = null;
          renderScheduleTab();
        } catch (err) {
          console.error(err);
          setPortalPlannerFeedback(err?.message || '서버 저장 중 오류가 발생했습니다.', 'error');
          renderScheduleTab();
        }
      });

      const closeReservationModal = () => {
        state.reservationModalOpen = false;
        state.reservationViewId = null;
        state.reservationEditingId = null;
        state.reservationReadonly = false;
        state.reservationForm = { startTime: '09:00', endTime: '10:00', title: '', description: '' };
        clearReservationDragHighlight();
        renderScheduleTab();
      };

      document.getElementById('reservation-modal-save')?.addEventListener('click', async () => {
        const resName = String(state.selectedReservationResourceName || '').trim();
        if (!resName) {
          setPortalPlannerFeedback('예약 장소를 선택해 주세요.', 'error');
          renderScheduleTab();
          return;
        }
        const st = document.getElementById('rf-modal-start')?.value || '09:00';
        const en = document.getElementById('rf-modal-end')?.value || '10:00';
        const title = (document.getElementById('rf-modal-title')?.value || '').trim();
        const desc = (document.getElementById('rf-modal-desc')?.value || '').trim();
        if (!title) {
          window.alert('예약 제목을 입력해 주세요.');
          return;
        }
        if (timeToMinutes(en) <= timeToMinutes(st)) {
          setPortalPlannerFeedback('종료 시간은 시작 시간 이후여야 합니다.', 'error');
          renderScheduleTab();
          return;
        }
        const { email, name } = portalAuth();
        if (!email) {
          setPortalPlannerFeedback('로그인이 필요합니다.', 'error');
          renderScheduleTab();
          return;
        }
        if (checkReservationOverlap(state.selectedDate, resName, st, en, state.reservationEditingId)) {
          setPortalPlannerFeedback('이미 예약된 시간과 겹칩니다.', 'error');
          renderScheduleTab();
          return;
        }
        try {
          if (state.reservationEditingId == null) {
            if (checkReservationOverlap(state.selectedDate, resName, st, en, null)) {
              setPortalPlannerFeedback('이미 예약된 시간과 겹칩니다.', 'error');
              renderScheduleTab();
              return;
            }
            await createReservationOnServer({
              reserve_date: state.selectedDate,
              start_time: st,
              end_time: en,
              resource_name: resName,
              title,
              description: desc,
              status: 'active',
              created_by_email: email,
              created_by_name: name
            });
            setPortalPlannerFeedback('저장되었습니다.', 'success');
          } else {
            if (checkReservationOverlap(state.selectedDate, resName, st, en, state.reservationEditingId)) {
              setPortalPlannerFeedback('이미 예약된 시간과 겹칩니다.', 'error');
              renderScheduleTab();
              return;
            }
            await updateReservationOnServer(state.reservationEditingId, {
              reserve_date: state.selectedDate,
              start_time: st,
              end_time: en,
              resource_name: resName,
              title,
              description: desc,
              status: 'active'
            });
            setPortalPlannerFeedback('수정되었습니다.', 'success');
          }
          await loadReservationsForMonth(state.calendarMonth);
          applyReservationFilter();
          state.reservationEditingId = null;
          state.reservationViewId = null;
          state.reservationReadonly = false;
          state.reservationModalOpen = false;
          state.reservationForm = { startTime: '09:00', endTime: '10:00', title: '', description: '' };
          renderScheduleTab();
        } catch (err) {
          console.error(err);
          setPortalPlannerFeedback(err?.message || '서버 저장 중 오류가 발생했습니다.', 'error');
          renderScheduleTab();
        }
      });

      document.getElementById('reservation-modal-cancel')?.addEventListener('click', () => {
        closeReservationModal();
      });
      document.getElementById('reservation-modal-close-only')?.addEventListener('click', () => {
        closeReservationModal();
      });
      document.getElementById('reservation-modal-x')?.addEventListener('click', () => {
        closeReservationModal();
      });
      document.getElementById('reservation-modal-backdrop')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeReservationModal();
      });
      document.getElementById('reservation-modal-delete')?.addEventListener('click', async () => {
        const id = state.reservationEditingId;
        if (!id || !window.confirm('예약을 삭제할까요?')) return;
        try {
          await deleteReservationOnServer(id);
          await loadReservationsForMonth(state.calendarMonth);
          applyReservationFilter();
          setPortalPlannerFeedback('삭제되었습니다.', 'success');
          closeReservationModal();
        } catch (err) {
          console.error(err);
          setPortalPlannerFeedback(err?.message || '서버 저장 중 오류가 발생했습니다.', 'error');
          renderScheduleTab();
        }
      });

      populateReservationTimeSelects();
      bindReservationSlotPointer();
    }


    function autoGrowTextarea(el) {
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = Math.max(el.scrollHeight, 140) + 'px';
    }

    function renderOpsTab() {
      const summaryCards = [
        { title: '긴급 확인', value: '1건', desc: '결재 지연 확인 필요', bg: '#fef2f2' },
        { title: '오늘 할 일', value: '4건', desc: '폐수 입력, 검토, 승인', bg: '#fffbeb' },
        { title: '생성 리포트', value: '1개', desc: '월간 운영자료 업데이트', bg: '#ecfdf5' },
      ];

      tabContent.innerHTML = `
        <div class="ops-grid">
          <div class="ops-col">
            <div class="card">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <div>
                  <div style="font-size:18px;font-weight:700;">연구소 운영 통합 정보</div>
                </div>
                <div style="display:flex;gap:8px;">
                  <button class="small-btn">오늘 업무</button>
                  <button class="small-btn dark">월간 결재</button>
                </div>
              </div>
              <div class="summary-grid">
                ${summaryCards.map(card => `
                  <div class="summary-box" style="background:${card.bg}">
                    <div class="summary-title">${card.title}</div>
                    <div class="summary-value">${card.value}</div>
                    <div class="summary-desc">${card.desc}</div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="card">
              <div style="font-size:18px;font-weight:700;margin-bottom:14px;">운영 웹앱</div>
              <div class="app-grid">
                ${apps.map(app => `
                  <div class="app-box" style="background:${app.color}">
                    <div class="app-head">
                      <div class="app-name">${app.name}</div>
                      <div class="app-status">${app.status}</div>
                    </div>
                    <div class="app-desc">${app.desc}</div>
                    <button class="small-btn dark">바로 이동</button>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="ops-col">
            <div class="card">
              <div style="font-size:18px;font-weight:700;margin-bottom:12px;">최근 알림</div>
              <div class="stack-list">
                ${notices.map(notice => `
                  <div class="stack-item">
                    <div style="font-size:12px;color:#64748b;margin-bottom:6px;">${notice.app && notice.app !== '-' ? `${notice.level} · ${notice.app}` : notice.level}</div>
                    <div style="font-weight:600;">${notice.title}</div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="card">
              <div style="font-size:18px;font-weight:700;margin-bottom:12px;">빠른 메뉴</div>
              <div class="stack-list">
                ${['월별 결재 현황', '최근 수거 내역', '운영 관련자료', '저장/삭제 로그'].map(item => `
                  <div class="stack-item" style="font-weight:600;">${item}</div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function formatDateLabel(dateStr) {
      const [, month, day] = dateStr.split('-');
      return `${Number(month)}월 ${Number(day)}일`;
    }

    function escapeHtml(str) {
      return String(str ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function escapeAttr(str) {
      return escapeHtml(str).replaceAll('\n', '&#10;');
    }

    render();
    applyZIndexControl();
