/* portal-home-schedule.js | 일정 데이터/캘린더/이벤트 로직 분리 */

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

    

/* ===== schedule UI helpers ===== */
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

    

/* ===== calendar/editor/schedule renderer ===== */
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

