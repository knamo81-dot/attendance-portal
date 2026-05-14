/* portal-home-reservation.js | 예약 데이터/타임테이블 로직 분리 | company_id 적용 */

function getPortalWorkspaceCompanyId() {
  try {
    const auth = (typeof portalAuth === 'function') ? portalAuth() : {};
    const v = auth.companyId || auth.company_id || auth.company?.id || auth.profile?.company_id ||
      window.currentCompanyId || window.portalCompanyContext?.company_id || window.portalSession?.companyId || window.portalSession?.company_id ||
      new URLSearchParams(window.location.search).get('company_id') || '';
    return String(v || '').trim();
  } catch (_) {
    try { return String(new URLSearchParams(window.location.search).get('company_id') || '').trim(); } catch (__) { return ''; }
  }
}

function requirePortalWorkspaceCompanyId() {
  const companyId = getPortalWorkspaceCompanyId();
  if (!companyId) throw new Error('회사 정보(company_id)를 확인하지 못했습니다. 포탈에서 다시 로그인해 주세요.');
  return companyId;
}

function applyCompanyFilterToQuery(query) {
  const companyId = getPortalWorkspaceCompanyId();
  return companyId ? query.eq('company_id', companyId) : query;
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
        const { data, error } = await applyCompanyFilterToQuery(sb.from('portal_reservations')
          .select('*')
          .gte('reserve_date', first)
          .lte('reserve_date', last)
          .order('reserve_date', { ascending: true })
          .order('start_time', { ascending: true })
          .order('id', { ascending: true }));
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
      if (!sb) throw new Error('로그인이 필요합니다.');
      const row = { ...(payload || {}), company_id: (payload && payload.company_id) || requirePortalWorkspaceCompanyId() };
      const { data, error } = await sb.from('portal_reservations').insert([row]).select('*').single();
      if (error) throw error;
      return data;
    }

    async function updateReservationOnServer(id, patch) {
      const { sb, email } = portalAuth();
      const isAdmin = isPortalAdminRole();
      let q = sb.from('portal_reservations').update(patch).eq('id', id);
      q = applyCompanyFilterToQuery(q);
      if (!isAdmin) q = q.eq('created_by_email', email);
      const { data, error } = await q.select('*').single();
      if (error) throw error;
      return data;
    }

    async function deleteReservationOnServer(id) {
      const { sb, email } = portalAuth();
      const isAdmin = isPortalAdminRole();
      let q = sb.from('portal_reservations').delete().eq('id', id);
      q = applyCompanyFilterToQuery(q);
      if (!isAdmin) q = q.eq('created_by_email', email);
      const { error } = await q;
      if (error) throw error;
    }

    

/* ===== reservation UI / modal / timetable ===== */
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
